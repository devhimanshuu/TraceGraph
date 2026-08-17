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
    getFeatured: vi.fn(),
    getImportedRepositories: vi.fn().mockResolvedValue([]),
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

function renderShell() {
  return render(
    <RepositoryProvider>
      <AppShell>
        <p>Shell content</p>
      </AppShell>
    </RepositoryProvider>,
  );
}

/** Make matchMedia report the given min-width query results. */
function mockMatchMedia(matches: Record<string, boolean>) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches[query] ?? false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
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

  it('shows the active repository in the header dropdown and graph status in the sidebar', async () => {
    renderShell();

    // The active repo now lives in the sidebar header as a compact dropdown.
    expect(await screen.findByText('commerce-platform')).toBeInTheDocument();
    expect(screen.getByText(/TypeScript · main/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Switch repository/ })).toBeInTheDocument();
    expect(screen.getByText('Graph connected')).toBeInTheDocument();
  });

  it('opens the mobile navigation drawer from the menu button', async () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));

    expect(await screen.findByRole('button', { name: 'Close navigation menu' })).toBeInTheDocument();
    // Drawer exposes the same destinations as the desktop sidebar.
    expect(screen.getByRole('link', { name: 'Graph' })).toHaveAttribute('href', '/graph');
  });

  it('collapses and expands the desktop sidebar via the rail toggle', async () => {
    window.localStorage.clear();
    renderShell();

    // Collapse — nav labels are replaced by icon-only links with aria-labels.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-label', 'Overview');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveTextContent('Overview');
    expect(window.localStorage.getItem('tracegraph:sidebar-collapsed')).toBe('1');
    // The content uncaps to use the full freed width while the rail is collapsed.
    expect(screen.getByRole('main')).toHaveClass('lg:max-w-none');

    // Expand — full labels return and the reading width cap is restored.
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveTextContent('Overview');
    expect(screen.getByRole('main')).not.toHaveClass('lg:max-w-none');
    expect(window.localStorage.getItem('tracegraph:sidebar-collapsed')).toBe('0');
    window.localStorage.clear();
  });

  it('auto-collapses the rail on small laptops (lg–xl) regardless of the saved preference', async () => {
    mockMatchMedia({ '(min-width: 1024px)': true, '(min-width: 1280px)': false });
    window.localStorage.setItem('tracegraph:sidebar-collapsed', '0'); // saved expanded
    renderShell();

    // Forced collapsed: nav is icon-only, toggle is pinned disabled.
    expect(await screen.findByRole('link', { name: 'Overview' })).toHaveAttribute('aria-label', 'Overview');
    const toggle = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(toggle).toBeDisabled();
    // The saved preference is untouched (the override applies only here).
    expect(window.localStorage.getItem('tracegraph:sidebar-collapsed')).toBe('0');
  });

  it('keeps the saved preference on wide screens (xl+)', async () => {
    mockMatchMedia({ '(min-width: 1024px)': true, '(min-width: 1280px)': true });
    window.localStorage.setItem('tracegraph:sidebar-collapsed', '0'); // saved expanded
    renderShell();

    // Expanded with full labels, and the toggle is enabled.
    const overview = await screen.findByRole('link', { name: 'Overview' });
    expect(overview).toHaveTextContent('Overview');
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeEnabled();

    // Collapsing at xl+ writes the preference, and the rail stays collapsed.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeEnabled();
    expect(window.localStorage.getItem('tracegraph:sidebar-collapsed')).toBe('1');
    window.localStorage.clear();
  });
});
