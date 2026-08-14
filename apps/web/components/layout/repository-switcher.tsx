'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@base-ui/react/dialog';
import {
  CheckCircle2,
  FolderGit2,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import type { GithubRepo } from '@tracegraph/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useGitHubSession } from '@/hooks/use-github-session';
import { useRepositoryContext } from '@/components/layout/repository-provider';
import { githubService } from '@/lib/services/github.service';
import { repositoryService } from '@/lib/services/repository.service';
import { formatRelativeTime } from '@/lib/format';

/**
 * Sidebar "Switch repository" control. Opens a dialog listing the signed-in
 * user's GitHub repositories: already-imported ones get a one-click Switch,
 * anything else is imported on demand (which also becomes the active repo).
 * After a switch/import the repository context refreshes and the user lands
 * back on the dashboard so the new overview is immediately visible.
 */
export function RepositorySwitcher() {
  const router = useRouter();
  const { getToken } = useGitHubSession();
  const { repository, refresh } = useRepositoryContext();

  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const token = await getToken();
      const [ghRepos, importedRepos] = await Promise.all([
        githubService.listRepos(token),
        repositoryService.getImportedRepositories(token),
      ]);
      setRepos(ghRepos);
      setImported(new Set(importedRepos.map((r) => r.fullName)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your repositories.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const switchRepo = async (repo: GithubRepo) => {
    setBusy(repo.fullName);
    setActionError(null);
    try {
      const token = await getToken();
      // Already imported → just flip the active flag; otherwise import first
      // (import marks the repo active server-side).
      if (!imported.has(repo.fullName)) {
        await githubService.importRepo(repo.fullName, token);
      } else {
        const repoId = `repo:${repo.fullName}`;
        await repositoryService.setActiveRepository(repoId, token);
      }
      await refresh();
      setOpen(false);
      router.push('/dashboard');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Switching repositories failed.');
    } finally {
      setBusy(null);
    }
  };

  const filtered = repos
    ? repos.filter((r) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          r.fullName.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q)
        );
      })
    : [];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FolderGit2 className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate font-medium">
              {repository ? `Switch repository` : 'Import a repository'}
            </span>
          </button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs animate-in fade-in" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/80 bg-card shadow-2xl outline-none animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <FolderGit2 className="size-4 text-primary" aria-hidden />
              <p className="text-sm font-semibold">Choose a repository</p>
            </div>
            <Dialog.Close
              render={
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  Close
                </Button>
              }
            />
          </div>

          <div className="flex flex-col gap-3 p-4">
            {/* Search */}
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter repositories…"
                aria-label="Filter repositories"
                className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex flex-col gap-2" data-testid="repo-switcher-loading">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            )}

            {/* Load error */}
            {error && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
                <XCircle className="size-5 text-destructive" aria-hidden />
                <p className="text-sm font-medium">Couldn&apos;t load your repositories</p>
                <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  <RefreshCw className="size-3.5" aria-hidden />
                  Try again
                </Button>
              </div>
            )}

            {/* Empty list */}
            {!loading && !error && repos && repos.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
                <FolderGit2 className="size-5 text-muted-foreground/60" aria-hidden />
                <p className="text-sm font-medium">No repositories found</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Your GitHub account has no repositories yet.
                </p>
              </div>
            )}

            {/* No matches */}
            {!loading && !error && repos && repos.length > 0 && filtered.length === 0 && (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No repositories match “{search}”.
              </p>
            )}

            {/* Repo list */}
            {!loading && !error && filtered.length > 0 && (
              <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
                {filtered.map((repo) => {
                  const isImported = imported.has(repo.fullName);
                  const isBusy = busy === repo.fullName;
                  return (
                    <li
                      key={repo.fullName}
                      className="flex flex-col gap-2 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-mono text-sm font-medium">
                            {repo.fullName}
                          </span>
                          {isImported && (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              <CheckCircle2 className="size-3 text-emerald-500" aria-hidden />
                              Mapped
                            </Badge>
                          )}
                        </div>
                        {repo.description ? (
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {repo.description}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground/50">No description</p>
                        )}
                        <div className="flex items-center gap-2 text-[0.7rem] text-muted-foreground">
                          {repo.language ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                              {repo.language}
                            </span>
                          ) : (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono">—</span>
                          )}
                          <span>Updated {formatRelativeTime(repo.updatedAt)}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isImported ? 'outline' : 'default'}
                        disabled={busy !== null}
                        onClick={() => void switchRepo(repo)}
                        aria-busy={isBusy}
                        className="shrink-0 gap-1.5"
                      >
                        {isBusy ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                            {isImported ? 'Switching…' : 'Importing…'}
                          </>
                        ) : isImported ? (
                          'Switch'
                        ) : (
                          'Import'
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Action error */}
            {actionError && (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{actionError}</span>
              </p>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Not seeing what you expect?{' '}
              <button
                type="button"
                onClick={() => void load()}
                className="text-primary underline-offset-4 hover:underline"
              >
                Reload the list
              </button>
            </p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
