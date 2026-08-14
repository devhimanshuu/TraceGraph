import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GithubApiService } from './github-api.service';

const REPO = {
  id: 123,
  full_name: 'octocat/hello-world',
  name: 'hello-world',
  description: 'My first repo',
  language: 'TypeScript',
  default_branch: 'main',
  private: false,
  updated_at: '2025-01-01T00:00:00Z',
};

describe('GithubApiService', () => {
  let service: GithubApiService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new GithubApiService();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockJson(status: number, body: unknown): void {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
  }

  it('lists the user repos mapped to the shared shape', async () => {
    mockJson(200, [REPO]);
    const repos = await service.listRepos('gh-token');

    expect(repos).toEqual([
      {
        id: 123,
        fullName: 'octocat/hello-world',
        name: 'hello-world',
        description: 'My first repo',
        language: 'TypeScript',
        defaultBranch: 'main',
        private: false,
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ]);
    // Token is attached as a bearer header.
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer gh-token');
  });

  it('sends the GitHub API version header', async () => {
    mockJson(200, []);
    await service.listRepos('');
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('maps 404 to NotFoundException', async () => {
    mockJson(404, { message: 'Not Found' });
    await expect(service.getRepoMetadata('nope/missing', '')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps 403 to a rate-limit message', async () => {
    mockJson(403, { message: 'rate limit' });
    await expect(service.listRepos('')).rejects.toThrow(/rate limit/i);
  });

  it('maps 401 to a re-auth message', async () => {
    mockJson(401, { message: 'bad credentials' });
    await expect(service.listRepos('stale')).rejects.toThrow(/sign in again/i);
  });

  it('filters pull requests out of the issues endpoint', async () => {
    mockJson(200, [
      { number: 1, title: 'real bug', state: 'open' },
      { number: 2, title: 'a PR', state: 'open', pull_request: { url: 'x' } },
    ]);
    const issues = await service.listIssues('octocat/hello', '');
    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(1);
  });

  it('downloads a tarball as bytes', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const buffer = await service.downloadTarball('octocat/hello', 'main', '');
    expect(Buffer.from(buffer).length).toBe(3);
  });

  it('wraps network failures as a BadRequestException', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    await expect(service.listRepos('')).rejects.toBeInstanceOf(BadRequestException);
  });
});
