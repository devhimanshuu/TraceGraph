'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useGitHubSession } from '@/hooks/use-github-session';

/**
 * Client-side gate for public/marketing routes (the landing page), the mirror
 * of `SignedInGate`: signed-in users never see the marketing site — they are
 * redirected to the dashboard once the session bootstrap resolves. Nothing
 * renders while the bootstrap runs (`loading`) or after the redirect fires,
 * so there is no flash of the landing page before the user lands in the app.
 *
 * Together with `SignedInGate` this partitions the app cleanly: `/` is only
 * ever shown to signed-out visitors, and the workspace routes only to
 * signed-in users — no loops in either direction.
 */
export function PublicOnlyGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isSignedIn, loading } = useGitHubSession();

  useEffect(() => {
    if (!loading && isSignedIn) {
      router.replace('/dashboard');
    }
  }, [loading, isSignedIn, router]);

  if (loading || isSignedIn) return null;
  return <>{children}</>;
}
