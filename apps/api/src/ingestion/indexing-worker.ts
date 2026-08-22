/**
 * IndexingWorker — runs indexing jobs in the background.
 *
 * Architecture:
 *   POST /repositories → create repo + IndexRun(PENDING) → enqueue job
 *   IndexWorker picks up job → IndexRun(RUNNING) → stages → IndexRun(COMPLETED|FAILED)
 *
 * The worker is intentionally simple (in-memory queue). For production scale,
 * swap to Redis + BullMQ. The interface stays the same.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  IndexRun,
  IndexRunStatus,
  IndexRunStage,
  IndexError,
  IndexDiagnostic,
  LanguageSummary,
  RepositoryRecord,
  RepositorySourceType,
} from '@tracegraph/shared';
import {
  prepareSource,
  discoverFiles,
  type DiscoveredFile,
  type SourceWorkspace,
} from './repository-source';
import { ParsingPipeline } from '../parser/parsing-pipeline';
import { GraphWriter } from '../parser/graph-writer';
import type { BatchParseResult, ParsedFileMeta } from '../parser/types';
import { detectLanguage } from '../parser/language';
import { ProgrammingLanguage } from '../parser/types';

const logger = new Logger('IndexingWorker');

/** Limits */
const MAX_CONCURRENT_JOBS = 3;
const MAX_INDEXING_TIME_MS = 5 * 60 * 1000; // 5 min
const BATCH_SIZE = 100;

// ── In-memory store (swap for DB later) ──────────────────────────────────────

interface RepoStore {
  id: string;
  name: string;
  fullName: string;
  sourceType: RepositorySourceType;
  sourceUrl: string;
  defaultBranch: string;
  status: IndexRunStatus;
  description: string;
  language: string;
  fileCount: number;
  detectedLanguages: LanguageSummary[];
  createdAt: string;
  updatedAt: string;
  lastIndexedAt: string | null;
  lastSuccessfulIndexRunId: string | null;
  workspace?: SourceWorkspace;
}

@Injectable()
export class IndexingWorker {
  private readonly repos = new Map<string, RepoStore>();
  private readonly runs = new Map<string, IndexRun>();
  private readonly activeJobs = new Set<string>();
  private readonly runQueues = new Map<string, string[]>(); // repoId → [runId]
  private parseResults = new Map<string, BatchParseResult>(); // runId → result

  constructor(
    private readonly pipeline: ParsingPipeline,
    private readonly writer: GraphWriter,
  ) {}

  // ── Repository CRUD ──────────────────────────────────────────────────────

  async createRepository(
    sourceType: RepositorySourceType,
    sourceUrl: string,
  ): Promise<{ repository: RepositoryRecord; indexRun: IndexRun }> {
    const now = new Date().toISOString();
    const repoId = `repo-app:${randomUUID().slice(0, 8)}`;

    // Parse URL to derive name
    const name = this.extractRepoName(sourceType, sourceUrl);

    const repo: RepoStore = {
      id: repoId,
      name,
      fullName: name,
      sourceType,
      sourceUrl,
      defaultBranch: 'main',
      status: 'PENDING',
      description: '',
      language: '',
      fileCount: 0,
      detectedLanguages: [],
      createdAt: now,
      updatedAt: now,
      lastIndexedAt: null,
      lastSuccessfulIndexRunId: null,
    };
    this.repos.set(repoId, repo);

    // Create initial index run
    const run = this.createRun(repoId, name);

    logger.log(`Created repository ${repoId} (${name}), index run ${run.id}`);
    return { repository: this.toRepoRecord(repo), indexRun: run };
  }

  async listRepositories(): Promise<RepositoryRecord[]> {
    return [...this.repos.values()].map((r) => this.toRepoRecord(r));
  }

  async getRepository(id: string): Promise<{ repository: RepositoryRecord; latestRun: IndexRun | null } | null> {
    const repo = this.repos.get(id);
    if (!repo) return null;
    const runs = this.getRunsForRepo(id);
    const latestRun = runs.length > 0 ? runs[0] : null;
    return { repository: this.toRepoRecord(repo), latestRun };
  }

    /**
   * Get raw repository record for sync operations.
   */
  getRepositoryRecord(repoId: string): RepoStore | undefined {
    return this.repos.get(repoId);
  }

  // ── Index run management ─────────────────────────────────────────────────

  async startIndex(
    repoId: string,
    branch?: string,
  ): Promise<IndexRun> {
    const repo = this.repos.get(repoId);
    if (!repo) throw new Error(`Repository not found: ${repoId}`);

    // Prevent duplicate concurrent runs
    const activeRuns = this.getRunsForRepo(repoId).filter(
      (r) => r.status === 'RUNNING' || r.status === 'PENDING',
    );
    if (activeRuns.length > 0) {
      throw new Error('Index already running for this repository');
    }

    // Enforce concurrency limit
    if (this.activeJobs.size >= MAX_CONCURRENT_JOBS) {
      throw new Error('Too many concurrent indexing jobs. Please try again later.');
    }

    const run = this.createRun(repoId, repo.name);
    if (branch) {
      repo.defaultBranch = branch;
    }

    // Fire-and-forget
    void this.runIndexJob(run.id).catch((err) => {
      logger.error(`Index job ${run.id} failed unexpectedly: ${String(err)}`);
    });

    return run;
  }

