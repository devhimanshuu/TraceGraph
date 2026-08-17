import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useGitHubSession } from '@/hooks/use-github-session';
import { GitHubSessionProvider } from './github-session-provider';

// The real provider (not the global hook mock) so signOut's actual behavior is
// exercised. A controllable router replaces the global setup mock.
vi.unmock('@/hooks/use-github-session');

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

/** Small consumer exposing the session state + the sign-out action. */
function Consumer() {
  const { user, isSignedIn, signOut } = useGitHubSession();
  return (
    <div>
      <p data-testid="signed-in">{isSignedIn ? 'yes' : 'no'}</p>
      {user ? (
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      ) : null}
    </div>
  );
}

function renderProvider() {
  return render(
    <GitHubSessionProvider>
      <Consumer />
    </GitHubSessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  push.mockReset();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/dashboard');
});

describe('GitHubSessionProvider sign-out', () => {
  it('signs out locally and redirects immediately, revoking server-side with a bounded timeout', async () => {
    // Bootstrap: a stored token validates against /auth/session → signed in.
    window.localStorage.setItem('tg_session_token', 'stored-token');
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/session')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: '42', login: 'octocat', name: 'Octo Cat', avatarUrl: '' },
              token: 'fresh-token',
            }),
        });
      }
      if (url.includes('/auth/logout')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    // Wait for the bootstrap to validate and expose the signed-in state.
    await waitFor(() => expect(screen.getByTestId('signed-in')).toHaveTextContent('yes'));

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Local sign-out is immediate: token gone, user null, redirect fired.
    await waitFor(() => expect(screen.getByTestId('signed-in')).toHaveTextContent('no'));
    expect(window.localStorage.getItem('tg_session_token')).toBeNull();
    expect(push).toHaveBeenCalledWith('/');

    // Server revocation is a best-effort POST with a bounded timeout signal.
    const logoutCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/auth/logout'));
    expect(logoutCall).toBeDefined();
    const [url, init] = logoutCall as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fresh-token');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    vi.unstubAllGlobals();
  });

  it('still signs the user out locally when the logout API is unreachable', async () => {
    window.localStorage.setItem('tg_session_token', 'stored-token');
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/session')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: '42', login: 'octocat', name: 'Octo Cat', avatarUrl: '' },
              token: 'fresh-token',
            }),
        });
      }
      // Simulate a stalled/unreachable API: the request never resolves, but the
      // bounded timeout must not block the local sign-out from completing.
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('signed-in')).toHaveTextContent('yes'));

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByTestId('signed-in')).toHaveTextContent('no'));
    expect(window.localStorage.getItem('tg_session_token')).toBeNull();
    expect(push).toHaveBeenCalledWith('/');
    vi.unstubAllGlobals();
  });
});
