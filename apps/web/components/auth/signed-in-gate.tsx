'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useGitHubSession } from '@/hooks/use-github-session';

/**
 * Client-side authentication gate for the application shell.
 *
 * Route gating lives here, not in the edge middleware: the OAuth callback
 * sets the `tg_session` cookie host-only on the API origin, so middleware on
 * the web origin can never see it (it worked in dev only because browsers
 * share `localhost` cookies across ports). The real security boundary is the
 * API guard, which fails closed with 401 — this gate just spares signed-out
 * visitors the shell + error states by redirecting them to the landing page.
 *
 * Nothing renders while the session bootstrap runs (`loading`), so the
 * post-OAuth handoff to /dashboard?auth=success shows no shell flash, and a
 * signed-out visit bounces to `/` the moment the bootstrap resolves.
 */
export function SignedInGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isSignedIn, loading } = useGitHubSession();

  useEffect(() => {
    if (!loading && !isSignedIn) {
      router.replace('/');
    }
  }, [loading, isSignedIn, router]);

  if (loading || !isSignedIn) return null;
  return <>{children}</>;
}