  async getIndexRun(runId: string): Promise<IndexRun | null> {
    return this.runs.get(runId) ?? null;
  }

  async getIndexProgress(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return null;
    return {
      runId: run.id,
      repositoryId: run.repositoryId,
      status: run.status,
      stage: run.stage,
      stageLabel: run.stageLabel,
      progress: run.progress,
      filesDiscovered: run.filesDiscovered,
      filesParsed: run.filesParsed,
      filesFailed: run.filesFailed,
      entitiesExtracted: run.entitiesExtracted,
      relationshipsExtracted: run.relationshipsExtracted,
      durationMs: run.durationMs,
      errorSummary: run.errorSummary,
    };
  }

  async getIndexDiagnostics(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return null;
    return {
      runId: run.id,
      total: run.diagnostics.length,
      diagnostics: run.diagnostics,
    };
  }

  async cancelIndex(runId: string): Promise<IndexRun | null> {
    const run = this.runs.get(runId);
    if (!run) return null;
    if (run.status !== 'RUNNING' && run.status !== 'PENDING') return run;

    this.updateRun(run, {
      status: 'CANCELLED',
      stage: 'FAILED',
      stageLabel: 'Cancelled by user',
    });
    this.activeJobs.delete(runId);
    return run;
  }

  async retryIndex(runId: string): Promise<IndexRun> {
    const prevRun = this.runs.get(runId);
    if (!prevRun) throw new Error(`Index run not found: ${runId}`);

    const repo = this.repos.get(prevRun.repositoryId);
    if (!repo) throw new Error(`Repository not found: ${prevRun.repositoryId}`);

    return this.startIndex(prevRun.repositoryId);
  }

