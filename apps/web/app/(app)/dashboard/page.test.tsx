import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RepositoryComponent } from '@tracegraph/shared';
import { ApiRequestError } from '@/lib/api-client';
import { RepositoryProvider } from '@/components/layout/repository-provider';
import { repositoryService } from '@/lib/services/repository.service';
import DashboardPage from './page';

vi.mock('@/lib/services/repository.service', () => ({
  repositoryService: {
    getOverview: vi.fn(),
    getActivity: vi.fn(),
    getComponents: vi.fn(),
    getImportedRepositories: vi.fn(),
    setActiveRepository: vi.fn(),
  },
}));

const overview = {
  id: 'repo:commerce-platform',
  name: 'commerce-platform',
  fullName: 'acme/commerce-platform',
  description: 'A modular commerce backend',
  language: 'TypeScript',
  defaultBranch: 'main',
  stats: {
    directories: 11,
    files: 37,
    functions: 64,
    classes: 21,
    tests: 19,
    commits: 24,
    pullRequests: 11,
    issues: 9,
    developers: 5,
  },
  relationshipCount: 348,
};

const activity = {
  commits: [
    {
      sha: '8f21ac7',
      message: 'Add retry handling to payment flow',
      timestamp: '2025-03-05T08:45:00.000Z',
      branch: 'main',
      author: { username: 'alex', name: 'Alex Morgan' },
    },
  ],
  pullRequests: [
    {
      number: 421,
      title: 'Add payment retry handling',
      status: 'merged',
      createdAt: '2025-03-05T08:45:00.000Z',
    },
  ],
  issues: [
    {
      number: 912,
      title: 'Checkout occasionally times out',
      status: 'closed',
      createdAt: '2025-02-20T10:15:00.000Z',
    },
  ],
};

const components: RepositoryComponent[] = [
  {
    id: 'class:apps/api/services/payment.service.ts:PaymentService',
    type: 'Class',
    label: 'PaymentService',
    dependents: 6,
    path: 'apps/api/services/payment.service.ts',
    topDependents: ['processOrder', 'refund'],
  },
];

const importedRepos = [
  {
    id: 'repo:commerce-platform',
    name: 'commerce-platform',
    fullName: 'acme/commerce-platform',
    description: 'A modular commerce backend',
    language: 'TypeScript',
    active: true,
  },
  {
    id: 'repo:inventory-service',
    name: 'inventory-service',
    fullName: 'acme/inventory-service',
    description: 'Inventory management',
    language: 'Go',
    active: false,
  },
];

function renderPage() {
  return render(
    <RepositoryProvider>
      <DashboardPage />
    </RepositoryProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repositoryService.getOverview).mockResolvedValue(overview);
  vi.mocked(repositoryService.getActivity).mockResolvedValue(activity);
  vi.mocked(repositoryService.getComponents).mockResolvedValue(components);
  vi.mocked(repositoryService.getImportedRepositories).mockResolvedValue(importedRepos);
  vi.mocked(repositoryService.setActiveRepository).mockResolvedValue({
    active: importedRepos[0],
  });
});

