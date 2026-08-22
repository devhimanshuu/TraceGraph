import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { GithubRepo } from '@tracegraph/shared';

const API_BASE = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Minimal GitHub REST client for the repo picker + importer. Every call can
 * run with a token (the session's backend-held access token) or without it —
 * unauthenticated access still works for public repos, which keeps the
 * import pipeline testable and degrades gracefully.
 */
@Injectable()
export class GithubApiService {
  async listRepos(token: string): Promise<GithubRepo[]> {
    const data = await this.getJson<Array<Record<string, unknown>>>(
      '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator',
      token,
    );
    return data.map((repo) => ({
      id: Number(repo.id),
      fullName: String(repo.full_name ?? ''),
      name: String(repo.name ?? ''),
      description: String(repo.description ?? ''),
      language: String(repo.language ?? ''),
      defaultBranch: String(repo.default_branch ?? 'main'),
      private: Boolean(repo.private),
      updatedAt: String(repo.updated_at ?? ''),
    }));
  }

  async getRepoMetadata(fullName: string, token?: string) {
    return this.getJson<Record<string, unknown>>(`/repos/${fullName}`, token);
  }

  /** Downloads the repository as a gzipped tarball (raw bytes). */
  async downloadTarball(fullName: string, branch: string, token?: string): Promise<Buffer> {
    const response = await this.fetchRaw(`/repos/${fullName}/tarball/${branch}`, token);
    return Buffer.from(await response.arrayBuffer());
  }

  async listCommits(fullName: string, token?: string, perPage = 30) {
    return this.getJson<Array<Record<string, unknown>>>(
      `/repos/${fullName}/commits?per_page=${perPage}`,
      token,
    );
  }

  /** One commit including its changed files (for MODIFIES edges). */
  async getCommit(fullName: string, sha: string, token?: string) {
    return this.getJson<Record<string, unknown>>(`/repos/${fullName}/commits/${sha}`, token);
  }

  async listPulls(fullName: string, token?: string, perPage = 20) {
    return this.getJson<Array<Record<string, unknown>>>(
      `/repos/${fullName}/pulls?state=all&per_page=${perPage}`,
      token,
    );
  }

  async listIssues(fullName: string, token?: string, perPage = 20) {
    const data = await this.getJson<Array<Record<string, unknown>>>(
      `/repos/${fullName}/issues?state=all&per_page=${perPage}`,
      token,
    );
    // The issues endpoint also returns pull requests — filter them out.
    return data.filter((issue) => !issue.pull_request);
  }

  /**
   * Fetch raw file content from a repository.
   * Returns the decoded UTF-8 string, or null on failure.
   */
  async getFileContent(
    fullName: string,
    filePath: string,
    branch: string,
    token?: string,
  ): Promise<string | null> {
    try {
      const response = await this.fetchRaw(
        `/repos/${fullName}/contents/${encodeURIComponent(filePath)}?ref=${branch}`,
        token,
      );
      if (!response.ok) return null;
      const data = (await response.json()) as Record<string, unknown>;
      if (data.encoding === 'base64' && typeof data.content === 'string') {
        return Buffer.from(data.content, 'base64').toString('utf8');
      }
      // If content is a download URL, fetch it
      if (typeof data.download_url === 'string') {
        const raw = await this.fetchRaw(
          `/repos/${fullName}/raw/${encodeURIComponent(filePath)}?ref=${branch}`,
          token,
        );
        if (raw.ok) return await raw.text();
      }
      return null;
    } catch {
      return null;
    }
  }

  private async getJson<T>(path: string, token?: string): Promise<T> {
    const response = await this.fetchRaw(path, token);
    if (!response.ok) {
      throw this.toHttpError(response.status, path);
    }
    return (await response.json()) as T;
  }

  private async fetchRaw(path: string, token?: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'TraceGraph',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    try {
      return await fetch(`${API_BASE}${path}`, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'follow',
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      throw new BadRequestException(`GitHub API request failed: ${reason}`);
    }
  }

  private toHttpError(status: number, path: string): Error {
    if (status === 404) {
      return new NotFoundException(`GitHub repository not found: ${path}`);
    }
    if (status === 401 || status === 403) {
      const message =
        status === 403
          ? 'GitHub rate limit exceeded or access denied — try again in a moment.'
          : 'Your GitHub session is no longer valid — sign in again.';
      return new BadRequestException(message);
    }
    return new BadRequestException(`GitHub API error (${status})`);
  }
}
