'use client';

import { Menu } from '@base-ui/react/menu';
import { ChevronUp, LogOut } from 'lucide-react';
import { useGitHubSession } from '@/hooks/use-github-session';

/**
 * Sidebar account control: a full-width row with the avatar, name and handle,
 * plus a chevron. Clicking it opens a small menu carrying the verified identity
 * and sign-out.
 *
 * The popup opens `side="top"` on purpose: the trigger lives at the bottom edge
 * of the sidebar (and the mobile drawer), so opening downward would push the
 * menu off-screen. Opening upward is always fully visible.
 */
export function GitHubUserMenu() {
  const { user, signOut } = useGitHubSession();

  if (!user) {
    return null;
  }

  const initial = (user.name || user.login || '?').charAt(0).toUpperCase();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <button
            type="button"
            aria-label="Account menu"
            className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
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
              className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 [.group:has([aria-expanded=true])_&]:rotate-180"
            />
          </button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner side="top" align="end" sideOffset={8}>
          <Menu.Popup className="z-50 min-w-52 rounded-lg border border-border/70 bg-popover p-1.5 shadow-xl outline-none">
            <div className="border-b border-border/60 px-3 py-2">
              <p className="truncate text-sm font-semibold leading-tight">
                {user.name || user.login}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">@{user.login}</p>
            </div>
            <Menu.Item
              onClick={() => void signOut()}
              className="mt-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
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
