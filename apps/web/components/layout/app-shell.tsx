'use client';

import { useState, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Menu, X } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { Wordmark } from '@/components/wordmark';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { SystemStatus } from '@/components/layout/system-status';
import { useRepositoryContext } from '@/components/layout/repository-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/** Sidebar contents, shared between the desktop rail and the mobile drawer. */
function SidebarContent() {
  const { repository } = useRepositoryContext();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-5 py-4">
        <Wordmark href="/dashboard" />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <SidebarNav />
      </div>

      <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-4">
        <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card/50 px-3 py-2.5">
          {repository ? (
            <>
              <p className="truncate text-sm font-medium" title={repository.fullName}>
                {repository.name}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {repository.language}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {repository.defaultBranch}
                </Badge>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Loading repository…</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-1">
          <SystemStatus />
          <UserButton />
        </div>
      </div>
    </div>
  );
}

/**
 * Application shell: fixed sidebar on desktop (lg+), a top bar with a
 * slide-in drawer on smaller screens, and the main content area. The shell is
 * shared by every future workspace route (graph, dependencies, impact).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar — hidden when printing the impact report */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border/60 bg-card/30 lg:block print:hidden">
        <SidebarContent />
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
            <Dialog.Popup
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border/60 bg-background shadow-xl outline-none animate-in slide-in-from-left duration-200"
            >
              <SidebarContent />
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

      {/* Main content */}
      <div className="lg:pl-60 print:pl-0">
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10 print:max-w-none print:px-0 print:py-0">
          {children}
        </main>
      </div>
    </div>
  );
}
