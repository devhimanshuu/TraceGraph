'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiBaseUrl } from '@/lib/api-client';
import {
  GitHubSessionContext,
  type GitHubSessionUser,
} from '@/hooks/use-github-session';

/** localStorage key for the session bearer token (set after OAuth bootstrap). */
const TOKEN_KEY = 'tg_session_token';

interface SessionResponse {
  user: GitHubSessionUser;
  token: string;
}

/**
 * Owns the GitHub session on the client:
 *
 * - after the OAuth callback lands on `/dashboard?auth=success`, it reads the
 *   httpOnly `tg_session` cookie back through `GET /api/auth/session`, stores
 *   the bearer token, and strips the query parameter
 * - on returning visits it validates the stored token (cookie as fallback)
 * - signed-out visits skip the network entirely (instant render)
 *
 * The token lives in localStorage because the API layer authenticates with
 * `Authorization: Bearer`; the httpOnly cookie is a bootstrap carrier only.
 */
export function GitHubSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<GitHubSessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function bootstrap() {
      const params = new URLSearchParams(window.location.search);
      const hasAuthParam = params.has('auth');
      const stored = window.localStorage.getItem(TOKEN_KEY);

      // Fast path: signed-out visit, nothing to validate.
      if (!hasAuthParam && !stored) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${apiBaseUrl}/auth/session`, {
          // Cookie is the carrier right after OAuth; Bearer validates returns.
          credentials: 'include',
          headers: stored ? { Authorization: `Bearer ${stored}` } : {},
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as SessionResponse;
          window.localStorage.setItem(TOKEN_KEY, data.token);
          setUser(data.user);
          if (hasAuthParam) {
            // First sign-in handoff: the OAuth callback lands on
            // /dashboard?auth=success — this replace just strips the query
            // parameter (a no-op navigation when already on /dashboard).
            router.replace('/dashboard');
            return;
          }
        } else if (stored) {
          // Expired / revoked — drop the stale token.
          window.localStorage.removeItem(TOKEN_KEY);
        }
      } catch {
        // Network hiccup — treat as signed out; the API fails closed anyway.
      } finally {
        if (!ignore) {
          if (hasAuthParam) {
            const url = new URL(window.location.href);
            url.searchParams.delete('auth');
            window.history.replaceState({}, '', url);
          }
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [router]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem(TOKEN_KEY);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
    try {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        cache: 'no-store',
      });
    } catch {
      // Best-effort server revocation — local state clears regardless.
    }
    window.localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    router.push('/');
  }, [router]);

  const value = useMemo(
    () => ({ user, isSignedIn: Boolean(user), loading, getToken, signOut }),
    [user, loading, getToken, signOut],
  );

  return <GitHubSessionContext.Provider value={value}>{children}</GitHubSessionContext.Provider>;
}
