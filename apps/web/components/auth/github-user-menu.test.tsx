import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { GitHubUserMenu } from './github-user-menu';

// The menu toggles the app theme, which needs the ThemeProvider context.
function renderMenu(props?: Parameters<typeof GitHubUserMenu>[0]) {
  return render(
    <ThemeProvider>
      <GitHubUserMenu {...props} />
    </ThemeProvider>,
  );
}

// The global vitest.setup mocks useGitHubSession with a signed-in user and a
// stable signOut; override it here so each test controls the signOut spy.
const signOut = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/use-github-session', () => ({
  useGitHubSession: () => ({
    user: { id: 'user_1', login: 'auditor', name: 'Audit User', avatarUrl: '' },
    isSignedIn: true,
    loading: false,
    getToken: vi.fn().mockResolvedValue('test-token'),
    signOut,
  }),
}));

describe('GitHubUserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the verified identity (avatar initial + name + handle)', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
    expect(screen.getByText('Audit User')).toBeInTheDocument();
    expect(screen.getByText('@auditor')).toBeInTheDocument();
  });

  it('opens the menu and invokes signOut from the Sign out item', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));

    const signOutItem = screen.getByRole('menuitem', { name: /Sign out/i });
    expect(signOutItem).toBeInTheDocument();

    fireEvent.click(signOutItem);

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('header variant renders a compact pill and opens the menu', () => {
    renderMenu({ variant: 'header' });

    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger).toBeInTheDocument();
    // Compact pill still carries the identity, no sidebar handle row.
    expect(screen.getByText('Audit User')).toBeInTheDocument();
    expect(screen.queryByText('@auditor')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByRole('menuitem', { name: /Sign out/i })).toBeInTheDocument();
  });

  it('renders rich profile options (GitHub profile link, navigation shortcuts, theme toggle, sign out) when opened', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));

    expect(screen.getByText('GitHub Profile')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Graph View/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Dependencies/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Impact Radar/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Intelligence/i })).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Sign out/i })).toBeInTheDocument();
  });
});

