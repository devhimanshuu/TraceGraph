import Link from 'next/link';
import { Boxes, GitCompareArrows } from 'lucide-react';
import type { RepositoryComponent } from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Core components ranked by how many things depend on them. */
export function ArchitectureSummary({ components }: { components: RepositoryComponent[] }) {
  // One-click "Analyze PR": deep-link the blast-radius tool with every
  // component's source file (they arrive ordered by dependents, so this is
  // the most-depended-on surface of the repo).
  const blastPaths = components
    .map((c) => c.path)
    .filter((p): p is string => Boolean(p));
  const blastHref =
    blastPaths.length > 0
      ? `/intelligence?blast=${encodeURIComponent(blastPaths.join(','))}`
      : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm">Core components</CardTitle>
          <CardDescription>
            The classes the rest of the codebase depends on most — ranked by distinct callers.
          </CardDescription>
        </div>
        {blastHref ? (
          <Link
            href={blastHref}
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
              className:
                'h-8 shrink-0 text-xs gap-1.5 border-emerald-500/40 text-emerald-500 hover:border-emerald-500/70 hover:bg-emerald-500/10 hover:text-emerald-400',
            })}
            title="Analyze the blast radius of the most-depended-on files"
          >
            <GitCompareArrows className="size-3.5" />
            Analyze PR
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {components.map((component) => (
            <li
              key={component.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Boxes className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{component.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {component.dependents.toLocaleString()}{' '}
                    {component.dependents === 1 ? 'dependent' : 'dependents'}
                  </p>
                  {component.topDependents && component.topDependents.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                        Called by
                      </span>
                      {component.topDependents.map((name) => (
                        <span
                          key={name}
                          className="truncate rounded bg-muted/60 px-1.5 py-px font-mono text-[10px] text-muted-foreground"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                {component.type}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Skeleton rows preserving the components-grid layout. */
export function ArchitectureSummarySkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-64" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} data-testid="components-skeleton" className="h-14" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
