import type { GithubImportResult, GithubRepo } from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

/**
 * GitHub onboarding API — lists the signed-in user's repositories and imports
 * one into the graph. Both calls attach the GitHub session token
 * automatically (resolved server-side; never exposed to the browser).
 */
export const githubService = {
  listRepos: (token?: string | null): Promise<GithubRepo[]> =>
    apiClient.listGithubRepos(token),
  importRepo: (fullName: string, token?: string | null): Promise<GithubImportResult> =>
    apiClient.importGithubRepo(fullName, token),
};
