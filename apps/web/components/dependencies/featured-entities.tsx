'use client';

import { Boxes, RefreshCw } from 'lucide-react';
import type { RepositoryComponent } from '@tracegraph/shared';
import { Button } from '@/components/ui/button';
import { getNodeTypeColor } from '@/components/dependencies/relationship-badge';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Featured quick-pick cards for the dependency / impact explorers and the
 * entity search dialog. Data comes from the live `GET /api/repository/featured`
 * endpoint (most-connected real entities), with loading / error / empty
 * states — never hardcoded demo entities.
 */
export function FeaturedEntities({
  entities,
  loading,
  error,
  onRetry,
  onPick,
  columns = 2,
  label = 'Or pick a featured component',
}: {
  entities: RepositoryComponent[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onPick: (id: string) => void;
  columns?: 2 | 3;
  label?: string;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="h-3 w-56 rounded bg-muted/60" aria-hidden />
        <div
          className={`grid gap-2.5 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
          data-testid="featured-entities-skeleton"
        >
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-8 text-center">
        <p className="text-xs text-muted-foreground">
          Couldn&apos;t load featured components.
        </p>
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (!entities || entities.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-card/30 px-4 py-6 text-xs text-muted-foreground">
        <Boxes className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
        No connected components found yet — use the search to pick any symbol.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <Boxes className="size-4 text-primary" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </h2>
      </div>
      <div className={`grid gap-2.5 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {entities.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item.id)}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3.5 text-left transition-all hover:border-primary/40 hover:bg-card/80 hover:shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${getNodeTypeColor(item.type)}`}
              >
                <Boxes className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-foreground">
                  {item.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {item.type}
                  {item.dependents > 0 ? ` · ${item.dependents} dependents` : ''}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
