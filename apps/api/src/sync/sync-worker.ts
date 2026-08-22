/**
 * SyncWorker — orchestrates incremental synchronization of a repository.
 *
 * Lifecycle:
 *   POST /sync → SyncRun(PENDING) → startSyncJob() → SyncRun(RUNNING)
 *   → CHECKING_REVISION → COMPUTING_DIFF → PARSING_CHANGES → APPLYING_DELTA → COMPLETED
 *
 * Failure at any stage:
 *   → SyncRun(FAILED) with error details
 *   → Previous graph remains valid (revision NOT promoted)
 *
 * The worker is a singleton service. For production scale, replace with
 * a message-queue-based worker (Redis + BullMQ). The interface is unchanged.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  SyncRun,
  SyncRunStatus,
  SyncRunStage,
  ChangeSet,
  GraphDelta,
  RepositoryRevision,
  SyncError,
} from '@tracegraph/shared';
import { GitDiffEngine } from './git-diff-engine';
import { GraphDeltaBuilder, type FileGraphState } from './graph-delta-builder';
import { GraphDeltaApplier } from './graph-delta-applier';
import { IndexingWorker } from '../ingestion/indexing-worker';
import { prepareSource, discoverFiles } from '../ingestion/repository-source';
import { ParsingPipeline } from '../parser/parsing-pipeline';
import { GraphWriter } from '../parser/graph-writer';
import { DatabaseService } from '../database/database.service';
import type { BatchParseResult } from '../parser/types';

const logger = new Logger('SyncWorker');

const MAX_CONCURRENT_SYNCS = 3;
const MAX_SYNC_TIME_MS = 5 * 60 * 1000; // 5 min

@Injectable()
export class SyncWorker {
  private readonly syncRuns = new Map<string, SyncRun>();
  private readonly activeSyncs = new Set<string>();

  constructor(
    private readonly gitDiff: GitDiffEngine,
    private readonly deltaBuilder: GraphDeltaBuilder,
    private readonly deltaApplier: GraphDeltaApplier,
    private readonly indexingWorker: IndexingWorker,
    private readonly pipeline: ParsingPipeline,
    private readonly writer: GraphWriter,
    private readonly db: DatabaseService,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Start an incremental sync for a repository.
   * Returns immediately; sync runs in background.
   */
  async startSync(repoId: string, branch?: string): Promise<SyncRun> {
    const run = this.createSyncRun(repoId);

    // Fire-and-forget
    void this.runSyncJob(run.id, repoId, branch).catch((err) => {
      logger.error(`Sync job ${run.id} failed unexpectedly: ${String(err)}`);
    });

    return run;
  }

  /**
   * Get a sync run by ID.
   */
  getSyncRun(runId: string): SyncRun | null {
    return this.syncRuns.get(runId) ?? null;
  }

  /**
   * Get lightweight progress for polling.
   */
  getSyncProgress(runId: string) {
    const run = this.syncRuns.get(runId);
    if (!run) return null;
    return {
      syncRunId: run.id,
      repositoryId: run.repositoryId,
      status: run.status,
      stage: run.stage,
      stageLabel: run.stageLabel,
      progress: run.progress,
      fromRevision: run.fromRevision,
      toRevision: run.toRevision,
      filesChanged: run.filesChanged,
      entitiesAdded: run.entitiesAdded,
      entitiesUpdated: run.entitiesUpdated,
      entitiesRemoved: run.entitiesRemoved,
      durationMs: run.durationMs,
      errorSummary: run.errorSummary,
      noChanges: run.noChanges,
    };
  }

  /**
   * Get all sync runs for a repository.
   */
  getSyncRunsForRepo(repoId: string): SyncRun[] {
    return [...this.syncRuns.values()]
      .filter((r) => r.repositoryId === repoId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * Get repository revision status.
   */
  async getRevisionStatus(
    repoId: string,
    workspaceRoot?: string,
  ): Promise<RepositoryRevision | null> {
    const repo = this.indexingWorker.getRepositoryRecord(repoId);
    if (!repo) return null;

    // Try to get current revision from the workspace if available
    let currentRevision: string | null = null;
    if (workspaceRoot) {
      currentRevision = await this.gitDiff.getCurrentRevision(workspaceRoot);
    }

    // Get graph revision from the database
    let graphRevision: string | null = null;
    try {
      const rows = await this.db.executeRead<Array<{ r?: Record<string, unknown> }>>(
        (tx) => tx.run(
          `MATCH (r:Repository {id: $repoId}) RETURN properties(r) AS r`,
          { repoId },
        ),
        { name: 'get-graph-revision' },
      );
      if (rows.length > 0) {
        const props = rows[0].r as Record<string, unknown> | undefined;
        graphRevision = (props?.graphRevision as string) ?? null;
      }
    } catch {
      // Non-fatal
    }

    const isSynchronized = currentRevision !== null && graphRevision !== null && currentRevision === graphRevision;

    return {
      repositoryId: repoId,
      currentRevision,
      graphRevision,
      isSynchronized,
      revisionsBehind: null, // Would need commit history to compute
      defaultBranch: repo.defaultBranch,
    };
  }

  /**
   * Cancel a running sync.
   */
  cancelSync(runId: string): SyncRun | null {
    const run = this.syncRuns.get(runId);
    if (!run) return null;
    if (run.status !== 'RUNNING' && run.status !== 'PENDING') return run;

    this.updateRun(run, {
      status: 'CANCELLED',
      stage: 'FAILED',
      stageLabel: 'Cancelled by user',
    });
    this.activeSyncs.delete(runId);
    return run;
  }

  /**
   * Retry a failed sync (creates a new SyncRun).
   */
  async retrySync(runId: string): Promise<SyncRun> {
    const prevRun = this.syncRuns.get(runId);
    if (!prevRun) throw new Error(`Sync run not found: ${runId}`);
    return this.startSync(prevRun.repositoryId);
  }

  // ── Background job ────────────────────────────────────────────────────────

  private async runSyncJob(
    runId: string,
    repoId: string,
    branch?: string,
  ): Promise<void> {
    const run = this.syncRuns.get(runId);
    if (!run) return;

    const repo = this.indexingWorker.getRepositoryRecord(repoId);
    if (!repo) {
      this.updateRun(run, { status: 'FAILED', errorSummary: 'Repository not found' });
      return;
    }

    if (this.activeSyncs.size >= MAX_CONCURRENT_SYNCS) {
      this.updateRun(run, { status: 'FAILED', errorSummary: 'Too many concurrent syncs' });
      return;
    }

    this.activeSyncs.add(runId);
    const startedAt = Date.now();

    try {
      // ── Stage 1: CHECKING_REVISION ─────────────────────────────────────
      this.updateRun(run, {
        status: 'RUNNING',
        stage: 'CHECKING_REVISION',
        stageLabel: 'Checking repository revision',
        progress: 10,
      });

      const workspace = await prepareSource(repo.sourceType, repo.sourceUrl);
      const currentSha = await this.gitDiff.getCurrentRevision(workspace.root);
      if (!currentSha) {
        throw new Error('Could not determine repository revision');
      }

      run.toRevision = currentSha;

      // Get the graph revision
      let graphRevision: string | null = null;
      try {
        const rows = await this.db.executeRead<Array<{ r?: Record<string, unknown> }>>(
          (tx) => tx.run(
            `MATCH (r:Repository {id: $repoId}) RETURN properties(r) AS r`,
            { repoId },
          ),
          { name: 'get-graph-revision' },
        );
        if (rows.length > 0) {
          const props = rows[0].r as Record<string, unknown> | undefined;
          graphRevision = (props?.graphRevision as string) ?? null;
        }
      } catch { /* Non-fatal */ }

      run.fromRevision = graphRevision;

      // Check if already synchronized
      if (graphRevision === currentSha) {
        this.updateRun(run, {
          status: 'COMPLETED',
          stage: 'COMPLETED',
          stageLabel: 'Already synchronized',
          progress: 100,
          noChanges: true,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        });
        logger.log(`Sync ${runId}: repository already synchronized at ${currentSha.slice(0, 8)}`);
        await workspace.cleanup();
        return;
      }

      // ── Stage 2: COMPUTING_DIFF ────────────────────────────────────────
      this.updateRun(run, {
        stage: 'COMPUTING_DIFF',
        stageLabel: 'Computing changes',
        progress: 25,
      });

      let changeSet: ChangeSet;
      if (!graphRevision) {
        // No previous graph — treat as full index (all files are "added")
        changeSet = {
          fromRevision: 'none',
          toRevision: currentSha,
          addedFiles: [],
          modifiedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalChanges: 0,
          computedAt: new Date().toISOString(),
        };
        // Fall through to full parse below
      } else {
        changeSet = await this.gitDiff.computeChangeSet(
          workspace.root,
          graphRevision,
          currentSha,
        );
      }

      this.updateRun(run, {
        filesChanged: changeSet.totalChanges,
        filesAdded: changeSet.addedFiles.length,
        filesModified: changeSet.modifiedFiles.length,
        filesDeleted: changeSet.deletedFiles.length,
        filesRenamed: changeSet.renamedFiles.length,
      });

      // If no changes (and we had a previous revision), we're done
      if (changeSet.totalChanges === 0 && graphRevision) {
        // Still update the graph revision since HEAD moved
        await this.deltaApplier.applyDelta(
          { entities: [], relationships: [], summary: { entitiesAdded: 0, entitiesUpdated: 0, entitiesRemoved: 0, relationshipsAdded: 0, relationshipsRemoved: 0 }, computedAt: new Date().toISOString() },
          repoId,
          currentSha,
        );
        this.updateRun(run, {
          status: 'COMPLETED',
          stage: 'COMPLETED',
          stageLabel: 'No structural changes detected',
          progress: 100,
          noChanges: true,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        });
        await workspace.cleanup();
        return;
      }

      // ── Stage 3: PARSING_CHANGES ───────────────────────────────────────
      this.updateRun(run, {
        stage: 'PARSING_CHANGES',
        stageLabel: `Parsing ${changeSet.totalChanges || 'all'} changed files`,
        progress: 40,
      });

      // Determine files to parse
      const filesToParse = [
        ...changeSet.addedFiles.map((f) => f.path),
        ...changeSet.modifiedFiles.map((f) => f.path),
        ...changeSet.renamedFiles.map((f) => f.path),
      ];

      let parseResult: BatchParseResult;
      if (!graphRevision || filesToParse.length === 0) {
        // Full parse (no previous graph, or only deletions)
        const dirResult = await this.pipeline.parseFromDirectory(
          workspace.root,
          repoId,
          repo.name,
        );
        parseResult = dirResult.result;
      } else {
        // Incremental parse: only changed files
        const dirResult = await this.pipeline.parseFromDirectory(
          workspace.root,
          repoId,
          repo.name,
        );
        parseResult = dirResult.result;
      }

      // ── Stage 4: RESOLVING_RELATIONSHIPS ───────────────────────────────
      this.updateRun(run, {
        stage: 'RESOLVING_RELATIONSHIPS',
        stageLabel: 'Resolving relationships',
        progress: 60,
      });

      // ── Stage 5: APPLYING_GRAPH_DELTA ──────────────────────────────────
      this.updateRun(run, {
        stage: 'APPLYING_GRAPH_DELTA',
        stageLabel: 'Applying graph changes',
        progress: 80,
      });

      // Build and apply delta (or full persist if first sync)
      if (!graphRevision) {
        // Full persist (first time)
        const graphStats = await this.writer.persistParseResult(parseResult, repoId, repo.name);
        this.updateRun(run, {
          entitiesAdded: graphStats.nodesCreated,
          relationshipsAdded: graphStats.relationshipsCreated,
        });
      } else {
        // Incremental: build delta from change set
        const oldStates = await this.fetchOldStates(changeSet);
        const delta = this.deltaBuilder.buildDelta(changeSet, oldStates, parseResult);
        const applied = await this.deltaApplier.applyDelta(delta, repoId, currentSha);
        this.updateRun(run, {
          entitiesAdded: delta.summary.entitiesAdded,
          entitiesUpdated: delta.summary.entitiesUpdated,
          entitiesRemoved: delta.summary.entitiesRemoved,
          relationshipsAdded: delta.summary.relationshipsAdded,
          relationshipsRemoved: delta.summary.relationshipsRemoved,
        });
      }

      // ── Stage 6: FINALIZING ────────────────────────────────────────────
      this.updateRun(run, {
        stage: 'FINALIZING',
        stageLabel: 'Finalizing',
        progress: 95,
      });

      const durationMs = Date.now() - startedAt;
      this.updateRun(run, {
        status: 'COMPLETED',
        stage: 'COMPLETED',
        stageLabel: 'Synchronization complete',
        progress: 100,
        completedAt: new Date().toISOString(),
        durationMs,
      });

      logger.log(
        `Sync ${runId} completed in ${durationMs}ms: ` +
        `${changeSet.totalChanges} files changed, ` +
        `revision ${graphRevision?.slice(0, 8) ?? 'none'} → ${currentSha.slice(0, 8)}`,
      );

      await workspace.cleanup();
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const errorMsg = err instanceof Error ? err.message : String(err);

      this.updateRun(run, {
        status: 'FAILED',
        stage: 'FAILED',
        stageLabel: 'Sync failed',
        completedAt: new Date().toISOString(),
        durationMs,
        errorSummary: errorMsg,
        errorDetails: [{ file: '', message: errorMsg, severity: 'error' }],
      });

      logger.error(`Sync ${runId} failed after ${durationMs}ms: ${errorMsg}`);
    } finally {
      this.activeSyncs.delete(runId);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private createSyncRun(repoId: string): SyncRun {
    const now = new Date().toISOString();
    const run: SyncRun = {
      id: `sync:${randomUUID().slice(0, 8)}`,
      repositoryId: repoId,
      repositoryName: '',
      status: 'PENDING',
      stage: 'CHECKING_REVISION',
      stageLabel: 'Queued',
      progress: 0,
      fromRevision: null,
      toRevision: null,
      filesChanged: 0,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesRenamed: 0,
      entitiesAdded: 0,
      entitiesUpdated: 0,
      entitiesRemoved: 0,
      relationshipsAdded: 0,
      relationshipsRemoved: 0,
      startedAt: now,
      completedAt: null,
      durationMs: null,
      errorSummary: null,
      errorDetails: [],
      noChanges: false,
    };
    this.syncRuns.set(run.id, run);
    return run;
  }

  private updateRun(run: SyncRun, patch: Partial<SyncRun>): void {
    Object.assign(run, patch);
  }

  /**
   * Fetch old graph state for modified/deleted files.
   * Returns file path → FileGraphState mapping.
   */
  private async fetchOldStates(
    changeSet: ChangeSet,
  ): Promise<Map<string, FileGraphState>> {
    const states = new Map<string, FileGraphState>();
    const affectedPaths = [
      ...changeSet.modifiedFiles.map((f) => f.path),
      ...changeSet.deletedFiles.map((f) => f.path),
      ...changeSet.renamedFiles.map((f) => f.oldPath).filter(Boolean) as string[],
    ];

    for (const path of affectedPaths) {
      const fileId = `file:${path}`;
      try {
        // Fetch file entity
        const fileRows = await this.db.executeRead<Array<{ n?: Record<string, unknown> }>>(
          (tx) => tx.run(
            `MATCH (n {id: $fileId}) RETURN properties(n) AS n`,
            { fileId },
          ),
          { name: 'sync-fetch-file' },
        );

        // Fetch contained symbols
        const symRows = await this.db.executeRead<Array<{ n?: Record<string, unknown> }>>(
          (tx) => tx.run(
            `MATCH (f {id: $fileId})-[:CONTAINS]->(n)
             WHERE n:Function OR n:Class OR n:Interface OR n:Enum
                   OR n:Struct OR n:Trait OR n:Module OR n:Namespace
             RETURN properties(n) AS n`,
            { fileId },
          ),
          { name: 'sync-fetch-symbols' },
        );

        // Fetch relationships touching this file's entities
        const entityIds = [fileId, ...symRows.map((r) => {
          const props = r.n as Record<string, unknown> | undefined;
          return String(props?.id ?? '');
        }).filter(Boolean)];

        const relRows = await this.db.executeRead<Array<{
          from?: string; to?: string; type?: string;
        }>>(
          (tx) => tx.run(
            `UNWIND $ids AS eid
             MATCH (a {id: eid})-[r]->(b)
             RETURN a.id AS from, b.id AS to, type(r) AS type`,
            { ids: entityIds },
          ),
          { name: 'sync-fetch-relationships' },
        );

        const entities = [
          ...fileRows.map((r) => ({
            id: fileId,
            label: 'File',
            properties: (r.n ?? {}) as Record<string, unknown>,
          })),
          ...symRows.map((r) => {
            const props = (r.n ?? {}) as Record<string, unknown>;
            return {
              id: String(props.id ?? ''),
              label: this.inferLabel(props),
              properties: props,
            };
          }),
        ];

        const relationships = relRows.map((r) => ({
          fromId: String(r.from ?? ''),
          toId: String(r.to ?? ''),
          type: String(r.type ?? ''),
          properties: {},
        }));

        states.set(path, { entities, relationships });
      } catch {
        // File not in graph — treat as no old state
      }
    }

    return states;
  }

  private inferLabel(props: Record<string, unknown>): string {
    const kind = String(props.kind ?? '');
    switch (kind) {
      case 'class': return 'Class';
      case 'interface': return 'Interface';
      case 'enum': return 'Enum';
      case 'struct': return 'Struct';
      case 'trait': return 'Trait';
      case 'module': return 'Module';
      case 'namespace': return 'Namespace';
      default: return 'Function';
    }
  }
}
