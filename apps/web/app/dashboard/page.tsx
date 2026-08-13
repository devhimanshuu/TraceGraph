'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  Code2,
  GitBranch,
  GitCommitHorizontal,
  Network,
  Radar,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { Logo } from '@/components/logo';
import type { RepositoryOverview } from '@tracegraph/shared';

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-3">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function RepoHeader({ repository }: { repository: RepositoryOverview }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{repository.name}</h1>
        <Badge variant="outline" className="font-mono text-xs">
          {repository.language}
        </Badge>
        <Badge variant="outline" className="font-mono text-xs">
          {repository.defaultBranch}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{repository.description}</p>
      <p className="font-mono text-xs text-muted-foreground">{repository.fullName}</p>
    </div>
  );
}

const upcoming = [
  {
    icon: Network,
    title: 'Graph explorer',
    description: 'Explore the codebase as an interactive graph — zoom, pan, and inspect neighborhoods.',
    href: null,
    eta: 'Next up',
  },
  {
    icon: Radar,
    title: 'Impact analysis',
    description: 'Select any entity and see what would be affected by a change, with the paths that explain why.',
    href: null,
    eta: 'Soon',
  },
];

export default function DashboardPage() {
  const { repository, loading, error, refresh } = useRepository();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <Logo className="size-5 rounded-md" />
            Workspace
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-64" />
          ) : repository ? (
            <RepoHeader repository={repository} />
          ) : error === 'empty' ? (
            <h1 className="text-2xl font-semibold tracking-tight">No workspace yet</h1>
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">Repository overview</h1>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
          Refresh
        </Button>
      </header>

      {loading ? (
        <section className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </section>
      ) : error === 'empty' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Graph not seeded</CardTitle>
            <CardDescription>
              The demo workspace is empty. Load the TraceGraph dataset to explore the codebase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="rounded-md border border-border/60 bg-card/40 px-2 py-1 font-mono text-xs">
              npm run db:seed
            </code>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-red-400">Could not load the repository</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : repository ? (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Boxes className="size-4" />
              Codebase at a glance
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              <StatCell label="Files" value={repository.stats.files} />
              <StatCell label="Functions" value={repository.stats.functions} />
              <StatCell label="Classes" value={repository.stats.classes} />
              <StatCell label="Tests" value={repository.stats.tests} />
              <StatCell label="Commits" value={repository.stats.commits} />
              <StatCell label="Pull requests" value={repository.stats.pullRequests} />
              <StatCell label="Issues" value={repository.stats.issues} />
              <StatCell label="Developers" value={repository.stats.developers} />
              <StatCell label="Directories" value={repository.stats.directories} />
              <StatCell label="Relationships" value={repository.relationshipCount} />
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <GitBranch className="size-4" />
              Explore
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {upcoming.map(({ icon: Icon, title, description, eta }) => (
                <Card key={title} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      {title}
                      <Badge variant="outline" className="ml-auto text-xs">
                        {eta}
                      </Badge>
                    </CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                      <ArrowRight className="size-3.5" />
                      Coming soon
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <footer className="flex flex-col gap-1 border-t border-border/60 pt-6 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Code2 className="size-3.5" />
          Data served by the TraceGraph query layer — every statistic is counted live from the graph.
        </p>
        <p className="flex items-center gap-1.5">
          <GitCommitHorizontal className="size-3.5" />
          Engineering history, dependency exploration, and impact analysis arrive in upcoming
          releases.
        </p>
        <p className="flex items-center gap-1.5">
          <Users className="size-3.5" />
          {repository?.stats.developers ?? 0} developers ·{' '}
          {repository?.stats.pullRequests ?? 0} pull requests · {repository?.stats.issues ?? 0}{' '}
          issues
        </p>
        <p className="mt-2">
          <Link href="/" className="text-primary hover:underline">
            ← Back to home
          </Link>
        </p>
      </footer>
    </main>
  );
}
