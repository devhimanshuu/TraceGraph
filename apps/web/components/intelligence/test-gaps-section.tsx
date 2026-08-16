'use client';

import Link from 'next/link';
import { ArrowRight, FlaskConical, ShieldAlert } from 'lucide-react';
import type { TestGapResponse } from '@tracegraph/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
import { useApiResource } from '@/hooks/use-api-resource';
import { intelligenceService } from '@/lib/services/intelligence.service';
import { SCROLL_LIST_CLASS } from '@/lib/scroll';
import { cn } from '@/lib/utils';

function TestGapsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Test coverage gaps: files with functions but zero TESTS coverage, ranked by
 * how widely they're depended on — an untested file with many dependents is a
 * much bigger risk than an untested leaf.
 */
export function TestGapsSection() {
  const { data, loading, error, refresh } = useApiResource<TestGapResponse>((token) =>
    intelligenceService.getTestGaps(50, token),
  );

  if (loading) return <TestGapsSkeleton />;
  if (error) {
    return (
      <SectionError
        title="Couldn't load test coverage gaps"
        message={error === 'empty' ? 'No repository mapped yet.' : error}
        onRetry={() => void refresh()}
      />
    );
  }
  if (!data) return null;

  if (data.gaps.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <ShieldAlert className="size-5 text-muted-foreground/60" aria-hidden />
          <p className="text-sm font-medium">No coverage gaps found</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Every file with functions has at least one test covering it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ShieldAlert className="size-3.5 text-amber-500" aria-hidden />
          Test gaps
        </CardTitle>
        <span className="shrink-0 rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {data.gaps.length}
        </span>
      </CardHeader>
      <CardContent className="flex-1 p-2 pt-0">
        <ul className={cn(SCROLL_LIST_CLASS, 'flex max-h-80 flex-col gap-1 p-1')} data-testid="test-gaps-list">
          {data.gaps.map((g) => (
            <li key={g.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium text-foreground">{g.label}</span>
                <span className="text-[10px] text-muted-foreground/70">
                  {g.untestedFunctions} untested function{g.untestedFunctions === 1 ? '' : 's'}
                </span>
              </div>
              <span
                className="hidden shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground/70 sm:flex"
                title="Files importing this one"
              >
                <FlaskConical className="size-3 text-amber-500/70" aria-hidden />
                {g.dependents} dependent{g.dependents === 1 ? '' : 's'} · {g.commits} commit{g.commits === 1 ? '' : 's'}
              </span>
              <Link
                href={`/dependencies?node=${encodeURIComponent(g.id)}`}
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-sky-500 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                Inspect <ArrowRight className="size-3" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
