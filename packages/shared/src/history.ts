/**
 * @tracegraph/shared — rich engineering history types (Phase 16)
 *
 * Models for PR review context, contributor metrics, change frequency,
 * and "why was this changed?" intelligence.
 */

// ── Review Comment ───────────────────────────────────────────────────────────

export interface ReviewComment {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  updatedAt: string | null;
  filePath: string | null;
  line: number | null;
  resolved: boolean;
}

// ── Extended PR with reviewers and comments ──────────────────────────────────

export interface PullRequestDetail {
  number: number;
  title: string;
  body: string;
  status: string;
  author: string;
  reviewers: string[];
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  sourceBranch: string | null;
  targetBranch: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: string[];
  linkedIssues: number[];
  reviewComments: ReviewComment[];
}

// ── Extended commit ──────────────────────────────────────────────────────────

export interface CommitDetail {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
  branch: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
  pullRequestNumber: number | null;
}

// ── Contributor ──────────────────────────────────────────────────────────────

export interface Contributor {
  username: string;
  name: string;
  commitCount: number;
  lastCommitAt: string | null;
  filesChanged: string[];
}

// ── Change frequency ─────────────────────────────────────────────────────────

export interface ChangeFrequency {
  path: string;
  totalChanges: number;
  lastChangedAt: string | null;
  changesLast7Days: number;
  changesLast30Days: number;
  changesLast90Days: number;
  topContributors: Array<{ username: string; count: number }>;
}

// ── File history entry ───────────────────────────────────────────────────────

export interface FileHistoryEntry {
  commitSha: string;
  commitMessage: string;
  commitTimestamp: string;
  author: string;
  prNumber: number | null;
  prTitle: string | null;
  additions: number;
  deletions: number;
}

// ── Change heatmap ───────────────────────────────────────────────────────────

export interface ChangeHeatmapEntry {
  path: string;
  label: string;
  changeCount: number;
  /** Normalized 0-1 value for visual representation. */
  normalizedIntensity: number;
}

// ── "Why was this changed?" context ──────────────────────────────────────────

export interface ChangeContext {
  entity: { id: string; label: string; path: string };
  mostRecentChange: {
    commitSha: string;
    commitMessage: string;
    commitTimestamp: string;
    author: string;
    prNumber: number | null;
    prTitle: string | null;
    issueNumber: number | null;
    issueTitle: string | null;
  } | null;
  totalChanges: number;
  recentContributors: Array<{ username: string; commitCount: number }>;
  lastChangedAt: string | null;
}

// ── History timeline entry ───────────────────────────────────────────────────

export interface HistoryTimelineEntry {
  type: 'commit' | 'pull_request' | 'issue' | 'review_comment';
  timestamp: string;
  /** Compact summary for timeline display. */
  title: string;
  /** Related entity IDs for navigation. */
  relatedIds: string[];
  metadata: Record<string, unknown>;
}

// ── API response types ───────────────────────────────────────────────────────

/** GET /api/nodes/:id/history */
export interface NodeHistoryResponse {
  entityId: string;
  timeline: HistoryTimelineEntry[];
  total: number;
  hasMore: boolean;
}

/** GET /api/nodes/:id/contributors */
export interface NodeContributorsResponse {
  entityId: string;
  contributors: Contributor[];
  total: number;
}

/** GET /api/nodes/:id/change-frequency */
export interface NodeChangeFrequencyResponse {
  entityId: string;
  frequency: ChangeFrequency;
}

/** GET /api/pull-requests/:id */
export interface PullRequestDetailResponse {
  pullRequest: PullRequestDetail;
}

/** GET /api/pull-requests/:id/comments */
export interface PullRequestCommentsResponse {
  comments: ReviewComment[];
  total: number;
}

/** GET /api/repositories/:id/change-heatmap */
export interface ChangeHeatmapResponse {
  repositoryId: string;
  entries: ChangeHeatmapEntry[];
  totalFiles: number;
  maxChanges: number;
}

/** GET /api/repositories/:id/history */
export interface RepositoryHistoryResponse {
  repositoryId: string;
  timeline: HistoryTimelineEntry[];
  total: number;
  hasMore: boolean;
}

/** GET /api/nodes/:id/why-changed */
export interface WhyChangedResponse {
  context: ChangeContext;
}
