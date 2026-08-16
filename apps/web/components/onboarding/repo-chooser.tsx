'use client';

import { useMemo, useState } from 'react';
import {
  Braces,
  CheckCircle2,
  Clock,
  FileCode2,
  FolderGit2,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import type {
  GithubImportJob,
  GithubImportResult,
  GithubRepo,
  GithubImportStage,
} from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGitHubSession } from '@/hooks/use-github-session';
import { useRepositoryContext } from '@/components/layout/repository-provider';
import { githubService } from '@/lib/services/github.service';
import { formatRelativeTime } from '@/lib/format';

type Mode = 'intro' | 'picker';

const IMPORT_STAGES: Array<{ id: GithubImportStage; label: string }> = [
  { id: 'fetching', label: 'Fetching repository files' },
  { id: 'parsing', label: 'Parsing source code' },
  { id: 'building', label: 'Building the graph model' },
  { id: 'history', label: 'Writing engineering history' },
  { id: 'persisting', label: 'Persisting to the graph' },
];

const STAGE_INDEX: Record<GithubImportStage, number> = {
  fetching: 0,
  parsing: 1,
  building: 2,
  history: 3,
  persisting: 4,
};

/**
 * Onboarding — the app's only way to get data. Signed-in users pick one of
 * their GitHub repositories and import it into the graph. Every state
 * (intro → list → importing → success/error) is handled here so the rest of
 * the app only ever deals with "no repository" or a real one.
 */
