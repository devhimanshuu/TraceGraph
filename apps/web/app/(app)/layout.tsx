import type { ReactNode } from 'react';
import { SignedInGate } from '@/components/auth/signed-in-gate';
import { RepositoryProvider } from '@/components/layout/repository-provider';
import { AppShell } from '@/components/layout/app-shell';

/**
 * Authenticated application shell — every workspace page (dashboard, graph,
 * dependencies, impact) shares the sidebar navigation, repository context,
 * and system status. The shell is wrapped in the client-side SignedInGate:
 * signed-out visitors are redirected to the landing page (auth is enforced
 * server-side by the API guard; the gate is UX only).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SignedInGate>
      <RepositoryProvider>
        <AppShell>{children}</AppShell>
      </RepositoryProvider>
    </SignedInGate>
  );
}
