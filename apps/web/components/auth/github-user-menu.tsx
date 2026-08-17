'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu } from '@base-ui/react/menu';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  LayoutGrid,
  LogOut,
  Moon,
  Network,
  Radar,
  ScanSearch,
  Sun,
  Workflow,
} from 'lucide-react';
import { GitHubMark } from '@/components/auth/github-sign-in-button';
import { useGitHubSession } from '@/hooks/use-github-session';
import { useTheme } from '@/components/theme-provider';

interface GitHubUserMenuProps {
  /** Sidebar rail mode — avatar-only trigger (used by the collapsed rail). */
  collapsed?: boolean;
  /**
   * Where the control lives:
   * - `sidebar` (default): full-width row with name + handle, opens upward
   *   (the trigger sits at the sidebar's bottom edge).
   * - `header`: compact avatar pill, opens downward (top-of-page headers).
   */
  variant?: 'sidebar' | 'header';
}

/**
 * Signed-in account control with rich profile options:
 * - Verified GitHub identity card with external profile link
 * - Direct workspace navigation shortcuts
 * - Theme switcher (Dark / Light)
 * - Sign out session control
 */
export function GitHubUserMenu({ collapsed = false, variant = 'sidebar' }: GitHubUserMenuProps) {
  const router = useRouter();
  const { user, signOut } = useGitHubSession();
  const { theme, toggleTheme } = useTheme();

  if (!user) {
    return null;
  }

  const initial = (user.name || user.login || '?').charAt(0).toUpperCase();
  const isHeader = variant === 'header';
  const githubProfileUrl = `https://github.com/${user.login}`;

  const navShortcuts = [
    { label: 'Overview', href: '/dashboard', icon: LayoutGrid },
    { label: 'Graph View', href: '/graph', icon: Network },
    { label: 'Dependencies', href: '/dependencies', icon: Workflow },
    { label: 'Impact Radar', href: '/impact', icon: Radar },
    { label: 'Intelligence', href: '/intelligence', icon: ScanSearch },
  ];

  const menuContent = (
    <Menu.Popup className="z-50 min-w-64 max-w-72 rounded-xl border border-border/80 bg-popover/95 p-2 shadow-2xl backdrop-blur-md outline-none animate-in fade-in zoom-in-95 duration-150">
      {/* Profile Header */}
      <div className="flex items-center gap-3 border-b border-border/60 px-2.5 py-2.5 pb-3">
        <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-sm font-semibold text-white ring-2 ring-sky-400/30">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">
            {user.name || user.login}
          </p>
          <div className="flex items-center gap-1.5 pt-0.5">
            <GitHubMark className="size-3 text-muted-foreground" />
            <p className="truncate font-mono text-xs text-muted-foreground">@{user.login}</p>
          </div>
        </div>
      </div>

      {/* GitHub Profile External Link */}
      <div className="py-1">
        <a
          href={githubProfileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted"
        >
          <span className="flex items-center gap-2">
            <GitHubMark className="size-3.5" />
            GitHub Profile
          </span>
          <ExternalLink className="size-3 opacity-60" />
        </a>
      </div>

      {/* Workspace Quick Navigation */}
      <div className="border-t border-border/50 py-1">
        <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Navigation
        </p>
        <div className="flex flex-col gap-0.5">
          {navShortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Menu.Item
                key={item.href}
                onClick={() => router.push(item.href)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted"
              >
                <Icon className="size-3.5 text-sky-500 dark:text-sky-400" />
                <span>{item.label}</span>
              </Menu.Item>
            );
          })}
        </div>
      </div>

      {/* Preferences & Appearance */}
      <div className="border-t border-border/50 py-1">
        <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Preferences
        </p>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted"
        >
          <span className="flex items-center gap-2.5">
            {theme === 'dark' ? (
              <Moon className="size-3.5 text-indigo-400" />
            ) : (
              <Sun className="size-3.5 text-amber-400" />
            )}
            <span>Theme</span>
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            {theme}
          </span>
        </button>
      </div>

      {/* Sign Out */}
      <div className="border-t border-border/50 pt-1">
        <Menu.Item
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void signOut();
          }}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10"
        >
          <LogOut className="size-3.5" />
          <span>Sign out</span>
        </Menu.Item>
      </div>
    </Menu.Popup>
  );

  // In expanded sidebar mode, provide full row trigger + direct one-click sign out button
  if (!isHeader && !collapsed) {
    return (
      <div className="flex w-full items-center justify-between gap-1.5">
        <Menu.Root>
          <Menu.Trigger
            render={
              <button
                type="button"
                aria-label="Account menu"
                className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 text-left outline-none transition-all hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-xs font-semibold text-white ring-1 ring-white/20">
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initial
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-medium text-foreground group-hover:text-sky-400 transition-colors">
                    {user.name || user.login}
                  </span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    @{user.login}
                  </span>
                </span>
                <ChevronUp
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                />
              </button>
            }
          />
          <Menu.Portal>
            <Menu.Positioner side="top" align="start" sideOffset={10}>
              {menuContent}
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void signOut();
          }}
          aria-label="Sign out"
          title="Sign out"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition-all hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    );
  }

  // Header or collapsed sidebar rail mode
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <button
            type="button"
            aria-label="Account menu"
            title={collapsed || isHeader ? user.name || user.login : undefined}
            className={
              isHeader
                ? 'flex items-center gap-2 rounded-full border border-border/60 bg-background/50 py-1 pr-2.5 pl-1 outline-none transition-colors duration-200 hover:border-sky-400/40 hover:bg-background/80 focus-visible:ring-2 focus-visible:ring-ring'
                : 'flex size-9 items-center justify-center rounded-lg p-1 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring'
            }
          >
            <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-xs font-semibold text-white ring-1 ring-white/20">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                initial
              )}
            </span>
            {isHeader ? (
              <>
                <span className="hidden max-w-28 truncate text-sm font-medium text-foreground sm:block">
                  {user.name || user.login}
                </span>
                <ChevronDown
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 [.group:has([aria-expanded=true])_&]:rotate-180"
                />
              </>
            ) : null}
          </button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner
          side={isHeader ? 'bottom' : 'right'}
          align={isHeader ? 'end' : 'start'}
          sideOffset={isHeader ? 10 : 12}
        >
          {menuContent}
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export type { GitHubUserMenuProps };

