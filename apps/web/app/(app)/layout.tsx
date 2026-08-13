import type { ReactNode } from 'react';
import { RepositoryProvider } from '@/components/layout/repository-provider';
import { AppShell } from '@/components/layout/app-shell';

/**
 * Authenticated application shell — every workspace page (dashboard, graph,
 * dependencies, impact) shares the sidebar navigation, repository context,
 * and system status.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RepositoryProvider>
      <AppShell>{children}</AppShell>
    </RepositoryProvider>
  );
}
