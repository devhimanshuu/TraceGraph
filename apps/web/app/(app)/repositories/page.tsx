'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode2,
  FolderGit2,
  GitBranch,
  Globe,
  Languages,
  Loader2,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type {
  RepositoryRecord,
  IndexRun,
  LanguageSummary,
} from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
import { useApiResource } from '@/hooks/use-api-resource';
import { useGitHubSession } from '@/hooks/use-github-session';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ── Language color palette ────────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: 'bg-sky-500',
  JavaScript: 'bg-amber-500',
  Python: 'bg-emerald-500',
  Go: 'bg-cyan-500',
  Java: 'bg-orange-500',
  Rust: 'bg-red-500',
  PHP: 'bg-violet-500',
  'C#': 'bg-indigo-500',
  Unknown: 'bg-muted-foreground/30',
};

// ── Status helpers ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle2 className="size-4 text-emerald-500" />;
    case 'RUNNING':
    case 'PENDING':
      return <Loader2 className="size-4 animate-spin text-sky-500" />;
    case 'FAILED':
      return <XCircle className="size-4 text-destructive" />;
    case 'CANCELLED':
      return <Clock className="size-4 text-muted-foreground" />;
    default:
      return <Clock className="size-4 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
    RUNNING: 'border-sky-500/40 bg-sky-500/10 text-sky-500',
    PENDING: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
    FAILED: 'border-destructive/40 bg-destructive/10 text-destructive',
    CANCELLED: 'border-muted-foreground/40 bg-muted/50 text-muted-foreground',
  };
  return (
    <Badge variant="outline" className={cn('gap-1 font-mono text-[9px] uppercase tracking-wider', colors[status] ?? colors.CANCELLED)}>
      <StatusIcon status={status} />
      {status}
    </Badge>
  );
}

// ── Language bar ─────────────────────────────────────────────────────────────

function LanguageBar({ languages }: { languages: LanguageSummary[] }) {
  const total = languages.reduce((sum, l) => sum + l.fileCount, 0);
  if (total === 0) return null;

  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-muted/50">
      {languages.map((lang) => (
        <div
          key={lang.language}
          className={cn('transition-all duration-500', LANG_COLORS[lang.language] ?? 'bg-muted-foreground/30')}
          style={{ width: `${(lang.fileCount / total) * 100}%` }}
          title={`${lang.language}: ${lang.fileCount} files (${lang.percentage}%)`}
        />
      ))}
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function RepositoryListSkeleton() {
  return (
    <div className="flex flex-col gap-6" data-testid="repo-list-skeleton">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ── Add Repository Form ──────────────────────────────────────────────────────

function AddRepositoryForm({ onCreated }: { onCreated: () => void }) {
  const { getToken } = useGitHubSession();
  const [url, setUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const token = await getToken();
      await apiClient.createRepository({ sourceType: 'GITHUB_PUBLIC', sourceUrl: url.trim() }, token);
      setUrl('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create repository');
    } finally {
      setCreating(false);
    }
  }, [url, getToken, onCreated]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Plus className="size-4" aria-hidden />
          Add Repository
        </CardTitle>
        <CardDescription>Enter a public GitHub repository URL to start indexing.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
          <div className="flex gap-2">
            <input
              placeholder="https://github.com/owner/repository"
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              disabled={creating}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button type="submit" disabled={!url.trim() || creating} className="gap-1.5">
              {creating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Globe className="size-4" aria-hidden />
              )}
              {creating ? 'Indexing…' : 'Index Repository'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Repository Card ──────────────────────────────────────────────────────────

function RepositoryCard({
  repo,
  latestRun,
}: {
  repo: RepositoryRecord;
  latestRun: IndexRun | null;
}) {
  const langDist = repo.detectedLanguages;

  return (
    <Link
      href={`/repositories/${repo.id}`}
      className="group block rounded-xl border border-border/60 bg-card/40 p-5 transition-all hover:border-sky-500/30 hover:shadow-[0_0_20px_-5px_rgba(56,189,248,0.15)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
            <FolderGit2 className="size-5" aria-hidden />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">{repo.name}</span>
              {latestRun ? <StatusBadge status={latestRun.status} /> : null}
            </div>
            <span className="truncate font-mono text-[11px] text-muted-foreground">{repo.fullName}</span>
          </div>
        </div>
        <ExternalLink className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-sky-500/60" aria-hidden />
      </div>

      {repo.description ? (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {repo.description}
        </p>
      ) : null}

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {repo.fileCount > 0 ? (
          <span className="flex items-center gap-1">
            <FileCode2 className="size-3" aria-hidden />
            {repo.fileCount.toLocaleString()} files
          </span>
        ) : null}
        {repo.language ? (
          <span className="flex items-center gap-1">
            <GitBranch className="size-3" aria-hidden />
            {repo.language}
          </span>
        ) : null}
        {repo.lastIndexedAt ? (
          <span className="flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            {new Date(repo.lastIndexedAt).toLocaleDateString()}
          </span>
        ) : null}
      </div>

      {/* Language bar */}
      {langDist.length > 0 ? (
        <div className="mt-3">
          <LanguageBar languages={langDist} />
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {langDist.slice(0, 4).map((lang) => (
              <span key={lang.language} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className={cn('size-1.5 rounded-full', LANG_COLORS[lang.language] ?? 'bg-muted-foreground/30')} />
                {lang.language} {lang.percentage}%
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Link>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RepositoriesPage() {
  const { getToken } = useGitHubSession();
  const [repos, setRepos] = useState<Array<{ repo: RepositoryRecord; latestRun: IndexRun | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRepos = useCallback(async () => {
    try {
      const token = await getToken();
      const repoList = await apiClient.listRepositories(token);

      const results = await Promise.all(
        repoList.map(async (repo) => {
          const detail = await apiClient.getRepositoryDetail(repo.id, token);
          return { repo: detail.repository, latestRun: detail.latestRun };
        }),
      );

      setRepos(results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchRepos();
  }, [fetchRepos]);

  // Poll running indexes
  useEffect(() => {
    const hasRunning = repos.some(
      (r) => r.latestRun?.status === 'RUNNING' || r.latestRun?.status === 'PENDING',
    );
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(() => {
        void fetchRepos();
      }, 3000);
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [repos, fetchRepos]);

  if (loading) return <RepositoryListSkeleton />;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <section className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Repository Intelligence
        </p>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">Repositories</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Connect public GitHub repositories to build your engineering context graph.
          </p>
        </div>
      </section>

      {/* Add repository form */}
      <AddRepositoryForm onCreated={() => void fetchRepos()} />

      {/* Error */}
      {error ? (
        <SectionError
          title="Couldn't load repositories"
          message={error}
          onRetry={() => void fetchRepos()}
        />
      ) : null}

      {/* Repository list */}
      {repos.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              {repos.length} {repos.length === 1 ? 'repository' : 'repositories'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchRepos()}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Refresh
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {repos.map(({ repo, latestRun }) => (
              <RepositoryCard key={repo.id} repo={repo} latestRun={latestRun} />
            ))}
          </div>
        </section>
      ) : !error ? (
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-16 text-center">
          <FolderGit2 className="size-8 text-muted-foreground/40" aria-hidden />
          <p className="text-sm font-medium text-muted-foreground">No repositories indexed yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Connect a public GitHub repository to start building your engineering context graph.
          </p>
        </section>
      ) : null}
    </div>
  );
}
