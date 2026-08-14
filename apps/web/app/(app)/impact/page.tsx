import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ImpactExplorer } from '@/components/impact/impact-explorer';

export const metadata = {
  title: 'Impact Analysis — TraceGraph',
  description:
    'Ask "what could be affected if I change this?" — deterministic, graph-driven impact analysis over the modeled dependency graph.',
};

function ImpactPageFallback() {
  return (
    <div className="flex flex-col gap-6" data-testid="impact-page-skeleton">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}

export default function ImpactPage() {
  return (
    <Suspense fallback={<ImpactPageFallback />}>
      <ImpactExplorer />
    </Suspense>
  );
}
