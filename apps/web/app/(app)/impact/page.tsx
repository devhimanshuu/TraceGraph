import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, Radar, Workflow } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export const metadata = { title: 'Impact Analysis — TraceGraph' };

function ImpactContent({ searchParams }: { searchParams: Promise<{ node?: string }> }) {
  return (
    <Suspense fallback={null}>
      <ImpactInner searchParams={searchParams} />
    </Suspense>
  );
}

async function ImpactInner({ searchParams }: { searchParams: Promise<{ node?: string }> }) {
  const { node } = await searchParams;
  const nodeLabel = node ? node.split(':').pop() : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
        <Radar className="size-7" />
      </span>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Impact Analysis</h1>
          <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase font-semibold text-primary">
            Phase 9 • Coming Next
          </span>
        </div>

        {nodeLabel ? (
          <p className="text-sm font-medium text-foreground">
            Target entity:{' '}
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-primary">
              {nodeLabel}
            </code>
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
          Ask &ldquo;what breaks if I change this?&rdquo; and receive ripple impact scoring,
          confidence ranking, indirect risk paths, and blast radius calculation.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {node ? (
          <Link
            href={`/dependencies?node=${encodeURIComponent(node)}`}
            className={buttonVariants({ className: 'gap-2' })}
          >
            <ArrowLeft className="size-4" />
            Return to Dependency Explorer
          </Link>
        ) : (
          <Link href="/dependencies" className={buttonVariants({ className: 'gap-2' })}>
            <Workflow className="size-4" />
            Explore Dependencies
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ node?: string }>;
}) {
  return <ImpactContent searchParams={searchParams} />;
}
