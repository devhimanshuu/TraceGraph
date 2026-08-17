import type { ReactNode } from 'react';
import { PublicOnlyGate } from '@/components/auth/public-only-gate';
import { SiteNav } from '@/components/site-nav';

/**
 * Public marketing pages — landing page with auth controls. The route is
 * public-only: signed-in users are redirected to the dashboard and never see
 * the marketing site (see PublicOnlyGate).
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <PublicOnlyGate>
      <div className="flex min-h-dvh flex-col">
        <SiteNav />
        {children}
      </div>
    </PublicOnlyGate>
  );
}
