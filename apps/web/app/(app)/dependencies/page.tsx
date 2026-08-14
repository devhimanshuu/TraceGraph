import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { DependencyExplorer } from '@/components/dependencies/dependency-explorer';

export const metadata = {
  title: 'Dependency Explorer — TraceGraph',
  description: 'Inspect dependencies, dependents, callers, callees, test coverage, and engineering history for codebase entities.',
};

function DependencyPageFallback() {
  return (
    <div className="flex flex-col gap-6" data-testid="dependencies-page-skeleton">
      <div className="flex flex-col gap-4 p-5 rounded-xl border border-border/60 bg-card/40">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function DependenciesPage() {
  return (
    <Suspense fallback={<DependencyPageFallback />}>
      <DependencyExplorer />
    </Suspense>
  );
}
