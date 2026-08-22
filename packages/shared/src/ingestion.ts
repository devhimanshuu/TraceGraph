/**
 * @tracegraph/shared — ingestion & indexing types
 *
 * Domain model for the real-repository ingestion pipeline (Phase 14).
 * These types are shared between the NestJS backend and the Next.js frontend.
 */

// ── Repository source types ──────────────────────────────────────────────────

export type RepositorySourceType = 'GITHUB_PUBLIC' | 'LOCAL';

// ── Index run status ─────────────────────────────────────────────────────────

export type IndexRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type IndexRunStage =
  | 'PREPARING'
  | 'DISCOVERING_FILES'
  | 'PARSING'
  | 'RESOLVING_RELATIONSHIPS'
  | 'WRITING_GRAPH'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'FAILED';

// ── File classification ──────────────────────────────────────────────────────

export type FileClassification =
  | 'SOURCE'
  | 'TEST'
  | 'CONFIG'
  | 'DOCUMENTATION'
  | 'GENERATED'
  | 'BINARY'
  | 'UNKNOWN';

// ── Repository record (application-level) ────────────────────────────────────

export interface RepositoryRecord {
  id: string;
  name: string;
  fullName: string;
  sourceType: RepositorySourceType;
  sourceUrl: string;
  defaultBranch: string;
  /** Current overall status. */
  status: IndexRunStatus;
  description: string;
  /** Detected primary language. */
  language: string;
  /** Total files discovered during last index. */
  fileCount: number;
  /** Detected languages from last index. */
  detectedLanguages: LanguageSummary[];
  createdAt: string;
  updatedAt: string;
  lastIndexedAt: string | null;
  lastSuccessfulIndexRunId: string | null;
}

// ── Index run record ─────────────────────────────────────────────────────────

export interface IndexRun {
  id: string;
  repositoryId: string;
  repositoryName: string;
  status: IndexRunStatus;
  stage: IndexRunStage;
  stageLabel: string;
  /** 0–100 estimated percentage. */
  progress: number;
  // ── Statistics ──
  filesDiscovered: number;
  filesParsed: number;
  filesSkipped: number;
  filesFailed: number;
  entitiesExtracted: number;
  relationshipsExtracted: number;
  entitiesWritten: number;
  relationshipsWritten: number;
  languagesDetected: number;
  /** Language distribution breakdown. */
  languageDistribution: LanguageSummary[];
  // ── Timing ──
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  // ── Errors ──
  errorSummary: string | null;
  errorDetails: IndexError[];
  // ── Diagnostics ──
  diagnostics: IndexDiagnostic[];
}

// ── Language summary ─────────────────────────────────────────────────────────

export interface LanguageSummary {
  language: string;
  fileCount: number;
  percentage: number;
}

// ── Index error ──────────────────────────────────────────────────────────────

export interface IndexError {
  file: string;
  message: string;
  severity: 'error' | 'warning';
}

// ── Index diagnostic ─────────────────────────────────────────────────────────

export interface IndexDiagnostic {
  file: string;
  language: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  parser: string;
}

// ── API request / response types ─────────────────────────────────────────────

/** POST /api/repositories */
export interface CreateRepositoryRequest {
  sourceType: RepositorySourceType;
  sourceUrl: string;
}

/** Response from creating a repository. */
export interface CreateRepositoryResponse {
  repository: RepositoryRecord;
  indexRun: IndexRun;
}

/** POST /api/repositories/:id/index */
export interface StartIndexRequest {
  /** Override branch (optional). */
  branch?: string;
}

/** Response from starting indexing. */
export interface StartIndexResponse {
  indexRun: IndexRun;
}

/** GET /api/repositories/:id */
export interface RepositoryDetailResponse {
  repository: RepositoryRecord;
  latestRun: IndexRun | null;
}

/** GET /api/index-runs/:id/progress — lightweight poll endpoint. */
export interface IndexProgressResponse {
  runId: string;
  repositoryId: string;
  status: IndexRunStatus;
  stage: IndexRunStage;
  stageLabel: string;
  progress: number;
  filesDiscovered: number;
  filesParsed: number;
  filesFailed: number;
  entitiesExtracted: number;
  relationshipsExtracted: number;
  durationMs: number | null;
  errorSummary: string | null;
}

/** GET /api/index-runs/:id/diagnostics */
export interface IndexDiagnosticsResponse {
  runId: string;
  total: number;
  diagnostics: IndexDiagnostic[];
}

// ── Limits configuration ─────────────────────────────────────────────────────

export interface IngestionLimits {
  maxFiles: number;
  maxFileSizeBytes: number;
  maxParseSizeBytes: number;
  maxIndexingTimeMs: number;
  maxConcurrentJobs: number;
}

export const DEFAULT_INGESTION_LIMITS: IngestionLimits = {
  maxFiles: 10_000,
  maxFileSizeBytes: 5_000_000,
  maxParseSizeBytes: 500_000,
  maxIndexingTimeMs: 5 * 60 * 1000, // 5 minutes
  maxConcurrentJobs: 3,
};
