import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { IntelligenceHub } from '@/components/intelligence/intelligence-hub';

export const metadata = {
  title: 'Codebase Intelligence — TraceGraph',
  description:
    'Dead code, architecture smells, test coverage gaps, PR blast radius and who-to-ask knowledge — deterministic findings from the dependency graph.',
};

function IntelligencePageFallback() {
  return (
    <div className="flex flex-col gap-6" data-testid="intelligence-page-skeleton">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

export default function IntelligencePage() {
  return (
    <Suspense fallback={<IntelligencePageFallback />}>
      <IntelligenceHub />
    </Suspense>
  );
}
