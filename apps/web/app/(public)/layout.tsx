import type { ReactNode } from 'react';
import { SiteNav } from '@/components/site-nav';

/** Public marketing pages — landing page with auth controls. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      {children}
    </div>
  );
}
