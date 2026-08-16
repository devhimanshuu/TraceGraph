'use client';

import Link from 'next/link';
import { ArrowRight, FlaskConical, Ghost } from 'lucide-react';
import type { OrphanListResponse } from '@tracegraph/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
import { NodeTypeBadge } from '@/components/dependencies/relationship-badge';
import { useApiResource } from '@/hooks/use-api-resource';
import { intelligenceService } from '@/lib/services/intelligence.service';
import { SCROLL_LIST_CLASS } from '@/lib/scroll';
import { cn } from '@/lib/utils';

function OrphansSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
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
 * Dead-code candidates: entities with zero inbound dependency signal. Ordered
 * by recent churn so the "actively changed but never used" kind surfaces
 * first — that's the alarming one.
 */
export function OrphansSection() {
  const { data, loading, error, refresh } = useApiResource<OrphanListResponse>((token) =>
    intelligenceService.getOrphans(50, token),
  );

  if (loading) return <OrphansSkeleton />;
  if (error) {
    return (
      <SectionError
        title="Couldn't load dead-code candidates"
        message={error === 'empty' ? 'No repository mapped yet.' : error}
        onRetry={() => void refresh()}
      />
    );
  }
  if (!data) return null;

  if (data.orphans.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Ghost className="size-5 text-muted-foreground/60" aria-hidden />
          <p className="text-sm font-medium">No dead code detected</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Every modeled entity has at least one inbound dependency.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Ghost className="size-3.5 text-sky-500" aria-hidden />
          Dead code
        </CardTitle>
        <span className="shrink-0 rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {data.orphans.length}
        </span>
      </CardHeader>
      <CardContent className="flex-1 p-2 pt-0">
        <ul className={cn(SCROLL_LIST_CLASS, 'flex max-h-80 flex-col gap-1 p-1')} data-testid="orphans-list">
          {data.orphans.map((o) => (
            <li key={o.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-xs font-medium text-foreground">{o.label}</span>
                <NodeTypeBadge type={o.type} className="shrink-0" />
              </div>
              <span
                className={cn(
                  'hidden shrink-0 items-center gap-1 font-mono text-[10px] sm:flex',
                  o.hasTests ? 'text-emerald-500/80' : 'text-muted-foreground/60',
                )}
                title={o.hasTests ? 'Covered by a test' : 'No test coverage'}
              >
                <FlaskConical className="size-3" aria-hidden />
                {o.commits} commit{o.commits === 1 ? '' : 's'}
              </span>
              <Link
                href={`/dependencies?node=${encodeURIComponent(o.id)}`}
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
