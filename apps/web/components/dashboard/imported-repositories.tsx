'use client';

import { useState } from 'react';
import { CheckCircle2, FolderGit2, Loader2, RefreshCw, SwitchCamera } from 'lucide-react';
import type { ImportedRepository } from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
import { useApiResource } from '@/hooks/use-api-resource';
import { repositoryService } from '@/lib/services/repository.service';

function ImportedRepositoriesSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" data-testid="imported-repos-skeleton" />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Dashboard "Imported repositories" section — every repo mapped into the graph
 * with its active state, plus a one-click Switch. Switching flips the active
 * flag server-side and refreshes the whole dashboard (overview + activity +
 * components) so the new repo's context is immediately visible.
 */
export function ImportedRepositories({ onSwitched }: { onSwitched?: () => Promise<void> }) {
  const { data, loading, error, refresh } = useApiResource<ImportedRepository[]>((token) =>
    repositoryService.getImportedRepositories(token),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const switchRepo = async (repoId: string) => {
    setBusy(repoId);
    setActionError(null);
    try {
      await repositoryService.setActiveRepository(repoId);
      if (onSwitched) await onSwitched();
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Switching repositories failed.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <ImportedRepositoriesSkeleton />;
  if (error) {
    return (
      <SectionError
        title="Couldn't load imported repositories"
        message={error === 'empty' ? 'No repositories mapped yet.' : error}
        onRetry={() => void refresh()}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <FolderGit2 className="size-5 text-muted-foreground/60" aria-hidden />
          <p className="text-sm font-medium">No imported repositories</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Repositories you map will appear here so you can switch between them quickly.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        {actionError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {actionError}
          </p>
        ) : null}
        <ul className="flex flex-col gap-2" data-testid="imported-repos-list">
          {data.map((repo) => {
            const active = repo.active;
            return (
              <li
                key={repo.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={
                      active
                        ? 'flex size-8 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-sky-500 dark:text-sky-400'
                        : 'flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground'
                    }
                  >
                    <FolderGit2 className="size-4" aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">{repo.name}</span>
                      {active ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-sky-500/40 bg-sky-500/10 font-mono text-[9px] uppercase tracking-wider text-sky-500 dark:text-sky-400"
                        >
                          <CheckCircle2 className="size-2.5" aria-hidden />
                          Active
                        </Badge>
                      ) : null}
                    </div>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {repo.fullName}
                      {repo.language ? ` · ${repo.language}` : ''}
                    </span>
                  </div>
                </div>

                <Button
                  variant={active ? 'outline' : 'default'}
                  size="sm"
                  disabled={active || busy !== null}
                  onClick={() => void switchRepo(repo.id)}
                  className="h-7 shrink-0 gap-1.5 text-xs"
                >
                  {busy === repo.id ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <SwitchCamera className="size-3.5" aria-hidden />
                  )}
                  {active ? 'Active' : busy === repo.id ? 'Switching…' : 'Switch'}
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
          <RefreshCw className="size-3" aria-hidden />
          Switching re-analyses the dashboard for the selected repository.
        </p>
      </CardContent>
    </Card>
  );
}
