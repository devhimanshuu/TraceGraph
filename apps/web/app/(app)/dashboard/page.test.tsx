import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  { id: 'class:apps/api/services/payment.service.ts:PaymentService', type: 'Class', label: 'PaymentService', dependents: 6 },
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

  it('shows a dedicated empty message when there is no recent activity', async () => {
    vi.mocked(repositoryService.getActivity).mockResolvedValue({
      commits: [],
      pullRequests: [],
      issues: [],
    });

    renderPage();

    expect(await screen.findByText('No recent activity')).toBeInTheDocument();
  });

  it('shows an error state for the activity section with its own retry', async () => {
    vi.mocked(repositoryService.getActivity).mockRejectedValue(new Error('db down'));

    renderPage();

    expect(await screen.findByText("Couldn't load recent activity")).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
  });
});
