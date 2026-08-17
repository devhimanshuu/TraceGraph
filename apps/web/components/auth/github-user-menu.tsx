'use client';

import { Menu } from '@base-ui/react/menu';
import { ChevronDown, ChevronUp, LogOut } from 'lucide-react';
import { useGitHubSession } from '@/hooks/use-github-session';

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
 * Signed-in account control. The sidebar variant is a full-width row with the
 * avatar, name and handle; the header variant is a compact avatar pill. Both
 * open a small menu carrying the verified identity and sign-out.
 *
 * The popup opens toward the page interior on purpose: `side="top"` for the
 * sidebar (bottom edge) and `side="bottom"` for the header (top edge), so the
 * menu is always fully on-screen.
 */
export function GitHubUserMenu({ collapsed = false, variant = 'sidebar' }: GitHubUserMenuProps) {
  const { user, signOut } = useGitHubSession();

  if (!user) {
    return null;
  }

  const initial = (user.name || user.login || '?').charAt(0).toUpperCase();
  const isHeader = variant === 'header';

  // In expanded sidebar mode, provide a rich account row with a direct, dedicated Sign Out button
  // so the user never has to fight popups or hidden dropdowns to log out.
  if (!isHeader && !collapsed) {
    return (
      <div className="flex w-full items-center justify-between gap-2">
        <Menu.Root>
          <Menu.Trigger
            render={
              <button
                type="button"
                aria-label="Account menu"
                className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-xs font-semibold text-white ring-1 ring-white/20">
                  {user.avatarUrl ? (
                    // GitHub-hosted avatar (remote origin — plain img, no optimizer).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initial
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-medium text-foreground">
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
            <Menu.Positioner side="top" align="start" sideOffset={8}>
              <Menu.Popup className="z-50 min-w-52 rounded-lg border border-border/70 bg-popover p-1.5 shadow-xl outline-none">
                <div className="border-b border-border/60 px-3 py-2">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {user.name || user.login}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">@{user.login}</p>
                </div>
                <Menu.Item
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void signOut();
                  }}
                  className="mt-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10"
                >
                  <LogOut className="size-4" />
                  Sign out
                </Menu.Item>
              </Menu.Popup>
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
          <LogOut className="size-4" />
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
                // GitHub-hosted avatar (remote origin — plain img, no optimizer).
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
          <Menu.Popup className="z-50 min-w-52 rounded-lg border border-border/70 bg-popover p-1.5 shadow-xl outline-none">
            <div className="border-b border-border/60 px-3 py-2">
              <p className="truncate text-sm font-semibold leading-tight">
                {user.name || user.login}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">@{user.login}</p>
            </div>
            <Menu.Item
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void signOut();
              }}
              className="mt-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10"
            >
              <LogOut className="size-4" />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export type { GitHubUserMenuProps };
