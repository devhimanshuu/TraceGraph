'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FlaskConical, FolderGit2, LayoutGrid, Network, Radar, ScanSearch, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutGrid },
  { href: '/repositories', label: 'Repositories', icon: FolderGit2 },
  { href: '/graph', label: 'Graph', icon: Network },
  { href: '/dependencies', label: 'Dependencies', icon: Workflow },
  { href: '/impact', label: 'Impact', icon: Radar },
  { href: '/intelligence', label: 'Intelligence', icon: ScanSearch },
  { href: '/test-intelligence', label: 'Tests', icon: FlaskConical },
] as const;

/**
 * Primary application navigation. The active item carries `aria-current="page"`
 * and a left accent bar so it is discoverable without relying on color alone.
 * When `collapsed`, items render icon-only (centered) with a tooltip so the
 * rail stays usable at its narrow width.
 */
export function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-2">
      {!collapsed ? (
        <p className="px-3 font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
          Workspace
        </p>
      ) : null}
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                'relative flex items-center rounded-lg text-sm transition-[color,background-color]',
                collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2',
                active
                  ? 'bg-gradient-to-r from-sky-500/15 via-primary/5 to-transparent font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              {active ? (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.7)]"
                />
              ) : null}
              <Icon
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  active && 'text-sky-500 dark:text-sky-400',
                )}
              />
              {!collapsed ? label : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
