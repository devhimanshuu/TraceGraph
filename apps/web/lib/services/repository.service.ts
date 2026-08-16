import type {
  ImportedRepository,
  RepositoryActivity,
  RepositoryComponent,
  RepositoryOverview,
  SetActiveRepositoryResult,
} from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

/**
 * Repository domain service — the dashboard's single access point for
 * repository intelligence. Components never call `fetch` directly; they call
 * these typed methods, which attach the GitHub session token automatically.
 */
export interface RepositoryService {
  getOverview(token?: string | null): Promise<RepositoryOverview>;
  getActivity(
    limit?: number,
    since?: string,
    token?: string | null,
  ): Promise<RepositoryActivity>;
  getComponents(limit?: number, token?: string | null): Promise<RepositoryComponent[]>;
  /** Featured quick-pick entities — most-connected files/classes/functions. */
  getFeatured(limit?: number, token?: string | null): Promise<RepositoryComponent[]>;
  /** All imported repositories — for the repo switcher. */
  getImportedRepositories(token?: string | null): Promise<ImportedRepository[]>;
  /** Switches the active repository. */
  setActiveRepository(repoId: string, token?: string | null): Promise<SetActiveRepositoryResult>;
}

export const repositoryService: RepositoryService = {
  getOverview: (token) => apiClient.getRepositoryOverview(token),
  getActivity: (limit = 10, since, token) => apiClient.getRepositoryActivity(limit, since, token),
  getComponents: (limit = 8, token) => apiClient.getRepositoryComponents(limit, token),
  getFeatured: (limit = 8, token) => apiClient.getFeaturedEntities(limit, token),
  getImportedRepositories: (token) => apiClient.getImportedRepositories(token),
  setActiveRepository: (repoId, token) => apiClient.setActiveRepository(repoId, token),
};
