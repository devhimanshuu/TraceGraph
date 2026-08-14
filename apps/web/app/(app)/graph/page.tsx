import { Suspense } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Skeleton } from '@/components/ui/skeleton';
import { GraphExplorer } from '@/components/graph/graph-explorer';

export const metadata = {
  title: 'Graph Explorer — TraceGraph',
  description: 'Interactive visualization of the codebase graph — explore neighborhood relationships and dependencies.',
};

function GraphFallback() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="h-[620px] w-full rounded-2xl" />
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={<GraphFallback />}>
      <ReactFlowProvider>
        <GraphExplorer />
      </ReactFlowProvider>
    </Suspense>
  );
}
