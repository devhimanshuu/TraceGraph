import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RepositoryProvider } from '@/components/layout/repository-provider';
import { repositoryService } from '@/lib/services/repository.service';
import { AppShell } from './app-shell';

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

function renderShell() {
  return render(
    <RepositoryProvider>
      <AppShell>
        <p>Shell content</p>
      </AppShell>
    </RepositoryProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repositoryService.getOverview).mockResolvedValue(overview);
});

describe('AppShell navigation', () => {
  it('renders the primary navigation with the correct destinations', async () => {
    renderShell();

    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(nav).toBeInTheDocument();

    const overview = screen.getByRole('link', { name: 'Overview' });
    expect(overview).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Graph' })).toHaveAttribute('href', '/graph');
    expect(screen.getByRole('link', { name: 'Dependencies' })).toHaveAttribute('href', '/dependencies');
    expect(screen.getByRole('link', { name: 'Impact' })).toHaveAttribute('href', '/impact');
  });

  it('marks the active route with aria-current for keyboard/screen-reader users', async () => {
    renderShell();

    const overview = await screen.findByRole('link', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Graph' })).not.toHaveAttribute('aria-current');
  });

  it('shows the repository context and graph status in the sidebar', async () => {
    renderShell();

    expect(await screen.findByText('commerce-platform')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Graph connected')).toBeInTheDocument();
  });

  it('opens the mobile navigation drawer from the menu button', async () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));

    expect(await screen.findByRole('button', { name: 'Close navigation menu' })).toBeInTheDocument();
    // Drawer exposes the same destinations as the desktop sidebar.
    expect(screen.getByRole('link', { name: 'Graph' })).toHaveAttribute('href', '/graph');
  });
});
