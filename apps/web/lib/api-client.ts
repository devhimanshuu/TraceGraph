import type {
  ApiError,
  AppHealth,
  BlastRadiusResponse,
  CreateRepositoryRequest,
  CreateRepositoryResponse,
  DatabaseHealth,
  DependencyTarget,
  GithubImportJob,
  GithubImportJobStart,
  GithubRepo,
  GraphNode,
  GraphResponse,
  HistoryCommit,
  HistoryIssue,
  HistoryPullRequest,
  ImpactExplanation,
  ImpactHistoryListResponse,
  ImpactResponse,
  ImpactSnapshot,
  ImportedRepository,
  IndexDiagnosticsResponse,
  IndexProgressResponse,
  IndexRun,
  KnowledgeResponse,
  NodeRelationships,
  OrphanListResponse,
  RelationshipSummary,
  RepositoryActivity,
  RepositoryComponent,
  RepositoryDetailResponse,
  RepositoryOverview,
  RepositoryRecord,
  SearchResultItem,
  SetActiveRepositoryResult,
  SmellResponse,
  SyncStatus,
  TestCoverage,
  TestGapResponse,
  TestsForChangeResponse,
  TraversalResult,
  RevisionStatusResponse,
  StartSyncResponse,
  SyncProgressResponse,
  SyncRun,
  SyncRunListResponse,
  ChangeHeatmapResponse,
  NodeChangeFrequencyResponse,
  NodeContributorsResponse,
  NodeHistoryResponse,
  WhyChangedResponse,
} from '@tracegraph/shared';

/**
 * Central API client. All frontend → NestJS communication goes through here;
 * the frontend never talks to CognoDB directly.
 *
 * Base URL comes from NEXT_PUBLIC_API_URL. The localhost default is a
 * development convenience only — production deployments must set the
 * environment variable.
 */
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/**
 * Where the GitHub OAuth flow starts. The web origin does NOT proxy /api to
 * the NestJS backend (no rewrites in next.config), so anchors must target the
 * API origin directly.
 */
export const githubLoginUrl = `${apiBaseUrl}/auth/github/login`;

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Backend fail-closed guard messages (apps/api/src/auth). Error states match
 * on these so they can offer a "Sign in again" recovery path without plumbing
 * status codes through every hook. The messages are a stable contract: the
 * guard fails closed with exactly these strings.
 */
const AUTH_ERROR_MARKERS = [
  'a valid session is required',
  'your session is invalid or has expired',
  'authentication is not configured',
] as const;

export function isAuthErrorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return AUTH_ERROR_MARKERS.some((marker) => m.includes(marker));
}

async function request<T>(path: string, token?: string | null): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
    });
  } catch {
    throw new ApiRequestError('Network error while contacting the API', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    let error: ApiError | undefined;
    try {
      error = (await response.json()) as ApiError;
    } catch {
      // Non-JSON error body — fall through to the generic message.
    }
    throw new ApiRequestError(
      typeof error?.message === 'string' ? error.message : `Request failed (${response.status})`,
      response.status,
      error?.code ?? 'HTTP_ERROR',
    );
  }

  return (await response.json()) as T;
}

/**
 * Mutation helper (POST/DELETE). The CORS config allows Content-Type, Accept
 * and Authorization, so JSON bodies and bearer tokens flow without extra
 * headers.
 */
async function mutate<T>(
  path: string,
  method: 'POST' | 'DELETE',
  token: string | null | undefined,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
  } catch {
    throw new ApiRequestError('Network error while contacting the API', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    let error: ApiError | undefined;
    try {
      error = (await response.json()) as ApiError;
    } catch {
      // Non-JSON error body — fall through to the generic message.
    }
    throw new ApiRequestError(
      typeof error?.message === 'string' ? error.message : `Request failed (${response.status})`,
      response.status,
      error?.code ?? 'HTTP_ERROR',
    );
  }

  return (await response.json()) as T;
}

