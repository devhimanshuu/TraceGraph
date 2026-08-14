import { Boxes } from 'lucide-react';
import type { RepositoryComponent } from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Core components ranked by how many things depend on them. */
export function ArchitectureSummary({ components }: { components: RepositoryComponent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Core components</CardTitle>
        <CardDescription>
          The classes the rest of the codebase depends on most — ranked by distinct callers.
        </CardDescription>
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
