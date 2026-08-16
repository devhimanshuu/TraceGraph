'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeftRight,
  CheckCircle2,
  Copy,
  GitCompare,
  Printer,
  Radar,
  Search,
} from 'lucide-react';
import { useGitHubSession } from '@/hooks/use-github-session';
import type { ImpactResponse } from '@tracegraph/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
import { impactService } from '@/lib/services/impact.service';
import { EntitySearchDialog } from '@/components/dependencies/entity-search-dialog';
import { ImpactReportDocument } from '@/components/impact/impact-report-document';

function CompareLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="compare-loading">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-6">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-16 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/**
 * Side-by-side impact report comparison. Two entities are analyzed at the
 * same depth and rendered as a pair of printable documents (A vs B). URL
 * state: /impact/compare?nodeA=<id>&nodeB=<id>&depth=<n> — shareable, and the
 * print CSS forces both columns onto one page.
 */
export function ImpactCompare() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeA = searchParams.get('nodeA');
  const nodeB = searchParams.get('nodeB');
  const depthParam = searchParams.get('depth');
  const { getToken } = useGitHubSession();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const depth = useMemo(() => {
    const n = Number(depthParam);
    return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 2;
  }, [depthParam]);

  const [analysisA, setAnalysisA] = useState<ImpactResponse | null>(null);
  const [analysisB, setAnalysisB] = useState<ImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [pickSlot, setPickSlot] = useState<'A' | 'B' | null>(null);

  useEffect(() => {
    let ignore = false;
    if (!nodeA) return;
    const targetA = nodeA;
    const targetB = nodeB;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await getTokenRef.current();
        const [a, b] = await Promise.all([
          impactService.getImpact(targetA, { depth, limit: 100 }, token),
          targetB ? impactService.getImpact(targetB, { depth, limit: 100 }, token) : Promise.resolve(null),
        ]);
        if (!ignore) {
          setAnalysisA(a);
          setAnalysisB(b);
          setGeneratedAt(
            new Date().toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          );
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Impact analysis failed');
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [nodeA, nodeB, depth, refreshTrigger]);

  const setParam = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(`/impact/compare?${params.toString()}`);
    },
    [router, searchParams],
  );

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable — ignore.
    }
  }, []);

  // ── No entity A selected ───────────────────────────────────────────────────
  if (!nodeA) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
          <GitCompare className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight">Compare impact reports</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Pick two entities to render their impact reports side by side on one page — ideal for
            comparing blast radius before a refactor.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button onClick={() => setPickSlot('A')} className="gap-2">
            <Search className="size-4" />
            Pick first entity
          </Button>
          <Link
            href="/impact"
            className={buttonVariants({ variant: 'outline', className: 'gap-2' })}
          >
            <Radar className="size-4" />
            Back to analysis
          </Link>
        </div>
        <EntitySearchDialog
          open={pickSlot === 'A'}
          onOpenChange={(open) => setPickSlot(open ? 'A' : null)}
          onSelect={(id) => setParam({ nodeA: id })}
        />
      </div>
    );
  }

  if (loading) {
    return <CompareLoading />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <SectionError
          title="Could not build the comparison"
          message={error ?? "We couldn't complete the graph traversal for one of the entities. Please try again."}
          onRetry={() => setRefreshTrigger((c) => c + 1)}
        />
      </div>
    );
  }

  if (!analysisA) return null;

  const labelA = analysisA.root.label;
  const labelB = analysisB?.root.label ?? 'Pick entity B';

  return (
    <div className="tg-impact-report flex flex-col gap-6">
      {/* Shared header — screen only actions */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <p className="text-xs text-muted-foreground">
            Two reports on one page · depth applies to both sides
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyLink}
              className="h-8 gap-1.5 text-xs"
            >
              {copied ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Link copied' : 'Copy compare link'}
            </Button>
            <Button size="sm" onClick={() => window.print()} className="h-8 gap-1.5 text-xs">
              <Printer className="size-3.5" />
              Print / Save as PDF
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-border/60 pb-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
              <GitCompare className="size-4" />
            </span>
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold tracking-tight">Impact comparison</h1>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {labelA} vs {labelB} · {depth} hop{depth > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 print:hidden">
            {/* Depth selector */}
            <div
              role="group"
              aria-label="Comparison depth"
              className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs"
            >
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setParam({ depth: String(d) })}
                  aria-pressed={depth === d}
                  className={`rounded px-2.5 py-1 transition-colors ${
                    depth === d
                      ? 'bg-background font-medium text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d} hop{d > 1 ? 's' : ''}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!nodeB) return;
                setParam({ nodeA: nodeB, nodeB: nodeA });
              }}
              disabled={!nodeB}
              className="h-8 gap-1.5 text-xs"
            >
              <ArrowLeftRight className="size-3.5" />
              Swap
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPickSlot('A')}
              className="h-8 gap-1.5 text-xs"
            >
              <Search className="size-3.5" />
              Change A
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPickSlot('B')}
              className="h-8 gap-1.5 text-xs"
            >
              <Search className="size-3.5" />
              {nodeB ? 'Change B' : 'Pick B'}
            </Button>
          </div>
        </div>
      </div>

      {/* The two documents side by side */}
      <div className="tg-compare-grid grid items-start gap-6 lg:grid-cols-2">
        <ImpactReportDocument analysis={analysisA} depth={depth} generatedAt={generatedAt} showFooter={false} />
        {analysisB ? (
          <ImpactReportDocument analysis={analysisB} depth={depth} generatedAt={generatedAt} showFooter={false} />
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 p-6 text-center">
            <GitCompare className="size-6 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium text-foreground">Pick a second entity</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              Choose the comparison partner to render both reports side by side.
            </p>
            <Button size="sm" onClick={() => setPickSlot('B')} className="gap-1.5">
              <Search className="size-3.5" />
              Pick B
            </Button>
          </div>
        )}
      </div>

      {/* Shared disclaimer — printed once */}
      <footer className="border-t border-border/60 pt-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Generated by TraceGraph from the modeled dependency graph. Affected components are
          <strong className="text-foreground"> potentially</strong> affected based on modeled
          relationships — this report does not claim they will break. Absence from the graph is not
          proof of absence in reality.
        </p>
      </footer>

      <EntitySearchDialog
        open={pickSlot !== null}
        onOpenChange={(open) => setPickSlot(open ? pickSlot : null)}
        onSelect={(id) => {
          if (pickSlot === 'A') setParam({ nodeA: id });
          else setParam({ nodeB: id });
        }}
      />
    </div>
  );
}