export function RepoChooser() {
  const { getToken } = useGitHubSession();
  const { refresh } = useRepositoryContext();

  const [mode, setMode] = useState<Mode>('intro');
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [importingName, setImportingName] = useState<string | null>(null);
  const [importStage, setImportStage] = useState<GithubImportStage | 'none'>('none');
  const [importDetail, setImportDetail] = useState<string | undefined>(undefined);
  const [importError, setImportError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<GithubImportResult | null>(null);

  const loadRepos = async () => {
    // Move to the picker view immediately so loading and error states are
    // visible — the error UI lives there and must render even on failure.
    setMode('picker');
    setReposLoading(true);
    setReposError(null);
    setRepos(null);
    setImportError(null);
    try {
      const token = await getToken();
      const list = await githubService.listRepos(token);
      setRepos(list);
    } catch (err) {
      setReposError(err instanceof Error ? err.message : 'Could not load your repositories.');
    } finally {
      setReposLoading(false);
    }
  };

  const importRepo = async (repo: GithubRepo) => {
    setImportingName(repo.fullName);
    setImportStage('fetching');
    setImportDetail(undefined);
    setImportError(null);
    setLastResult(null);
    try {
      const token = await getToken();
      const onStatus = (job: GithubImportJob) => {
        setImportStage(job.status === 'running' ? job.stage : 'none');
        setImportDetail(job.detail);
      };
      const result = await githubService.importRepo(repo.fullName, token, onStatus);
      setLastResult(result);
      // The repository context re-fetches; once it succeeds the empty state
      // unmounts and the dashboard renders the real overview.
      void refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'The import failed unexpectedly.');
    } finally {
      setImportStage('none');
      setImportDetail(undefined);
      setImportingName(null);
    }
  };

  const filtered = useMemo(() => {
    if (!repos) return [];
    const q = search.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q),
    );
  }, [repos, search]);

  // ── Import in progress: a staged stepper replaces the list so the user
  // sees exactly what the pipeline is doing instead of a static spinner. ──
  if (importingName) {
    const currentIndex = importStage === 'none' ? -1 : STAGE_INDEX[importStage];
    const progress =
      currentIndex < 0
        ? 0
        : Math.round(((currentIndex + 0.6) / IMPORT_STAGES.length) * 100);
    return (
      <Card className="mx-auto w-full max-w-xl">
        <CardHeader className="gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
            Importing {importingName}
          </CardTitle>
          <CardDescription>
            Mapping files, symbols, dependencies and history into the graph.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={`Import progress: ${progress}%`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <ol className="flex flex-col gap-1" data-testid="import-stages">
            {IMPORT_STAGES.map(({ id, label }, index) => {
              const done = currentIndex > index;
              const active = currentIndex === index;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm"
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? (
                    <CheckCircle2
                      className="size-4 shrink-0 text-emerald-500"
                      aria-hidden
                    />
                  ) : active ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                  ) : (
                    <span
                      className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/25"
                      aria-hidden
                    />
                  )}
                  <span
                    className={
                      done
                        ? 'text-muted-foreground line-through decoration-muted-foreground/40'
                        : active
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground/60'
                    }
                  >
                    {label}
                  </span>
                  {active && importDetail ? (
                    <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
                      {importDetail}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <p className="text-xs text-muted-foreground">
            Large repositories can take a minute — the graph is written in batches as each
            stage completes. You can leave this page; the import keeps running.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (mode === 'intro') {
    return (
      <Card className="mx-auto w-full max-w-xl">
        <CardHeader className="items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderGit2 className="size-5" aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">Import a repository to get started</CardTitle>
            <CardDescription className="max-w-md">
              The graph is empty. Pick one of your GitHub repositories and TraceGraph will map
              its files, functions, classes, tests and engineering history into a queryable
              relationship graph.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="grid w-full max-w-md grid-cols-3 gap-2 text-center">
            {[
              { icon: FileCode2, label: 'Files & symbols' },
              { icon: Braces, label: 'Dependencies' },
              { icon: Clock, label: 'Commits & PRs' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1.5 rounded-lg border bg-muted/30 px-2 py-3"
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
          <Button size="lg" onClick={() => void loadRepos()}>
            <FolderGit2 className="size-4" aria-hidden />
            Choose a repository
          </Button>
          <p className="text-xs text-muted-foreground">
            Read-only access to your public repositories — nothing is written to GitHub.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Choose a repository</CardTitle>
        <CardDescription>
          Repositories are scanned and mapped into the graph — usually under a minute for a
          typical codebase.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
        {reposLoading && (
          <div className="flex flex-col gap-2" data-testid="repo-list-loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        )}

        {/* Load error */}
        {reposError && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
            <XCircle className="size-5 text-destructive" aria-hidden />
            <p className="text-sm font-medium">Couldn&apos;t load your repositories</p>
            <p className="max-w-sm text-xs text-muted-foreground">{reposError}</p>
            <Button variant="outline" size="sm" onClick={() => void loadRepos()}>
              <RefreshCw className="size-3.5" aria-hidden />
              Try again
            </Button>
          </div>
        )}

        {/* Empty list */}
        {!reposLoading && !reposError && repos && repos.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
            <FolderGit2 className="size-5 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium">No repositories found</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Your GitHub account has no repositories yet. Create one, then come back and
              refresh.
            </p>
            <Button variant="outline" size="sm" onClick={() => void loadRepos()}>
              <RefreshCw className="size-3.5" aria-hidden />
              Refresh
            </Button>
          </div>
        )}

        {/* No matches */}
        {!reposLoading && !reposError && repos && repos.length > 0 && filtered.length === 0 && (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No repositories match “{search}”.
          </p>
        )}

        {/* Repo list */}
        {!reposLoading && !reposError && filtered.length > 0 && (
          <ul className="flex flex-col gap-2" data-testid="repo-list">
            {filtered.map((repo) => {
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
                      {repo.private && (
                        <Badge variant="secondary">
                          <Lock className="size-3" aria-hidden />
                          Private
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
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" aria-hidden />
                        Updated {formatRelativeTime(repo.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {lastResult?.fullName === repo.fullName && (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        Imported
                      </span>
                    )}
                    <Button
                      size="sm"
                      disabled={importingName !== null}
                      onClick={() => void importRepo(repo)}
                    >
                      Import
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Import success summary */}
        {lastResult && (
          <p className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-medium">{lastResult.fullName}</span> imported —{' '}
              {lastResult.files} files, {lastResult.functions} functions, {lastResult.classes}{' '}
              classes, {lastResult.tests} tests, {lastResult.commits} commits,{' '}
              {lastResult.relationshipsCreated} relationships.
            </span>
          </p>
        )}

        {/* Import error */}
        {importError && (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
            <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{importError}</span>
          </p>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Not seeing what you expect?{' '}
          <button
            type="button"
            onClick={() => void loadRepos()}
            className="text-primary underline-offset-4 hover:underline"
          >
            Reload the list
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
