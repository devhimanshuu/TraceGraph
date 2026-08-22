/**
 * @tracegraph/shared — synchronization types (Phase 15)
 *
 * Models for incremental sync, git diff intelligence, graph delta,
 * and the living context graph.
 */

// ── Revision model ───────────────────────────────────────────────────────────

export interface Revision {
  /** Full SHA of the commit. */
  sha: string;
  /** Parent commit SHA (null for initial commit). */
  parentSha: string | null;
  /** Branch name. */
  branch: string;
  /** Author info. */
  author: string;
  /** Commit message. */
  message: string;
  /** ISO timestamp. */
  timestamp: string;
  /** When this revision was discovered by TraceGraph. */
  discoveredAt: string;
}

// ── ChangeSet model ──────────────────────────────────────────────────────────

export type FileChangeStatus = 'ADDED' | 'MODIFIED' | 'DELETED' | 'RENAMED' | 'COPIED';

export interface FileChange {
  /** Current path (after rename, if applicable). */
  path: string;
  /** Previous path (for renames/copies). */
  oldPath?: string;
  /** How this file changed. */
  status: FileChangeStatus;
  /** Lines added (where available). */
  linesAdded?: number;
  /** Lines deleted (where available). */
  linesDeleted?: number;
}

export interface ChangeSet {
  /** The source revision (from). */
  fromRevision: string;
  /** The target revision (to). */
  toRevision: string;
  /** Files that are new. */
  addedFiles: FileChange[];
  /** Files that were modified. */
  modifiedFiles: FileChange[];
  /** Files that were deleted. */
  deletedFiles: FileChange[];
  /** Files that were renamed or copied. */
  renamedFiles: FileChange[];
  /** Total file changes. */
  totalChanges: number;
  /** When this changeset was computed. */
  computedAt: string;
}

// ── Graph Delta model ────────────────────────────────────────────────────────

export type DeltaAction = 'ADDED' | 'UPDATED' | 'REMOVED' | 'UNCHANGED';

export interface EntityDelta {
  /** Stable entity ID (e.g. "fn:src/app.ts:MyFunction"). */
  entityId: string;
  /** Node label. */
  label: string;
  /** What happened to this entity. */
  action: DeltaAction;
  /** Previous properties (for updates/removals). */
  previousProps?: Record<string, unknown>;
  /** New properties (for adds/updates). */
  newProps?: Record<string, unknown>;
}

export interface RelationshipDelta {
  /** Source entity ID. */
  fromId: string;
  /** Target entity ID. */
  toId: string;
  /** Relationship type. */
  type: string;
  /** What happened. */
  action: 'ADDED' | 'REMOVED';
  /** Relationship properties. */
  props?: Record<string, unknown>;
}

export interface GraphDelta {
  /** Entity-level changes. */
  entities: EntityDelta[];
  /** Relationship-level changes. */
  relationships: RelationshipDelta[];
  /** Summary counts. */
  summary: {
    entitiesAdded: number;
    entitiesUpdated: number;
    entitiesRemoved: number;
    relationshipsAdded: number;
    relationshipsRemoved: number;
  };
  /** When this delta was computed. */
  computedAt: string;
}

// ── SyncRun model ────────────────────────────────────────────────────────────

export type SyncRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type SyncRunStage =
  | 'CHECKING_REVISION'
  | 'COMPUTING_DIFF'
  | 'PARSING_CHANGES'
  | 'RESOLVING_RELATIONSHIPS'
  | 'APPLYING_GRAPH_DELTA'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'FAILED';

export interface SyncRun {
  id: string;
  repositoryId: string;
  repositoryName: string;
  status: SyncRunStatus;
  stage: SyncRunStage;
  stageLabel: string;
  /** 0–100 estimated percentage. */
  progress: number;
  // ── Revision tracking ──
  fromRevision: string | null;
  toRevision: string | null;
  // ── Change statistics ──
  filesChanged: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesRenamed: number;
  // ── Graph delta statistics ──
  entitiesAdded: number;
  entitiesUpdated: number;
  entitiesRemoved: number;
  relationshipsAdded: number;
  relationshipsRemoved: number;
  // ── Timing ──
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  // ── Errors ──
  errorSummary: string | null;
  errorDetails: SyncError[];
  // ── Metadata ──
  /** Whether the graph was already up-to-date (no changes detected). */
  noChanges: boolean;
}

// ── Sync error ───────────────────────────────────────────────────────────────

export interface SyncError {
  file: string;
  message: string;
  severity: 'error' | 'warning';
}

// ── Repository revision info ─────────────────────────────────────────────────

export interface RepositoryRevision {
  /** Repository application ID. */
  repositoryId: string;
  /** The latest known remote revision. */
  currentRevision: string | null;
  /** The revision the graph currently represents. */
  graphRevision: string | null;
  /** Whether the graph is up-to-date. */
  isSynchronized: boolean;
  /** How many revisions behind (approximate, when available). */
  revisionsBehind: number | null;
  /** Default branch name. */
  defaultBranch: string;
}

// ── API request / response types ─────────────────────────────────────────────

/** POST /api/repositories/:id/sync */
export interface StartSyncRequest {
  /** Optional branch override. */
  branch?: string;
}

/** Response from starting a sync. */
export interface StartSyncResponse {
  syncRun: SyncRun;
}

/** GET /api/repositories/:id/sync-runs */
export interface SyncRunListResponse {
  repositoryId: string;
  syncRuns: SyncRun[];
}

/** GET /api/sync-runs/:id */
export interface SyncRunDetailResponse {
  syncRun: SyncRun;
}

/** GET /api/sync-runs/:id/progress */
export interface SyncProgressResponse {
  syncRunId: string;
  repositoryId: string;
  status: SyncRunStatus;
  stage: SyncRunStage;
  stageLabel: string;
  progress: number;
  fromRevision: string | null;
  toRevision: string | null;
  filesChanged: number;
  entitiesAdded: number;
  entitiesUpdated: number;
  entitiesRemoved: number;
  durationMs: number | null;
  errorSummary: string | null;
  noChanges: boolean;
}

/** GET /api/repositories/:id/revision */
export interface RevisionStatusResponse {
  repositoryId: string;
  currentRevision: string | null;
  graphRevision: string | null;
  isSynchronized: boolean;
  revisionsBehind: number | null;
  defaultBranch: string;
}
