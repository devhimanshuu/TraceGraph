import type {
  GithubImportJob,
  GithubImportJobStart,
  GithubImportResult,
  GithubRepo,
} from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

const POLL_INTERVAL_MS = 800;

/**
 * GitHub onboarding API — lists the signed-in user's repositories and starts
 * a background import into the graph. All calls attach the GitHub session
 * token automatically (resolved server-side; never exposed to the browser).
 */
export const githubService = {
  listRepos: (token?: string | null): Promise<GithubRepo[]> =>
    apiClient.listGithubRepos(token),
  /** Starts a background import; the caller polls `getImportStatus(jobId)`. */
  startImport: (fullName: string, token?: string | null): Promise<GithubImportJobStart> =>
    apiClient.startGithubImport(fullName, token),
  /** Live staged progress of an in-flight import job. */
  getImportStatus: (jobId: string, token?: string | null): Promise<GithubImportJob> =>
    apiClient.getGithubImportStatus(jobId, token),
  /**
   * Start an import and poll until it finishes, surfacing each status update
   * through `onStatus` (used by the staged progress UI). Resolves the final
   * result, or rejects with the job's error when the import fails.
   */
  importRepo: async (
    fullName: string,
    token?: string | null,
    onStatus?: (job: GithubImportJob) => void,
  ): Promise<GithubImportResult> => {
    const { jobId } = await apiClient.startGithubImport(fullName, token);
    for (;;) {
      const job = await apiClient.getGithubImportStatus(jobId, token);
      onStatus?.(job);
      if (job.status === 'done' && job.result) return job.result;
      if (job.status === 'error') {
        throw new Error(job.error ?? 'The import failed unexpectedly.');
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  },
};
