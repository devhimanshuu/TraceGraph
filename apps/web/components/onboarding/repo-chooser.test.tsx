import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError } from '@/lib/api-client';
import { RepoChooser } from './repo-chooser';

vi.mock('@/lib/services/github.service', () => ({
  githubService: {
    listRepos: vi.fn(),
    importRepo: vi.fn(),
  },
}));

vi.mock('@/components/layout/repository-provider', () => ({
  useRepositoryContext: () => ({ refresh: refreshMock }),
}));

import { githubService } from '@/lib/services/github.service';

const refreshMock = vi.fn().mockResolvedValue(undefined);

const REPOS = [
  {
    id: 1,
    fullName: 'octocat/hello-world',
    name: 'hello-world',
    description: 'My first repository',
    language: 'TypeScript',
    defaultBranch: 'main',
    private: false,
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 2,
    fullName: 'octocat/secret-app',
    name: 'secret-app',
    description: '',
    language: '',
    defaultBranch: 'main',
    private: true,
    updatedAt: '2025-02-01T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RepoChooser', () => {
  it('starts on the intro card and opens the picker on demand', async () => {
    vi.mocked(githubService.listRepos).mockResolvedValue(REPOS);
    render(<RepoChooser />);

    expect(
      screen.getByRole('button', { name: 'Choose a repository' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Read-only access to your public repositories/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Choose a repository' }));

    expect(await screen.findByText('octocat/hello-world')).toBeInTheDocument();
    expect(screen.getByText('octocat/secret-app')).toBeInTheDocument();
    expect(githubService.listRepos).toHaveBeenCalledTimes(1);
  });

  it('filters the repo list as the user types', async () => {
    vi.mocked(githubService.listRepos).mockResolvedValue(REPOS);
    render(<RepoChooser />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a repository' }));
    await screen.findByText('octocat/hello-world');

    fireEvent.change(screen.getByLabelText('Filter repositories'), {
      target: { value: 'secret' },
    });

    expect(screen.queryByText('octocat/hello-world')).not.toBeInTheDocument();
    expect(screen.getByText('octocat/secret-app')).toBeInTheDocument();
  });

  it('imports a repo and refreshes the repository context', async () => {
    vi.mocked(githubService.listRepos).mockResolvedValue(REPOS);
    vi.mocked(githubService.importRepo).mockResolvedValue({
      fullName: 'octocat/hello-world',
      repositoryId: 'repo:octocat/hello-world',
      nodesCreated: 42,
      relationshipsCreated: 128,
      files: 12,
      functions: 20,
      classes: 5,
      tests: 4,
      commits: 10,
      pullRequests: 2,
      issues: 1,
      durationMs: 4000,
    });

    render(<RepoChooser />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a repository' }));
    await screen.findByText('octocat/hello-world');

    const importButtons = screen.getAllByRole('button', { name: 'Import' });
    fireEvent.click(importButtons[0]);

    await waitFor(() =>
      expect(githubService.importRepo).toHaveBeenCalledWith(
        'octocat/hello-world',
        'test-token',
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/imported — 12 files/)).toBeInTheDocument();
  });

  it('shows the import failure reason inline', async () => {
    vi.mocked(githubService.listRepos).mockResolvedValue(REPOS);
    vi.mocked(githubService.importRepo).mockRejectedValue(
      new Error('No importable files found in this repository.'),
    );

    render(<RepoChooser />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a repository' }));
    await screen.findByText('octocat/hello-world');

    fireEvent.click(screen.getAllByRole('button', { name: 'Import' })[0]);

    expect(
      await screen.findByText('No importable files found in this repository.'),
    ).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('recovers from a list-load failure with retry', async () => {
    vi.mocked(githubService.listRepos)
      .mockRejectedValueOnce(new ApiRequestError('GitHub is down', 500, 'HTTP_ERROR'))
      .mockResolvedValueOnce(REPOS);

    render(<RepoChooser />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a repository' }));

    expect(await screen.findByText("Couldn't load your repositories")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('octocat/hello-world')).toBeInTheDocument();
  });

  it('shows a friendly empty state when the account has no repositories', async () => {
    vi.mocked(githubService.listRepos).mockResolvedValue([]);

    render(<RepoChooser />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a repository' }));

    expect(await screen.findByText('No repositories found')).toBeInTheDocument();
  });
});
