import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RepositorySwitcher } from './repository-switcher';
import { githubService } from '@/lib/services/github.service';
import { repositoryService } from '@/lib/services/repository.service';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/services/github.service', () => ({
  githubService: { listRepos: vi.fn(), importRepo: vi.fn() },
}));

vi.mock('@/lib/services/repository.service', () => ({
  repositoryService: {
    getImportedRepositories: vi.fn(),
    setActiveRepository: vi.fn(),
  },
}));

const refresh = vi.fn().mockResolvedValue(undefined);

vi.mock('@/components/layout/repository-provider', () => ({
  useRepositoryContext: () => ({
    repository: {
      id: 'repo:devhimanshuu/BudgetBuddy',
      name: 'BudgetBuddy',
      fullName: 'devhimanshuu/BudgetBuddy',
      description: '',
      language: 'TypeScript',
      defaultBranch: 'main',
    },
    refresh,
  }),
}));

const GH_REPOS = [
  {
    id: 1,
    fullName: 'devhimanshuu/BudgetBuddy',
    name: 'BudgetBuddy',
    description: 'Personal finance tracker',
    language: 'TypeScript',
    defaultBranch: 'main',
    private: false,
    updatedAt: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 2,
    fullName: 'devhimanshuu/OtherRepo',
    name: 'OtherRepo',
    description: 'Another project',
    language: 'Python',
    defaultBranch: 'main',
    private: false,
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
] as const;

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /Switch repository/i }));
}

describe('RepositorySwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(githubService.listRepos).mockResolvedValue([...GH_REPOS]);
    vi.mocked(repositoryService.getImportedRepositories).mockResolvedValue([
      {
        id: 'repo:devhimanshuu/BudgetBuddy',
        name: 'BudgetBuddy',
        fullName: 'devhimanshuu/BudgetBuddy',
        description: '',
        language: 'TypeScript',
        active: true,
      },
    ]);
  });

  it('lists the GitHub repos and marks the imported one as Mapped', async () => {
    render(<RepositorySwitcher />);
    openDialog();

    expect(await screen.findByText('devhimanshuu/BudgetBuddy')).toBeInTheDocument();
    expect(screen.getByText('devhimanshuu/OtherRepo')).toBeInTheDocument();
    // The imported repo shows a Mapped badge and a Switch action…
    const mappedRow = screen.getByText('devhimanshuu/BudgetBuddy').closest('li')!;
    expect(within(mappedRow).getByText('Mapped')).toBeInTheDocument();
    expect(within(mappedRow).getByRole('button', { name: 'Switch' })).toBeInTheDocument();
    // …the unimported one gets an Import action.
    const otherRow = screen.getByText('devhimanshuu/OtherRepo').closest('li')!;
    expect(within(otherRow).getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('switches to an already-imported repo via setActiveRepository', async () => {
    // Both repos are already imported before the dialog opens.
    vi.mocked(repositoryService.getImportedRepositories).mockResolvedValue([
      {
        id: 'repo:devhimanshuu/BudgetBuddy',
        name: 'BudgetBuddy',
        fullName: 'devhimanshuu/BudgetBuddy',
        description: '',
        language: 'TypeScript',
        active: true,
      },
      {
        id: 'repo:devhimanshuu/OtherRepo',
        name: 'OtherRepo',
        fullName: 'devhimanshuu/OtherRepo',
        description: '',
        language: 'Python',
        active: false,
      },
    ]);
    vi.mocked(repositoryService.setActiveRepository).mockResolvedValue({
      active: {
        id: 'repo:devhimanshuu/OtherRepo',
        name: 'OtherRepo',
        fullName: 'devhimanshuu/OtherRepo',
        description: '',
        language: 'Python',
        active: true,
      },
    });

    render(<RepositorySwitcher />);
    openDialog();

    await screen.findByText('devhimanshuu/OtherRepo');

    const row = screen.getByText('devhimanshuu/OtherRepo').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Switch' }));

    await waitFor(() =>
      expect(repositoryService.setActiveRepository).toHaveBeenCalledWith(
        'repo:devhimanshuu/OtherRepo',
        'test-token',
      ),
    );
    expect(refresh).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('imports an unimported repo and lands on the dashboard', async () => {
    vi.mocked(githubService.importRepo).mockResolvedValue({
      fullName: 'devhimanshuu/OtherRepo',
      repositoryId: 'repo:devhimanshuu/OtherRepo',
      nodesCreated: 10,
      relationshipsCreated: 20,
      files: 5,
      functions: 3,
      classes: 1,
      tests: 0,
      commits: 1,
      pullRequests: 0,
      issues: 0,
      durationMs: 100,
    });

    render(<RepositorySwitcher />);
    openDialog();

    await screen.findByText('devhimanshuu/OtherRepo');
    const row = screen.getByText('devhimanshuu/OtherRepo').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Import' }));

    await waitFor(() =>
      expect(githubService.importRepo).toHaveBeenCalledWith(
        'devhimanshuu/OtherRepo',
        'test-token',
      ),
    );
    expect(refresh).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });
});
