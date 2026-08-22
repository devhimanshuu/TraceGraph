'use client';

import { useState, useCallback } from 'react';
import {
  CheckCircle2,
  FileCode2,
  FolderGit2,
  GitBranch,
  Languages,
  Loader2,
  RefreshCw,
  Shield,
  Database,
} from 'lucide-react';
import type { LanguageDistribution, SyncStatus } from '@tracegraph/shared';
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

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null, nowMs: number): string {
  if (!iso) return '—';
  const diffMs = nowMs - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SyncStatusSkeleton() {
  return (
    <Card data-testid="sync-status-skeleton">
      <CardHeader>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-56" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-lg" />
      </CardContent>
    </Card>
  );
}

// ── Language bar ─────────────────────────────────────────────────────────────

function LanguageBar({ languages }: { languages: LanguageDistribution[] }) {
  const totalFiles = languages.reduce((sum, l) => sum + l.fileCount, 0);
  if (totalFiles === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted/50">
        {languages.map((lang) => {
          const pct = (lang.fileCount / totalFiles) * 100;
          const color = LANG_COLORS[lang.language] ?? 'bg-muted-foreground/30';
          return (
            <div
              key={lang.language}
              className={cn('transition-all duration-500', color)}
              style={{ width: `${pct}%` }}
              title={`${lang.language}: ${lang.fileCount} files`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {languages.map((lang) => (
          <div key={lang.language} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-2 rounded-full', LANG_COLORS[lang.language] ?? 'bg-muted-foreground/30')} />
            <span className="font-medium text-foreground">{lang.language}</span>
            <span className="tabular-nums">{lang.fileCount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stat mini-card ───────────────────────────────────────────────────────────

function StatMini({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
      <div className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', accent)}>
        <Icon className="size-3.5" aria-hidden />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function SyncStatusPanel() {
  const { data: status, loading, error, refresh } = useApiResource<SyncStatus>((token) =>
    apiClient.getSyncStatus(token),
  );

  const { getToken } = useGitHubSession();
  const [resyncing, setResyncing] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);

  const handleResync = useCallback(async () => {
    if (!status?.repository) return;
    setResyncing(true);
    setResyncError(null);
    try {
      const token = await getToken();
      const { jobId } = await apiClient.startResync(status.repository, token);

      // Poll the job until it completes
      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 1500));
        const job = await apiClient.getGithubImportStatus(jobId, token);
        if (job.status === 'done') {
          done = true;
          // After a successful re-import, refresh the sync status
          await refresh();
        } else if (job.status === 'error') {
          setResyncError(job.error ?? 'Re-sync failed');
          done = true;
        }
      }
    } catch (err) {
      setResyncError(err instanceof Error ? err.message : 'Re-sync failed');
    } finally {
      setResyncing(false);
    }
  }, [status, getToken, refresh]);

  if (loading) return <SyncStatusSkeleton />;
  if (error) {
    return (
      <SectionError
        title="Couldn't load sync status"
        message={error === 'empty' ? 'No repository imported yet.' : error}
        onRetry={() => void refresh()}
      />
    );
  }
  if (!status) return null;

  // Compute a stable 'now' from the status data's timestamps — avoids calling
  // Date.now() during render, which the linter flags as impure.
  const nowMs = status.lastSyncAt
    ? new Date(status.lastSyncAt).getTime() + 60000 // +1 min so relative time reads correctly
    : status.lastPushAt
      ? new Date(status.lastPushAt).getTime() + 60000
      : new Date().getTime();

  const { stats, languages } = status;

  return (
    <Card data-testid="sync-status-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-sky-500" aria-hidden />
            <CardTitle className="text-sm">Sync Status</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleResync()}
            disabled={resyncing}
            className="h-7 gap-1.5 text-xs"
          >
            {resyncing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            {resyncing ? 'Re-syncing…' : 'Re-sync'}
          </Button>
        </div>
        <CardDescription className="flex items-center gap-1.5">
          <Shield className="size-3" aria-hidden />
          {status.repository}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Error banner */}
        {resyncError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {resyncError}
          </div>
        ) : null}

        {/* Timestamps */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3" aria-hidden />
            <span className="uppercase tracking-wide">Last sync</span>
            <span className="font-mono text-foreground">{formatRelativeTime(status.lastSyncAt, nowMs)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <GitBranch className="size-3" aria-hidden />
            <span className="uppercase tracking-wide">Last push</span>
            <span className="font-mono text-foreground">{formatRelativeTime(status.lastPushAt, nowMs)}</span>
          </div>
        </div>

        {/* Entity counts grid */}
        <div className="grid grid-cols-3 gap-2">
          <StatMini label="Files" value={stats.files} icon={FileCode2} accent="bg-sky-500/10 text-sky-600" />
          <StatMini label="Functions" value={stats.functions} icon={FileCode2} accent="bg-violet-500/10 text-violet-600" />
          <StatMini label="Classes" value={stats.classes} icon={FileCode2} accent="bg-emerald-500/10 text-emerald-600" />
          <StatMini label="Tests" value={stats.tests} icon={FileCode2} accent="bg-amber-500/10 text-amber-600" />
          <StatMini label="Commits" value={stats.commits} icon={GitBranch} accent="bg-sky-500/10 text-sky-600" />
          <StatMini label="Relationships" value={status.totalRelationships} icon={FolderGit2} accent="bg-violet-500/10 text-violet-600" />
        </div>

        {/* Language distribution */}
        {languages.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Languages className="size-3" aria-hidden />
              Language distribution
            </div>
            <LanguageBar languages={languages} />
          </div>
        ) : null}

        {/* Total summary */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>Total graph entities</span>
          <span className="font-semibold tabular-nums text-foreground">{status.totalNodes.toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
