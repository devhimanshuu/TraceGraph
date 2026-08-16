'use client';

import Link from 'next/link';
import { ArrowRight, FlaskConical, GitCommitHorizontal, Swords } from 'lucide-react';
import type { TestToRun } from '@tracegraph/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyRelationshipState } from '@/components/dependencies/empty-relationship-state';
import { cn } from '@/lib/utils';

export interface RankedTestsViewProps {
  tests: TestToRun[] | null;
  loading: boolean;
  error: string | null;
  currentLabel: string;
  onRetry?: () => void;
}

/** Risk tier derived from the same formula the server ranks by. */
function riskTier(risk: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (risk >= 4) return 'HIGH';
  if (risk >= 2) return 'MEDIUM';
  return 'LOW';
}

function RiskPill({ risk }: { risk: number }) {
  const tier = riskTier(risk);
  const style =
    tier === 'HIGH'
      ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
      : tier === 'MEDIUM'
        ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
        : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
        style,
      )}
    >
      <Swords className="size-3" aria-hidden />
      {tier}
    </span>
  );
}

/**
 * Tests-to-run ranking for the impact page's tests tab — the same
 * `directlyCovers`-weighted list the blast-radius tool uses (a test guarding a
 * changed/directly-affected entity counts double). Rendered in the server's
 * risk order, with the coverage facts that justify each rank.
 */
export function RankedTestsView({
  tests,
  loading,
  error,
  currentLabel,
  onRetry,
}: RankedTestsViewProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2" data-testid="ranked-tests-skeleton">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
        <p className="text-sm font-medium">Couldn&apos;t load the test ranking</p>
        <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    );
  }

  if (!tests || tests.length === 0) {
    return (
      <EmptyRelationshipState
        title="No tests to run"
        description={`No modeled tests cover ${currentLabel} or its affected components — the change surface has no TESTS coverage in the graph.`}
        icon={FlaskConical}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[11px] text-muted-foreground">
        Ranked by coverage weight — a test guarding a directly affected entity counts double. The
        graph (TESTS edges) is the source of truth; the rank is deterministic.
      </p>
      <ol className="flex flex-col gap-1.5" data-testid="ranked-tests-list">
        {tests.map((test, i) => (
          <li
            key={test.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/30 px-3 py-2.5 transition-colors hover:border-border/80"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 font-mono text-[10px] font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-xs font-medium text-foreground">{test.name}</span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {test.filePath}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden items-center gap-1 rounded-md bg-muted/60 px-2 py-1 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                <GitCommitHorizontal className="size-3" aria-hidden />
                covers {test.covers} · {test.directlyCovers} direct
              </span>
              <RiskPill risk={test.risk} />
              <Link
                href={`/dependencies?node=${encodeURIComponent(test.id)}`}
                className={buttonVariants({
                  variant: 'ghost',
                  size: 'sm',
                  className: 'h-7 px-2 text-xs gap-1',
                })}
              >
                View
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
