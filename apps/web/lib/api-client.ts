import type {
  ApiError,
  AppHealth,
  DatabaseHealth,
  DependencyTarget,
  GraphNode,
  GraphResponse,
  HistoryCommit,
  HistoryIssue,
  HistoryPullRequest,
  NodeRelationships,
  RelationshipSummary,
  RepositoryActivity,
  RepositoryComponent,
  RepositoryOverview,
  SearchResultItem,
  TestCoverage,
  TraversalResult,
} from '@tracegraph/shared';

/**
 * Central API client. All frontend → NestJS communication goes through here;
 * the frontend never talks to CognoDB directly (Phase 1 architecture rule).
 *
 * Base URL comes from NEXT_PUBLIC_API_URL. The localhost default is a
 * development convenience only — production deployments must set the
 * environment variable.
 */
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

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

export const apiClient = {
  getAppHealth: () => request<AppHealth>('/health'),
  getDatabaseHealth: () => request<DatabaseHealth>('/health/database'),
  getRepositoryOverview: (token?: string | null) => request<RepositoryOverview>('/repository', token),
  getRepositoryActivity: (limit: number, token?: string | null) =>
    request<RepositoryActivity>(`/repository/activity?limit=${limit}`, token),
  getRepositoryComponents: (limit: number, token?: string | null) =>
    request<RepositoryComponent[]>(`/repository/components?limit=${limit}`, token),

  // Node details & relationship summary (Phase 8)
  getNode: (id: string, token?: string | null) =>
    request<GraphNode>(`/nodes/${encodeURIComponent(id)}`, token),
  getRelationshipSummary: (id: string, token?: string | null) =>
    request<RelationshipSummary>(`/nodes/${encodeURIComponent(id)}/relationship-summary`, token),
  getRelationships: (id: string, limit = 100, token?: string | null) =>
    request<NodeRelationships>(`/nodes/${encodeURIComponent(id)}/relationships?limit=${limit}`, token),

  // Dependencies & dependents
  getDependencies: (id: string, limit = 100, token?: string | null) =>
    request<DependencyTarget[]>(`/nodes/${encodeURIComponent(id)}/dependencies?limit=${limit}`, token),
  getDependents: (id: string, limit = 100, token?: string | null) =>
    request<DependencyTarget[]>(`/nodes/${encodeURIComponent(id)}/dependents?limit=${limit}`, token),
  getCallers: (id: string, limit = 100, token?: string | null) =>
    request<DependencyTarget[]>(`/nodes/${encodeURIComponent(id)}/callers?limit=${limit}`, token),
  getCallees: (id: string, limit = 100, token?: string | null) =>
    request<DependencyTarget[]>(`/nodes/${encodeURIComponent(id)}/callees?limit=${limit}`, token),

  // Tests
  getTests: (id: string, limit = 100, token?: string | null) =>
    request<TestCoverage[]>(`/nodes/${encodeURIComponent(id)}/tests?limit=${limit}`, token),

  // History
  getCommits: (id: string, limit = 50, token?: string | null) =>
    request<HistoryCommit[]>(`/nodes/${encodeURIComponent(id)}/commits?limit=${limit}`, token),
  getPullRequests: (id: string, limit = 50, token?: string | null) =>
    request<HistoryPullRequest[]>(`/nodes/${encodeURIComponent(id)}/pull-requests?limit=${limit}`, token),
  getIssues: (id: string, limit = 50, token?: string | null) =>
    request<HistoryIssue[]>(`/nodes/${encodeURIComponent(id)}/issues?limit=${limit}`, token),

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
    const qs = params.toString();
    return request<TraversalResult>(
      `/traversal/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`,
      token,
    );
  },

  // Search
  searchNodes: (q: string, limit = 20, token?: string | null) =>
    request<SearchResultItem[]>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`, token),

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
};
