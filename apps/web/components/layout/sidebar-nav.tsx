'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Network, Radar, ScanSearch, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutGrid },
  { href: '/graph', label: 'Graph', icon: Network },
  { href: '/dependencies', label: 'Dependencies', icon: Workflow },
  { href: '/impact', label: 'Impact', icon: Radar },
  { href: '/intelligence', label: 'Intelligence', icon: ScanSearch },
] as const;

/**
 * Primary application navigation. The active item carries `aria-current="page"`
 * and a left accent bar so it is discoverable without relying on color alone.
 */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-2">
      <p className="px-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        Workspace
      </p>
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary/10 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {active ? (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-sky-500"
                />
              ) : null}
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
