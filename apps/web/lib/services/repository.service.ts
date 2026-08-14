import type {
  RepositoryActivity,
  RepositoryComponent,
  RepositoryOverview,
} from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

/**
 * Repository domain service — the dashboard's single access point for
 * repository intelligence. Components never call `fetch` directly; they call
 * these typed methods, which attach the GitHub session token automatically.
 */
export interface RepositoryService {
  getOverview(token?: string | null): Promise<RepositoryOverview>;
  getActivity(limit?: number, token?: string | null): Promise<RepositoryActivity>;
  getComponents(limit?: number, token?: string | null): Promise<RepositoryComponent[]>;
}

export const repositoryService: RepositoryService = {
  getOverview: (token) => apiClient.getRepositoryOverview(token),
  getActivity: (limit = 10, token) => apiClient.getRepositoryActivity(limit, token),
  getComponents: (limit = 8, token) => apiClient.getRepositoryComponents(limit, token),
};
