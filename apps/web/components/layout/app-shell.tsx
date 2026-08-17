'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { Logo } from '@/components/logo';
import { GitHubUserMenu } from '@/components/auth/github-user-menu';
import { Wordmark } from '@/components/wordmark';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { RepositorySwitcher } from '@/components/layout/repository-switcher';
import { SystemStatus } from '@/components/layout/system-status';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Storage key so the collapsed state survives reloads. */
const SIDEBAR_COLLAPSED_KEY = 'tracegraph:sidebar-collapsed';

/** Sidebar contents, shared between the desktop rail and the mobile drawer. */
function SidebarContent({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex flex-col gap-2.5 border-b border-border/60', collapsed ? 'items-center px-2 py-4' : 'px-4 py-4')}>
        {collapsed ? <Logo /> : <Wordmark href="/dashboard" />}
        {/* Active repository — compact dropdown in the header (not a footer button) */}
        <RepositorySwitcher collapsed={collapsed} />
      </div>

      <div className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
        <SidebarNav collapsed={collapsed} />
      </div>

      <div className={cn('flex flex-col gap-3 border-t border-border/60 py-4', collapsed ? 'items-center px-2' : 'px-4')}>
        <div className={cn('flex flex-col gap-0.5', collapsed ? 'w-full' : '')}>
          <GitHubUserMenu collapsed={collapsed} />
        </div>
        <div className={collapsed ? 'px-0' : 'px-1'}>
          <SystemStatus collapsed={collapsed} />
        </div>
      </div>
    </div>
  );
}

/**
 * Application shell: fixed sidebar on desktop (lg+), a top bar with a
 * slide-in drawer on smaller screens, and the main content area. The shell is
 * shared by every future workspace route (graph, dependencies, impact).
 * The desktop sidebar collapses to an icon rail via the edge toggle; the
 * preference persists to localStorage and is remembered across visits.
 *
 * On small laptops (lg up to but not including xl) the rail auto-collapses so
 * content keeps a usable width; that override applies only in that range and
 * the saved preference governs everywhere else (xl+).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });

  // True on lg–xl screens (1024 ≤ width < 1280). Fall back to false when
  // matchMedia is unavailable (SSR / test envs) so behavior is unchanged.
  const [isNarrowDesktop, setIsNarrowDesktop] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mqLg = window.matchMedia('(min-width: 1024px)');
    const mqXl = window.matchMedia('(min-width: 1280px)');
    const update = () => setIsNarrowDesktop(mqLg.matches && !mqXl.matches);
    update();
    mqLg.addEventListener('change', update);
    mqXl.addEventListener('change', update);
    return () => {
      mqLg.removeEventListener('change', update);
      mqXl.removeEventListener('change', update);
    };
  }, []);

  // The rail is pinned collapsed on small laptops; elsewhere the saved
  // preference decides.
  const forcedCollapsed = isNarrowDesktop;
  const effectiveCollapsed = forcedCollapsed || collapsed;

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar — hidden when printing the impact report */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-border/60 bg-card/30 transition-[width] duration-200 ease-out lg:block print:hidden',
          effectiveCollapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarContent collapsed={effectiveCollapsed} />

        {/* Collapse toggle — rides the rail's inner edge. Pinned disabled on
            small laptops where the rail is auto-collapsed. */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          disabled={forcedCollapsed}
          aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={
            forcedCollapsed
              ? 'Sidebar is auto-collapsed on this screen size'
              : effectiveCollapsed
                ? 'Expand sidebar'
                : 'Collapse sidebar'
          }
          className={cn(
            'absolute top-4 -right-3 z-10 size-6 rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm hover:text-foreground',
            forcedCollapsed && 'cursor-not-allowed opacity-40 hover:text-muted-foreground',
          )}
        >
          {effectiveCollapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </Button>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur lg:hidden print:hidden">
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation menu"
                className="size-10"
              >
                <Menu className="size-5" />
              </Button>
            }
          />
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
            <Dialog.Popup className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border/60 bg-background shadow-xl outline-none animate-in slide-in-from-left duration-200">
              <SidebarContent collapsed={false} />
              <Dialog.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close navigation menu"
                    className="absolute right-2 top-3 z-10 size-10"
                  >
                    <X className="size-4" />
                  </Button>
                }
              />
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>

        <Wordmark href="/dashboard" />
      </header>

      {/* Main content — padding-left animates in lockstep with the sidebar
          width so the collapse feels continuous. When the rail is collapsed
          the content uncaps (lg:max-w-none) and uses the entire freed width;
          the expanded reading width stays capped at max-w-6xl. */}
      <div className={cn('transition-[padding] duration-200 ease-out print:pl-0', effectiveCollapsed ? 'lg:pl-16' : 'lg:pl-60')}>
        <main
          className={cn(
            'mx-auto w-full px-4 py-8 sm:px-6 lg:py-10 print:max-w-none print:px-0 print:py-0',
            effectiveCollapsed ? 'lg:max-w-none' : 'max-w-6xl',
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
