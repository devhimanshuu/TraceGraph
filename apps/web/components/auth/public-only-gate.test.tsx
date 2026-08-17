import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useGitHubSession } from '@/hooks/use-github-session';
import { PublicOnlyGate } from './public-only-gate';

// Controllable hook + router (the setup mocks default to signed-in and to a
// router whose replace is unreachable, neither of which fits this gate).
vi.mock('@/hooks/use-github-session', () => ({
  useGitHubSession: vi.fn(),
}));

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
}));

function renderGate() {
  return render(
    <PublicOnlyGate>
      <main data-testid="landing">Landing page</main>
    </PublicOnlyGate>,
  );
}

const mockedUseSession = vi.mocked(useGitHubSession);

beforeEach(() => {
  replace.mockReset();
});

describe('PublicOnlyGate', () => {
  it('shows nothing while the session bootstrap runs', () => {
    mockedUseSession.mockReturnValue({
      user: null,
      isSignedIn: false,
      loading: true,
      getToken: vi.fn(),
      signOut: vi.fn(),
    });

    renderGate();

    expect(screen.queryByTestId('landing')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders the marketing page for signed-out visitors and never redirects', () => {
    mockedUseSession.mockReturnValue({
      user: null,
      isSignedIn: false,
      loading: false,
      getToken: vi.fn(),
      signOut: vi.fn(),
    });

    renderGate();

    expect(screen.getByTestId('landing')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects a signed-in user to the dashboard and renders no landing flash', () => {
    mockedUseSession.mockReturnValue({
      user: { id: '42', login: 'octocat', name: 'Octo Cat', avatarUrl: '' },
      isSignedIn: true,
      loading: false,
      getToken: vi.fn(),
      signOut: vi.fn(),
    });

    renderGate();

    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(screen.queryByTestId('landing')).not.toBeInTheDocument();
  });
});