export const apiClient = {
  getAppHealth: () => request<AppHealth>('/health'),
  getDatabaseHealth: () => request<DatabaseHealth>('/health/database'),
  getRepositoryOverview: (token?: string | null) => request<RepositoryOverview>('/repository', token),
  getRepositoryActivity: (limit: number, since?: string, token?: string | null) =>
    request<RepositoryActivity>(
      `/repository/activity?limit=${limit}${since ? `&since=${encodeURIComponent(since)}` : ''}`,
      token,
    ),
  getRepositoryComponents: (limit: number, token?: string | null) =>
    request<RepositoryComponent[]>(`/repository/components?limit=${limit}`, token),
  getFeaturedEntities: (limit: number, token?: string | null) =>
    request<RepositoryComponent[]>(`/repository/featured?limit=${limit}`, token),
  getImportedRepositories: (token?: string | null) =>
    request<ImportedRepository[]>('/repository/list', token),
  setActiveRepository: (repoId: string, token?: string | null) =>
    mutate<SetActiveRepositoryResult>('/repository/active', 'POST', token, { repoId }),

  // Node details & relationship summary. The entity id is always a query
  // parameter (never a path segment): ids embed file paths with slashes
  // (`fn:src/...`), and the deployed AWS HTTP API decodes `%2F` inside path
  // segments before the Lambda sees them, which breaks `:id` routing.
  getNode: (id: string, token?: string | null) =>
    request<GraphNode>(`/nodes?id=${encodeURIComponent(id)}`, token),
  getRelationshipSummary: (id: string, token?: string | null) =>
    request<RelationshipSummary>(`/nodes/relationship-summary?id=${encodeURIComponent(id)}`, token),
  getRelationships: (id: string, limit = 100, token?: string | null) =>
    request<NodeRelationships>(`/nodes/relationships?id=${encodeURIComponent(id)}&limit=${limit}`, token),

  // Dependencies & dependents
  getDependencies: (id: string, limit = 100, token?: string | null) =>
    request<DependencyTarget[]>(
      `/nodes/dependencies?id=${encodeURIComponent(id)}&limit=${limit}`,
      token,
    ),
  getDependents: (id: string, limit = 100, token?: string | null) =>
    request<DependencyTarget[]>(
      `/nodes/dependents?id=${encodeURIComponent(id)}&limit=${limit}`,
      token,
    ),
  getCallers: (id: string, limit = 100, token?: string | null) =>
    request<DependencyTarget[]>(
      `/nodes/callers?id=${encodeURIComponent(id)}&limit=${limit}`,
      token,
    ),
  getCallees: (id: string, limit = 100, token?: string | null) =>
    request<DependencyTarget[]>(
      `/nodes/callees?id=${encodeURIComponent(id)}&limit=${limit}`,
      token,
    ),

  // Tests
  getTests: (id: string, limit = 100, token?: string | null) =>
    request<TestCoverage[]>(`/nodes/tests?id=${encodeURIComponent(id)}&limit=${limit}`, token),

  // History (dedicated prefix — shares no route with the nodes controller)
  getCommits: (id: string, limit = 50, token?: string | null) =>
    request<HistoryCommit[]>(
      `/node-history/commits?id=${encodeURIComponent(id)}&limit=${limit}`,
      token,
    ),
  getPullRequests: (id: string, limit = 50, token?: string | null) =>
    request<HistoryPullRequest[]>(
      `/node-history/pull-requests?id=${encodeURIComponent(id)}&limit=${limit}`,
      token,
    ),
  getIssues: (id: string, limit = 50, token?: string | null) =>
    request<HistoryIssue[]>(
      `/node-history/issues?id=${encodeURIComponent(id)}&limit=${limit}`,
      token,
    ),

  // Multi-hop Traversal
  getTraversal: (
    id: string,
    options?: { depth?: number; direction?: 'out' | 'in'; limit?: number; types?: string[] },
    token?: string | null,
  ) => {
    const params = new URLSearchParams();
    if (options?.depth) params.set('depth', String(options.depth));
    if (options?.direction) params.set('direction', options.direction);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.types?.length) params.set('types', options.types.join(','));
    params.set('id', id);
    const qs = params.toString();
    return request<TraversalResult>(`/traversal?${qs}`, token);
  },

  // Search
  searchNodes: (q: string, limit = 20, token?: string | null) =>
    request<SearchResultItem[]>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`, token),

  // Impact History (CognoDB-backed snapshots)
  getImpactHistory: (limit = 50, token?: string | null) =>
    request<ImpactHistoryListResponse>(`/impact-history?limit=${limit}`, token),
  recordImpactSnapshot: (
    snapshot: Omit<ImpactSnapshot, 'id' | 'timestamp' | 'repoId' | 'repoName' | 'analyzedBy'>,
    token?: string | null,
  ) => mutate<ImpactHistoryListResponse>('/impact-history', 'POST', token, snapshot),
  clearImpactHistory: (token?: string | null) =>
    mutate<{ deleted: number }>('/impact-history', 'DELETE', token),

  // Impact Analysis
  getImpact: (id: string, options?: { depth?: number; limit?: number }, token?: string | null) => {
    const params = new URLSearchParams();
    params.set('id', id);
    if (options?.depth) params.set('depth', String(options.depth));
    if (options?.limit) params.set('limit', String(options.limit));
    return request<ImpactResponse>(`/impact?${params.toString()}`, token);
  },

  // AI explanation — evidence-backed explanation of the impact analysis.
  explainImpact: (id: string, depth: number, token?: string | null) =>
    mutate<ImpactExplanation>(`/impact/explain?id=${encodeURIComponent(id)}`, 'POST', token, {
      depth,
    }),

  // GitHub onboarding (repo picker + import)
  listGithubRepos: (token?: string | null) =>
    request<GithubRepo[]>('/github/repos', token),
  startGithubImport: (fullName: string, token?: string | null) =>
    mutate<GithubImportJobStart>('/github/import', 'POST', token, { fullName }),
  getGithubImportStatus: (jobId: string, token?: string | null) =>
    request<GithubImportJob>(`/github/imports/${encodeURIComponent(jobId)}`, token),

  // Codebase intelligence (orphans, smells, test gaps, blast radius, knowledge)
  getOrphans: (limit = 50, token?: string | null) =>
    request<OrphanListResponse>(`/intelligence/orphans?limit=${limit}`, token),
  getSmells: (token?: string | null) => request<SmellResponse>('/intelligence/smells', token),
  getTestGaps: (limit = 50, token?: string | null) =>
    request<TestGapResponse>(`/intelligence/test-gaps?limit=${limit}`, token),
  blastRadius: (files: string[], options?: { depth?: number }, token?: string | null) =>
    mutate<BlastRadiusResponse>(
      '/intelligence/blast-radius',
      'POST',
      token,
      { files, depth: options?.depth },
    ),
  testsForChange: (entityIds: string[], options?: { depth?: number }, token?: string | null) =>
    mutate<TestsForChangeResponse>(
      '/intelligence/tests-for-change',
      'POST',
      token,
      { entityIds, depth: options?.depth },
    ),
  getKnowledge: (options?: { entityId?: string; limit?: number }, token?: string | null) => {
    const params = new URLSearchParams();
    if (options?.entityId) params.set('entityId', options.entityId);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return request<KnowledgeResponse>(`/intelligence/knowledge${qs ? `?${qs}` : ''}`, token);
  },

  // Graph neighborhood
  getGraph: (
    options?: { rootId?: string; depth?: number; limit?: number; relationshipTypes?: string[]; nodeTypes?: string[] },
    token?: string | null,
  ) => {
    const params = new URLSearchParams();
    if (options?.rootId) params.set('rootId', options.rootId);
    if (options?.depth) params.set('depth', String(options.depth));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.relationshipTypes?.length) params.set('relationshipTypes', options.relationshipTypes.join(','));
    if (options?.nodeTypes?.length) params.set('nodeTypes', options.nodeTypes.join(','));
    const qs = params.toString();
    return request<GraphResponse>(`/graph${qs ? `?${qs}` : ''}`, token);
  },

  // File content for code preview
  getFileContent: (filePath: string, token?: string | null) =>
    request<{ content: string | null; language: string }>(
      `/nodes/file-content?path=${encodeURIComponent(filePath)}`,
      token,
    ),

  // Sync status
  getSyncStatus: (token?: string | null) =>
    request<SyncStatus>('/repository/sync-status', token),
  startResync: (fullName: string, token?: string | null) =>
    mutate<GithubImportJobStart>('/github/resync', 'POST', token, { fullName }),

  // ── Repository Ingestion (Phase 14) ──
  createRepository: (dto: CreateRepositoryRequest, token?: string | null) =>
    mutate<CreateRepositoryResponse>('/repositories', 'POST', token, dto),
  listRepositories: (token?: string | null) =>
    request<RepositoryRecord[]>('/repositories', token),
  getRepositoryDetail: (id: string, token?: string | null) =>
    request<RepositoryDetailResponse>(`/repositories/${encodeURIComponent(id)}`, token),
  startIndex: (repoId: string, token?: string | null) =>
    mutate<{ indexRun: IndexRun }>(`/repositories/${encodeURIComponent(repoId)}/index`, 'POST', token, {}),
  getIndexRuns: (repoId: string, token?: string | null) =>
    request<IndexRun[]>(`/repositories/${encodeURIComponent(repoId)}/index-runs`, token),
  getIndexRun: (runId: string, token?: string | null) =>
    request<IndexRun>(`/index-runs/${encodeURIComponent(runId)}`, token),
  getIndexProgress: (runId: string, token?: string | null) =>
    request<IndexProgressResponse>(`/index-runs/${encodeURIComponent(runId)}/progress`, token),
  getIndexDiagnostics: (runId: string, token?: string | null) =>
    request<IndexDiagnosticsResponse>(`/index-runs/${encodeURIComponent(runId)}/diagnostics`, token),
  cancelIndexRun: (runId: string, token?: string | null) =>
    mutate<IndexRun>(`/index-runs/${encodeURIComponent(runId)}/cancel`, 'POST', token, {}),
  retryIndexRun: (repoId: string, token?: string | null) =>
    mutate<{ indexRun: IndexRun }>(`/repositories/${encodeURIComponent(repoId)}/retry`, 'POST', token, {}),

  // ── Incremental Sync (Phase 15) ──
  startSync: (repoId: string, token?: string | null) =>
    mutate<StartSyncResponse>(`/repositories/${encodeURIComponent(repoId)}/sync`, 'POST', token, {}),
  getSyncRuns: (repoId: string, token?: string | null) =>
    request<SyncRunListResponse>(`/repositories/${encodeURIComponent(repoId)}/sync-runs`, token),
  getSyncRun: (runId: string, token?: string | null) =>
    request<SyncRun>(`/sync-runs/${encodeURIComponent(runId)}`, token),
  getSyncProgress: (runId: string, token?: string | null) =>
    request<SyncProgressResponse>(`/sync-runs/${encodeURIComponent(runId)}/progress`, token),
  cancelSyncRun: (runId: string, token?: string | null) =>
    mutate<SyncRun>(`/sync-runs/${encodeURIComponent(runId)}/cancel`, 'POST', token, {}),
  retrySyncRun: (runId: string, token?: string | null) =>
    mutate<StartSyncResponse>(`/sync-runs/${encodeURIComponent(runId)}/retry`, 'POST', token, {}),
  getRevisionStatus: (repoId: string, token?: string | null) =>
    request<RevisionStatusResponse>(`/repositories/${encodeURIComponent(repoId)}/revision`, token),

  // ── History Intelligence (Phase 16) ──
  getNodeHistory: (id: string, limit = 20, token?: string | null) =>
    request<NodeHistoryResponse>(`/node-history/history?id=${encodeURIComponent(id)}&limit=${limit}`, token),
  getNodeContributors: (id: string, limit = 20, token?: string | null) =>
    request<NodeContributorsResponse>(`/node-history/contributors?id=${encodeURIComponent(id)}&limit=${limit}`, token),
  getNodeChangeFrequency: (id: string, token?: string | null) =>
    request<NodeChangeFrequencyResponse>(`/node-history/change-frequency?id=${encodeURIComponent(id)}`, token),
  getWhyChanged: (id: string, token?: string | null) =>
    request<WhyChangedResponse>(`/node-history/why-changed?id=${encodeURIComponent(id)}`, token),
  getChangeHeatmap: (repoId: string, limit = 30, token?: string | null) =>
    request<ChangeHeatmapResponse>(`/repository/change-heatmap?id=${encodeURIComponent(repoId)}&limit=${limit}`, token),
 getRepositoryHistory: (repoId: string, limit = 20, token?: string | null) =>
    request<{ repositoryId: string; timeline: any[]; total: number; hasMore: boolean }>(
      `/repository/history?id=${encodeURIComponent(repoId)}&limit=${limit}`,
      token,
    ),

  // ── Test Intelligence (Phase 17) ──
  selectTests: (dto: import('@tracegraph/shared').TestSelectionRequest, token?: string | null) =>
    mutate<import('@tracegraph/shared').TestSelectionResponse>('/test-intelligence/select', 'POST', token, dto),
  getTestIntelligenceOverview: (repoId: string, token?: string | null) =>
    request<import('@tracegraph/shared').TestIntelligenceOverview>(
      `/test-intelligence/overview/${encodeURIComponent(repoId)}`,
      token,
    ),

  // ── Architecture Guardrails (Phase 18) ──
  listGuardrailRules: (repositoryId: string, token?: string | null) =>
    request<import('@tracegraph/shared').ArchitectureRule[]>(
      `/guardrails?repositoryId=${encodeURIComponent(repositoryId)}`,
      token,
    ),
  createGuardrailRule: (dto: Omit<import('@tracegraph/shared').ArchitectureRule, 'id' | 'createdAt' | 'updatedAt'>, token?: string | null) =>
    mutate<import('@tracegraph/shared').ArchitectureRule>('/guardrails', 'POST', token, dto),
  evaluateGuardrails: (dto: import('@tracegraph/shared').EvaluationRequest, token?: string | null) =>
    mutate<import('@tracegraph/shared').EvaluationResponse>('/guardrails/evaluate', 'POST', token, dto),
  getGuardrailDashboard: (repositoryId: string, token?: string | null) =>
    request<import('@tracegraph/shared').GuardrailDashboard>(
      `/guardrails/dashboard/${encodeURIComponent(repositoryId)}`,
      token,
    ),
  suppressViolation: (violationId: string, reason: string, token?: string | null) =>
    mutate<import('@tracegraph/shared').ArchitectureViolation>(
      `/guardrails/violations/${encodeURIComponent(violationId)}/suppress`,
      'POST', token, { reason },
    ),
  seedGuardrailRules: (repositoryId: string, token?: string | null) =>
    mutate<import('@tracegraph/shared').ArchitectureRule[]>(
      `/guardrails/seed/${encodeURIComponent(repositoryId)}`,
      'POST', token, {},
    ),
};
