'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode2,
  FolderGit2,
  GitBranch,
  Globe,
  Languages,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { IndexRun, LanguageSummary, RepositoryRecord } from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
    RUNNING: 'border-sky-500/40 bg-sky-500/10 text-sky-500',
    PENDING: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
    FAILED: 'border-destructive/40 bg-destructive/10 text-destructive',
    CANCELLED: 'border-muted-foreground/40 bg-muted/50 text-muted-foreground',
  };
  const icons: Record<string, React.ReactNode> = {
    COMPLETED: <CheckCircle2 className="size-3" />,
    RUNNING: <Loader2 className="size-3 animate-spin" />,
    PENDING: <Clock className="size-3" />,
    FAILED: <XCircle className="size-3" />,
    CANCELLED: <Clock className="size-3" />,
  };
  return (
    <Badge variant="outline" className={cn('gap-1 font-mono text-[9px] uppercase tracking-wider', colors[status] ?? colors.CANCELLED)}>
      {icons[status] ?? <Clock className="size-3" />}
      {status}
    </Badge>
  );
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress, stage }: { progress: number; stage: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{stage}</span>
        <span className="font-mono tabular-nums">{progress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/50">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function RepositoryDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

// ── Index run card ───────────────────────────────────────────────────────────

function IndexRunCard({ run }: { run: IndexRun }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">Run {run.id.split(':').pop()}</span>
          <StatusBadge status={run.status} />
        </div>
        <span className="text-[11px] text-muted-foreground">{formatTime(run.startedAt)}</span>
      </div>

      {run.status === 'RUNNING' ? (
        <ProgressBar progress={run.progress} stage={run.stageLabel} />
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          ['Files', run.filesParsed],
          ['Entities', run.entitiesExtracted],
          ['Relationships', run.relationshipsExtracted],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">{String(label)}</span>
            <span className="text-sm font-semibold tabular-nums">{Number(value).toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Languages */}
      {run.languageDistribution.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {run.languageDistribution.map((lang) => (
            <span key={lang.language} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', LANG_COLORS[lang.language] ?? 'bg-muted-foreground/30')} />
              {lang.language} {lang.percentage}%
            </span>
          ))}
        </div>
      ) : null}

      {/* Error */}
      {run.errorSummary ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {run.errorSummary}
        </div>
      ) : null}

      {/* Duration */}
      {run.durationMs !== null ? (
        <p className="text-[11px] text-muted-foreground">
          Duration: {formatDuration(run.durationMs)}
        </p>
      ) : null}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RepositoryDetailPage() {
  const params = useParams();
  const repoId = params.id as string;
  const { getToken } = useGitHubSession();

  const [repo, setRepo] = useState<RepositoryRecord | null>(null);
  const [runs, setRuns] = useState<IndexRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      const detail = await apiClient.getRepositoryDetail(repoId, token);
      setRepo(detail.repository);
      const indexRuns = await apiClient.getIndexRuns(repoId, token);
      setRuns(indexRuns);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repository');
    } finally {
      setLoading(false);
    }
  }, [repoId, getToken]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Poll while indexing is active
  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === 'RUNNING' || r.status === 'PENDING');
    if (!hasRunning) return;
    const interval = setInterval(() => void fetchData(), 2000);
    return () => clearInterval(interval);
  }, [runs, fetchData]);

  if (loading) return <RepositoryDetailSkeleton />;
  if (error || !repo) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <SectionError
          title="Repository not found"
          message={error ?? 'The repository could not be loaded.'}
          onRetry={() => void fetchData()}
        />
      </div>
    );
  }

  const latestRun = runs[0] ?? null;
  const hasRunning = runs.some((r) => r.status === 'RUNNING' || r.status === 'PENDING');

  return (
    <div className="flex flex-col gap-8">
      {/* Breadcrumb */}
      <Link
        href="/repositories"
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to repositories
      </Link>

      {/* Header */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
            <FolderGit2 className="size-6" aria-hidden />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{repo.name}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{repo.fullName}</span>
              {latestRun ? <StatusBadge status={latestRun.status} /> : null}
            </div>
          </div>
        </div>
        {repo.description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{repo.description}</p>
        ) : null}

        {/* Quick stats */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
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
              Last indexed: {formatTime(repo.lastIndexedAt)}
            </span>
          ) : null}
        </div>
      </section>

      {/* Language breakdown */}
      {repo.detectedLanguages.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Languages className="size-4 text-sky-500" aria-hidden />
              Language Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted/50 mb-3">
              {repo.detectedLanguages.map((lang) => (
                <div
                  key={lang.language}
                  className={cn('transition-all duration-500', LANG_COLORS[lang.language] ?? 'bg-muted-foreground/30')}
                  style={{ width: `${lang.percentage}%` }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {repo.detectedLanguages.map((lang) => (
                <span key={lang.language} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn('size-2 rounded-full', LANG_COLORS[lang.language] ?? 'bg-muted-foreground/30')} />
                  <span className="font-medium text-foreground">{lang.language}</span>
                  <span className="tabular-nums">{lang.fileCount} files ({lang.percentage}%)</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          onClick={() => void getToken().then((token) => apiClient.startIndex(repoId, token)).then(() => fetchData())}
          disabled={hasRunning}
          className="gap-1.5"
        >
          {hasRunning ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          {hasRunning ? 'Indexing…' : 'Re-index'}
        </Button>
        <Link
          href={`/graph?rootId=file:`}
          className="flex items-center gap-1.5 rounded-md bg-muted/50 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Explore Graph
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>

      {/* Index runs */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">Index History</h2>
        {runs.length > 0 ? (
          <div className="flex flex-col gap-3">
            {runs.map((run) => (
              <IndexRunCard key={run.id} run={run} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Clock className="size-5 text-muted-foreground/60" aria-hidden />
              <p className="text-sm font-medium">No index runs yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Click "Re-index" to start the first indexing run.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