  getRunsForRepo(repoId: string): IndexRun[] {
    return [...this.runs.values()]
      .filter((r) => r.repositoryId === repoId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  getParseResult(runId: string): BatchParseResult | undefined {
    return this.parseResults.get(runId);
  }

  // ── Job execution ────────────────────────────────────────────────────────

  private async runIndexJob(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;

    const repo = this.repos.get(run.repositoryId);
    if (!repo) return;

    this.activeJobs.add(runId);
    const startedAt = Date.now();

    try {
      this.updateRun(run, {
        status: 'RUNNING',
        stage: 'PREPARING',
        stageLabel: 'Preparing repository source',
        progress: 5,
      });

      // Check timeout
      const checkTimeout = () => {
        if (Date.now() - startedAt > MAX_INDEXING_TIME_MS) {
          throw new Error('Indexing timed out');
        }
      };

      // 1. Prepare source workspace
      checkTimeout();
      const workspace = await prepareSource(repo.sourceType, repo.sourceUrl);
      repo.workspace = workspace;
      repo.defaultBranch = workspace.defaultBranch;
      repo.description = workspace.description;
      repo.language = workspace.language;

      this.updateRun(run, {
        stage: 'DISCOVERING_FILES',
        stageLabel: 'Discovering files',
        progress: 15,
      });

      // 2. Discover files
      checkTimeout();
      const files = await discoverFiles(workspace.root);
      repo.fileCount = files.length;

      this.updateRun(run, {
        filesDiscovered: files.length,
        stage: 'PARSING',
        stageLabel: `Parsing ${files.length} files`,
        progress: 25,
      });

      // 3. Parse via the existing pipeline
      checkTimeout();
      const { result: parseResult, graphStats } = await this.pipeline.parseFromTarball(
        Buffer.alloc(0), // We'll use a different path
        run.repositoryId,
        repo.name,
        (stage, detail) => {
          // Map pipeline stages to index run stages
          let indexStage: IndexRunStage = 'PARSING';
          let progress = 40;
          if (stage === 'extracting') { indexStage = 'PREPARING'; progress = 10; }
          else if (stage === 'discovering') { indexStage = 'DISCOVERING_FILES'; progress = 20; }
          else if (stage === 'parsing') { indexStage = 'PARSING'; progress = 50; }
          else if (stage === 'resolving') { indexStage = 'RESOLVING_RELATIONSHIPS'; progress = 70; }
          else if (stage === 'persisting') { indexStage = 'WRITING_GRAPH'; progress = 85; }

          this.updateRun(run, {
            stage: indexStage,
            stageLabel: detail ?? stage,
            progress,
          });
        },
      );

      // Since parseFromTarball expects a tarball, let's use parseFromDirectory instead
      // Re-parse from the workspace root
      const dirResult = await this.pipeline.parseFromDirectory(
        workspace.root,
        run.repositoryId,
        repo.name,
      );

      const result = dirResult.result;
      const stats = dirResult.graphStats;

      // 4. Compute language distribution
      const langMap = new Map<string, number>();
      for (const file of result.files) {
        const lang = file.language;
        langMap.set(lang, (langMap.get(lang) ?? 0) + 1);
      }
      const totalFiles = result.files.length;
      const detectedLanguages: LanguageSummary[] = [...langMap.entries()]
        .map(([language, fileCount]) => ({
          language,
          fileCount,
          percentage: totalFiles > 0 ? Math.round((fileCount / totalFiles) * 100) : 0,
        }))
        .sort((a, b) => b.fileCount - a.fileCount);

      // 5. Collect diagnostics
      const diagnostics: IndexDiagnostic[] = result.diagnostics.map((d) => ({
        file: d.file,
        language: d.language,
        severity: d.severity as IndexDiagnostic['severity'],
        message: d.message,
        line: d.line,
        parser: d.parser,
      }));

      // 6. Collect errors
      const errors: IndexError[] = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => ({ file: d.file, message: d.message, severity: 'error' as const }));

      // 7. Finalize
      const durationMs = Date.now() - startedAt;

      repo.status = 'COMPLETED';
      repo.lastIndexedAt = new Date().toISOString();
      repo.lastSuccessfulIndexRunId = run.id;
      repo.detectedLanguages = detectedLanguages;

      this.updateRun(run, {
        status: 'COMPLETED',
        stage: 'COMPLETED',
        stageLabel: 'Indexing complete',
        progress: 100,
        filesParsed: result.stats.filesParsed,
        filesSkipped: result.stats.filesSkipped,
        filesFailed: result.stats.filesFailed,
        entitiesExtracted: result.stats.entitiesExtracted,
        relationshipsExtracted: result.stats.relationshipsExtracted,
        entitiesWritten: stats.nodesCreated,
        relationshipsWritten: stats.relationshipsCreated,
        languagesDetected: detectedLanguages.length,
        languageDistribution: detectedLanguages,
        completedAt: new Date().toISOString(),
        durationMs,
        diagnostics,
        errorSummary: errors.length > 0
          ? `${errors.length} file(s) failed to parse`
          : null,
        errorDetails: errors,
      });

      // Store parse result for potential reuse
      this.parseResults.set(runId, result);

      logger.log(
        `Index run ${runId} completed in ${durationMs}ms: ` +
        `${result.stats.filesParsed} files, ` +
        `${result.stats.entitiesExtracted} entities, ` +
        `${result.stats.relationshipsExtracted} relationships`,
      );
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const errorMsg = err instanceof Error ? err.message : String(err);

      repo.status = 'FAILED';

      this.updateRun(run, {
        status: 'FAILED',
        stage: 'FAILED',
        stageLabel: 'Indexing failed',
        progress: run.progress,
        completedAt: new Date().toISOString(),
        durationMs,
        errorSummary: errorMsg,
        errorDetails: [{ file: '', message: errorMsg, severity: 'error' }],
      });

      logger.error(`Index run ${runId} failed after ${durationMs}ms: ${errorMsg}`);
    } finally {
      this.activeJobs.delete(runId);

      // Cleanup workspace
      if (repo.workspace) {
        try {
          await repo.workspace.cleanup();
        } catch {
          logger.warn(`Failed to cleanup workspace for ${repo.id}`);
        }
        delete repo.workspace;
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private createRun(repoId: string, repoName: string): IndexRun {
    const now = new Date().toISOString();
    const run: IndexRun = {
      id: `run:${randomUUID().slice(0, 8)}`,
      repositoryId: repoId,
      repositoryName: repoName,
      status: 'PENDING',
      stage: 'PREPARING',
      stageLabel: 'Queued',
      progress: 0,
      filesDiscovered: 0,
      filesParsed: 0,
      filesSkipped: 0,
      filesFailed: 0,
      entitiesExtracted: 0,
      relationshipsExtracted: 0,
      entitiesWritten: 0,
      relationshipsWritten: 0,
      languagesDetected: 0,
      languageDistribution: [],
      startedAt: now,
      completedAt: null,
      durationMs: null,
      errorSummary: null,
      errorDetails: [],
      diagnostics: [],
    };
    this.runs.set(run.id, run);
    return run;
  }

  private updateRun(run: IndexRun, patch: Partial<IndexRun>): void {
    Object.assign(run, patch);
  }

  private toRepoRecord(repo: RepoStore): RepositoryRecord {
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.fullName,
      sourceType: repo.sourceType,
      sourceUrl: repo.sourceUrl,
      defaultBranch: repo.defaultBranch,
      status: repo.status,
      description: repo.description,
      language: repo.language,
      fileCount: repo.fileCount,
      detectedLanguages: repo.detectedLanguages,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      lastIndexedAt: repo.lastIndexedAt,
      lastSuccessfulIndexRunId: repo.lastSuccessfulIndexRunId,
    };
  }

  private extractRepoName(sourceType: RepositorySourceType, sourceUrl: string): string {
    if (sourceType === 'GITHUB_PUBLIC') {
      const parsed = parseGithubUrl(sourceUrl);
      return parsed ? `${parsed.owner}/${parsed.repo}` : sourceUrl;
    }
    // Local: use last directory name
    const parts = sourceUrl.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] ?? sourceUrl;
  }
}

// Re-export parseGithubUrl from repository-source
import { parseGithubUrl } from './repository-source';
