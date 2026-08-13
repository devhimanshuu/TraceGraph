'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  Braces,
  FileCode2,
  FlaskConical,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Sparkles,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/stat-card';
import { RepositoryComposition } from '@/components/dashboard/repository-composition';
import {
  ArchitectureSummary,
  ArchitectureSummarySkeleton,
} from '@/components/dashboard/architecture-summary';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { SectionError } from '@/components/dashboard/section-error';
import { useRepositoryContext } from '@/components/layout/repository-provider';
import { useActivity } from '@/hooks/use-activity';
import { useComponents } from '@/hooks/use-components';
import { formatDate } from '@/lib/format';

const PRIMARY_STATS = [
  { key: 'files', label: 'Files', icon: FileCode2, description: 'Source files', accent: 'bg-sky-500/10 text-sky-400' },
  { key: 'functions', label: 'Functions', icon: Braces, description: 'Functions & methods', accent: 'bg-violet-500/10 text-violet-400' },
  { key: 'classes', label: 'Classes', icon: Boxes, description: 'Classes & services', accent: 'bg-emerald-500/10 text-emerald-400' },
  { key: 'tests', label: 'Tests', icon: FlaskConical, description: 'Automated tests', accent: 'bg-amber-500/10 text-amber-400' },
  { key: 'commits', label: 'Commits', icon: GitCommitHorizontal, description: 'Commits in history', accent: 'bg-sky-500/10 text-sky-400' },
  { key: 'pullRequests', label: 'Pull requests', icon: GitPullRequest, description: 'Merged & open', accent: 'bg-violet-500/10 text-violet-400' },
] as const;

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">{children}</h2>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8" data-testid="dashboard-skeleton">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-44" />
        <Skeleton data-testid="dashboard-title-skeleton" className="h-8 w-72" />
        <Skeleton className="h-4 w-full max-w-lg" />
        <Skeleton className="h-3 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="stats-skeleton">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 lg:col-span-2" />
        <Skeleton className="h-40" />
      </div>
      <ArchitectureSummarySkeleton />
      <Skeleton className="h-64" data-testid="activity-skeleton" />
    </div>
  );
}

export default function DashboardPage() {
  const { repository, loading: repoLoading, error: repoError, refresh: refreshRepo } =
    useRepositoryContext();
  const {
    activity,
    loading: activityLoading,
    error: activityError,
    refresh: refreshActivity,
  } = useActivity(10);
  const {
    components,
    loading: componentsLoading,
    error: componentsError,
    refresh: refreshComponents,
  } = useComponents(8);

  if (repoLoading) {
    return <PageSkeleton />;
  }

  if (repoError === 'empty') {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-16 text-center">
        <Sparkles className="size-6 text-muted-foreground/60" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">No workspace yet</h1>
        <p className="text-sm text-muted-foreground">
          The demo graph is empty. Load the TraceGraph dataset to explore the codebase.
        </p>
        <code className="mt-1 rounded-md border border-border/60 bg-card/40 px-2 py-1 font-mono text-xs">
          npm run db:seed
        </code>
      </div>
    );
  }

  if (repoError || !repository) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <SectionError
          title="We couldn't load the repository"
          message={repoError ?? 'The repository is unavailable right now.'}
          onRetry={() => void refreshRepo()}
        />
      </div>
    );
  }

  const lastCommit = activity?.commits[0];

  return (
    <div className="flex flex-col gap-10">
      {/* Header */}
      <section className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Codebase intelligence overview
        </p>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">{repository.name}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {repository.description}
          </p>
        </div>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt className="uppercase tracking-wide">Language</dt>
            <dd className="font-mono">{repository.language}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="uppercase tracking-wide">Branch</dt>
            <dd className="font-mono">{repository.defaultBranch}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="uppercase tracking-wide">Repo</dt>
            <dd className="font-mono">{repository.fullName}</dd>
          </div>
          {lastCommit ? (
            <div className="flex items-center gap-1.5">
              <dt className="uppercase tracking-wide">Last commit</dt>
              <dd className="font-mono">{formatDate(lastCommit.timestamp)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {/* Statistics */}
      <section className="flex flex-col gap-4">
        <SectionTitle>Repository statistics</SectionTitle>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          data-testid="stats-grid"
        >
          {PRIMARY_STATS.map(({ key, label, icon, description, accent }) => (
            <StatCard
              key={key}
              label={label}
              value={repository.stats[key]}
              description={description}
              icon={icon}
              accent={accent}
            />
          ))}
        </div>
      </section>

      {/* Composition + secondary counts */}
      <section className="grid items-stretch gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RepositoryComposition stats={repository.stats} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Also in the graph</CardTitle>
            <CardDescription>Remaining repository metrics.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              {[
                ['Directories', repository.stats.directories],
                ['Issues', repository.stats.issues],
                ['Developers', repository.stats.developers],
                ['Relationships', repository.relationshipCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>

      {/* Core components */}
      <section className="flex flex-col gap-4">
        <SectionTitle>Architecture at a glance</SectionTitle>
        {componentsLoading ? (
          <ArchitectureSummarySkeleton />
        ) : componentsError ? (
          <SectionError
            title="Couldn't load core components"
            message={componentsError}
            onRetry={() => void refreshComponents()}
          />
        ) : components && components.length > 0 ? (
          <ArchitectureSummary components={components} />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Boxes className="size-5 text-muted-foreground/60" aria-hidden />
              <p className="text-sm font-medium">No core components found</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Classes ranked by their dependents will appear here once the graph has data.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Recent activity */}
      <section className="flex flex-col gap-4">
        <SectionTitle>
          <GitBranch className="size-4" />
          Recent engineering activity
        </SectionTitle>
        {activityLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-56" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} data-testid="activity-skeleton" className="h-12" />
              ))}
            </CardContent>
          </Card>
        ) : activityError ? (
          <SectionError
            title="Couldn't load recent activity"
            message={activityError}
            onRetry={() => void refreshActivity()}
          />
        ) : activity ? (
          <RecentActivity activity={activity} />
        ) : null}
      </section>

      {/* Explore CTA */}
      <section>
        <Card className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.08),transparent_60%)]"
          />
          <CardContent className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex max-w-md flex-col gap-1">
              <h2 className="text-base font-semibold">Explore the codebase</h2>
              <p className="text-sm text-muted-foreground">
                Trace relationships across files, functions, tests and engineering history.
              </p>
            </div>
            <Link href="/graph" className={buttonVariants({ size: 'lg' })}>
              Open Graph Explorer
              <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