describe('DashboardPage', () => {
  it('renders the repository title, metadata and statistics from the API', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'commerce-platform' })).toBeInTheDocument();
    expect(screen.getByText('A modular commerce backend')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();

    // Statistics grid — label + value pairs from the API response.
    // (Labels like "Files" also appear in the composition section, so scope
    // the assertion to the stats grid.)
    const stats = within(screen.getByTestId('stats-grid'));
    expect(stats.getByText('Files')).toBeInTheDocument();
    expect(stats.getByText('37')).toBeInTheDocument();
    expect(stats.getByText('Functions')).toBeInTheDocument();
    expect(stats.getByText('Pull requests')).toBeInTheDocument();
  });

  it('shows a layout-preserving skeleton while the API is loading', () => {
    vi.mocked(repositoryService.getOverview).mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-title-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('stats-skeleton')).toBeInTheDocument();
  });

  it('shows the empty state when the graph has no repository (404)', async () => {
    vi.mocked(repositoryService.getOverview).mockRejectedValue(
      new ApiRequestError('Not found', 404, 'NOT_FOUND'),
    );

    renderPage();

    expect(await screen.findByText('No repository yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Choose one of your GitHub repositories to map it/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Choose a repository' }),
    ).toBeInTheDocument();
  });

  it('shows an error state and retries the request', async () => {
    vi.mocked(repositoryService.getOverview).mockRejectedValue(new Error('boom'));

    renderPage();

    expect(await screen.findByText("We couldn't load the repository")).toBeInTheDocument();

    // Retry actually re-requests and recovers.
    vi.mocked(repositoryService.getOverview).mockResolvedValue(overview);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'commerce-platform' })).toBeInTheDocument();
    expect(repositoryService.getOverview).toHaveBeenCalledTimes(2);
  });

  it('renders recent commits, pull requests and issues from the activity feed', async () => {
    renderPage();

    expect(await screen.findByText('Recent activity')).toBeInTheDocument();
    // The default 30-day window sends a `since` cutoff to the API.
    expect(repositoryService.getActivity).toHaveBeenCalledWith(
      10,
      expect.any(String),
      'test-token',
    );
    expect(screen.getByText('Add retry handling to payment flow')).toBeInTheDocument();
    expect(screen.getByText('#421')).toBeInTheDocument();
    expect(screen.getByText('Add payment retry handling')).toBeInTheDocument();
    expect(screen.getByText('#912')).toBeInTheDocument();
    expect(screen.getByText('Checkout occasionally times out')).toBeInTheDocument();
  });

  it('renders core components and recovers from an error to an empty state on retry', async () => {
    // First fetch fails → error state with its own Retry.
    vi.mocked(repositoryService.getComponents).mockRejectedValueOnce(new Error('db down'));
    renderPage();

    expect(await screen.findByText("Couldn't load core components")).toBeInTheDocument();

    // Retry into an empty result → deliberate empty state, not an error.
    vi.mocked(repositoryService.getComponents).mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No core components found')).toBeInTheDocument();
  });

  it('shows who depends on each core component via the top-dependents sublist', async () => {
    renderPage();

    expect(await screen.findByText('Called by')).toBeInTheDocument();
    expect(screen.getByText('processOrder')).toBeInTheDocument();
    expect(screen.getByText('refund')).toBeInTheDocument();
  });

  it('offers an Analyze PR shortcut deep-linking the core components\' files', async () => {
    renderPage();

    // The most-depended-on class carries a file path → the shortcut appears
    // and pre-fills the blast-radius tool with that file.
    const link = await screen.findByRole('link', { name: 'Analyze PR' });
    expect(link).toHaveAttribute(
      'href',
      `/intelligence?blast=${encodeURIComponent('apps/api/services/payment.service.ts')}`,
    );
  });

  it('hides the Analyze PR shortcut when no component has a path', async () => {
    vi.mocked(repositoryService.getComponents).mockResolvedValue([
      { id: 'class:x', type: 'Class', label: 'X', dependents: 1 },
    ]);

    renderPage();

    expect(await screen.findByText('Core components')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Analyze PR' })).not.toBeInTheDocument();
  });

  it('shows a dedicated empty message when there is no recent activity', async () => {
    vi.mocked(repositoryService.getActivity).mockResolvedValue({
      commits: [],
      pullRequests: [],
      issues: [],
    });

    renderPage();

    // Default window is 30 days — the empty state is period-aware.
    expect(await screen.findByText('No activity in this period')).toBeInTheDocument();

    // Switching to All time shows the all-time empty copy.
    const group = screen.getByRole('group', { name: 'Activity time range' });
    fireEvent.click(within(group).getByRole('button', { name: 'All' }));
    expect(await screen.findByText('No recent activity')).toBeInTheDocument();
  });

  it('shows an error state for the activity section with its own retry', async () => {
    vi.mocked(repositoryService.getActivity).mockRejectedValue(new Error('db down'));

    renderPage();

    expect(await screen.findByText("Couldn't load recent activity")).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
  });

  it('renders imported repositories with the active state and a quick-switch action', async () => {
    renderPage();

    const list = await screen.findByTestId('imported-repos-list');
    expect(within(list).getByText('commerce-platform')).toBeInTheDocument();
    expect(within(list).getByText('acme/commerce-platform · TypeScript')).toBeInTheDocument();
    // Active repo is marked (badge + button) and disabled for switching.
    expect(within(list).getAllByText('Active').length).toBe(2);
    const activeButton = within(list).getByRole('button', { name: 'Active' });
    expect(activeButton).toBeDisabled();

    // Switching the inactive repo flips state and refreshes dashboard data.
    const switchButton = within(list).getByRole('button', { name: 'Switch' });
    fireEvent.click(switchButton);

    expect(repositoryService.setActiveRepository).toHaveBeenCalledWith('repo:inventory-service');
    expect(await screen.findByText('inventory-service')).toBeInTheDocument();
  });

  it('shows a helpful empty state when no repositories are imported', async () => {
    vi.mocked(repositoryService.getImportedRepositories).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('No imported repositories')).toBeInTheDocument();
  });

  it('re-fetches activity with a new since cutoff when the time range changes', async () => {
    renderPage();

    const group = await screen.findByRole('group', { name: 'Activity time range' });
    fireEvent.click(within(group).getByRole('button', { name: '7d' }));

    await waitFor(() =>
      expect(repositoryService.getActivity).toHaveBeenLastCalledWith(
        10,
        expect.any(String),
        'test-token',
      ),
    );
    expect(repositoryService.getActivity).toHaveBeenCalledTimes(2);
    // The range control reflects the selection.
    expect(within(group).getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
  });
});
