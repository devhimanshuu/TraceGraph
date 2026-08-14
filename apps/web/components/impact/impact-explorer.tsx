'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FlaskConical, GitCompare, GitFork, Network, Printer, Radar, Search, Sparkles, Workflow } from 'lucide-react';
import type { ImpactResponse } from '@tracegraph/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
import { EntitySearchDialog } from '@/components/dependencies/entity-search-dialog';
import { NodeTypeBadge, NodeTypeIcon } from '@/components/dependencies/relationship-badge';
import { useNode } from '@/hooks/use-node';
import { useImpactHistory } from '@/hooks/use-impact-history';
import { useGitHubSession } from '@/hooks/use-github-session';
import { impactService } from '@/lib/services/impact.service';
import { ImpactSummary } from '@/components/impact/impact-summary';
import { ImpactGraph } from '@/components/impact/impact-graph';
import { ImpactTabs, type ImpactTabKey } from '@/components/impact/impact-tabs';
import { AffectedComponents } from '@/components/impact/affected-components';
import { ImpactHistoryView } from '@/components/impact/impact-history-view';
import { TestCoverageView } from '@/components/dependencies/test-coverage-view';
import { PathExplorer } from '@/components/impact/path-explorer';
import { ImpactHistoryList } from '@/components/impact/impact-history-list';
import { AiExplanationPanel } from '@/components/impact/ai-explanation';

const FEATURED_ENTITIES = [
  {
    id: 'class:apps/api/services/payment.service.ts:PaymentService',
    label: 'PaymentService',
    type: 'Class' as const,
    description: 'Payment orchestration & Stripe integration',
  },
  {
    id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
    label: 'CheckoutService',
    type: 'Class' as const,
    description: 'Checkout workflow & validation',
  },
  {
    id: 'class:apps/api/services/order.service.ts:OrderService',
    label: 'OrderService',
    type: 'Class' as const,
    description: 'Order lifecycle & persistence',
  },
];

/** Staged loading copy — the analysis is a heavier traversal, so tell the user what's happening. */
const LOADING_STEPS = [
  'Tracing dependencies',
  'Finding affected components',
  'Checking test relationships',
  'Collecting engineering history',
];

function ImpactLoading() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 900);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center" data-testid="impact-loading">
      <div className="relative">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="absolute inset-2.5 rounded-full" />
        <span className="absolute inset-0 flex items-center justify-center">
          <Radar className="size-7 text-muted-foreground/70" />
        </span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium text-foreground">Analyzing impact…</p>
        <p className="text-xs text-muted-foreground" data-testid="impact-loading-step">
          {LOADING_STEPS[step]}
        </p>
      </div>
      <div className="flex flex-col gap-1 font-mono text-[10px] text-muted-foreground/80">
        {LOADING_STEPS.map((label, i) => (
          <span key={label} className={i <= step ? 'text-sky-400' : ''}>
            {i < step ? '✓ ' : i === step ? '▸ ' : '· '}
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ImpactExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeId = searchParams.get('node');
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

  const { node, error: nodeError, refresh: refreshNode } = useNode(nodeId);
  const { history, recordSnapshot, clear: clearHistory } = useImpactHistory();
  const [analysis, setAnalysis] = useState<ImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<ImpactTabKey>('all');
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  // Scroll target for AI evidence clicks — the summary + graph grid sits above
  // the AI panel, so the graph needs to be brought back into view.
  const graphSectionRef = useRef<HTMLDivElement | null>(null);

  // `?explain=1` — deep-linked from the graph/dependency explorers: after the
  // analysis loads, bring the AI explanation into view and flash it once so
  // the user lands on the narrative, not the deterministic sections.
  const explainParam = searchParams.get('explain') === '1';
  const aiSectionRef = useRef<HTMLDivElement | null>(null);
  const [aiFlash, setAiFlash] = useState(false);

  // Fresh backend request whenever the node or depth changes (never reuse stale results).
  const runAnalysis = useCallback(() => {
    setRefreshTrigger((c) => c + 1);
  }, []);

  useEffect(() => {
    let ignore = false;
    if (!nodeId) return;
    const targetId = nodeId;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await getTokenRef.current();
        const data = await impactService.getImpact(targetId, { depth, limit: 100 }, token);
        if (!ignore) {
          setAnalysis(data);
          setLoading(false);
          setSelectedPathId(null);
          // Repository-scoped snapshot history — the server assigns the id,
          // timestamp, and analyst, and deduplicates unchanged re-runs.
          recordSnapshot({
            nodeId: data.root.id,
            label: data.root.label,
            type: data.root.type,
            depth,
            score: data.summary.score,
            direct: data.summary.direct,
            indirect: data.summary.indirect,
            tests: data.summary.tests,
          });
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
  }, [nodeId, depth, refreshTrigger, recordSnapshot]);

  // Auto-expand: when the deep link carries ?explain=1, wait for the results
  // (and the AI panel) to render, then scroll it into view with a one-shot
  // highlight ring so it can't be missed.
  useEffect(() => {
    if (!analysis || !explainParam) return;
    const scrollTimer = window.setTimeout(() => {
      aiSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    const flashOn = window.setTimeout(() => setAiFlash(true), 350);
    const flashOff = window.setTimeout(() => setAiFlash(false), 3200);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(flashOn);
      window.clearTimeout(flashOff);
    };
  }, [analysis, explainParam]);

  const setDepth = useCallback(
    (d: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('depth', String(d));
      if (nodeId) params.set('node', nodeId);
      router.replace(`/impact?${params.toString()}`);
    },
    [router, searchParams, nodeId],
  );

  // ── No node selected: pick an entity ─────────────────────────────────────────
  if (!nodeId) {
    return (
      <div className="flex flex-col gap-8 py-4">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-[0_0_20px_-2px_rgba(56,189,248,0.5)]">
            <Radar className="size-6" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Impact Analysis</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select an entity to analyze its potential impact. TraceGraph walks the modeled
              dependency graph and explains which components could be affected — and why.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button onClick={() => setSearchOpen(true)} className="gap-2">
              <Search className="size-4" />
              Search codebase symbols
            </Button>
            <Link href="/graph" className={buttonVariants({ variant: 'outline', className: 'gap-2' })}>
              <Network className="size-4" />
              Open Graph Explorer
            </Link>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Or pick a featured component to analyze
            </h2>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {FEATURED_ENTITIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/impact?node=${encodeURIComponent(item.id)}&depth=2`)}
                className="flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-card/40 p-3.5 text-left transition-all hover:border-sky-500/40 hover:bg-card/80 hover:shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
              >
                <NodeTypeIcon type={item.type} className="size-4 text-sky-400" />
                <span className="text-sm font-semibold text-foreground">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.description}</span>
              </button>
            ))}
          </div>
        </div>

        <EntitySearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    );
  }

  // ── Node 404 / load error ────────────────────────────────────────────────────
  if (nodeError === 'empty') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h2 className="text-lg font-semibold">Entity not found</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The requested node <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{nodeId}</code> does
          not exist in the current graph.
        </p>
        <div className="flex items-center gap-2 pt-3">
          <Button onClick={() => setSearchOpen(true)} size="sm">
            Search symbols
          </Button>
          <Link href="/graph" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Open Graph
          </Link>
        </div>
        <EntitySearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    );
  }

  if (nodeError || !node) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <SectionError
          title="Could not load entity"
          message={nodeError ?? 'The entity is unavailable right now.'}
          onRetry={() => void refreshNode()}
        />
      </div>
    );
  }

  const currentLabel = node.label;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-[0_0_16px_-2px_rgba(56,189,248,0.45)]">
            <Radar className="size-4" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Potential impact · modeled dependencies
            </p>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{currentLabel}</h1>
              <NodeTypeBadge type={node.type} />
            </div>
            <p className="text-xs text-muted-foreground">
              Analyzed up to {depth} hop{depth > 1 ? 's' : ''} · based on modeled graph relationships, not certainty
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Depth selector */}
          <div
            role="group"
            aria-label="Impact depth"
            className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs shrink-0"
          >
            <GitFork className="mx-1.5 size-3.5 text-muted-foreground/70" aria-hidden />
            {[1, 2, 3].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDepth(d)}
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
            onClick={() => setSearchOpen(true)}
            className="h-8 text-xs gap-1.5"
          >
            <Search className="size-3.5" />
            Change entity
          </Button>
          <Link
            href={`/impact/report?node=${encodeURIComponent(nodeId)}&depth=${depth}`}
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-8 text-xs gap-1.5' })}
          >
            <Printer className="size-3.5" />
            Report
          </Link>
          <Link
            href={`/impact/compare?nodeA=${encodeURIComponent(nodeId)}&depth=${depth}`}
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-8 text-xs gap-1.5' })}
          >
            <GitCompare className="size-3.5" />
            Compare
          </Link>
          <Button size="sm" onClick={runAnalysis} className="h-8 text-xs gap-1.5">
            <Radar className="size-3.5" />
            Re-analyze
          </Button>
        </div>
      </div>

      {/* Per-browser analysis history — revisit past runs */}
      <ImpactHistoryList
        history={history}
        onNavigate={(snapshot) =>
          router.push(`/impact?node=${encodeURIComponent(snapshot.nodeId)}&depth=${snapshot.depth}`)
        }
        onClear={clearHistory}
        onCompare={(a, b) =>
          router.push(
            `/impact/compare?nodeA=${encodeURIComponent(a.nodeId)}&nodeB=${encodeURIComponent(b.nodeId)}&depth=${Math.max(a.depth, b.depth)}`,
          )
        }
      />

      {/* Loading */}
      {loading ? <ImpactLoading /> : null}

      {/* Error */}
      {!loading && error ? (
        <SectionError
          title="Impact analysis failed"
          message="We couldn't complete the graph traversal. Please try again."
          onRetry={runAnalysis}
        />
      ) : null}

      {/* Empty impact */}
      {!loading && !error && analysis && analysis.summary.direct + analysis.summary.indirect === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-14 text-center" data-testid="impact-empty">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card/50">
            <Radar className="size-6 text-muted-foreground/70" />
          </span>
          <h2 className="text-lg font-semibold">No downstream impact found</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            No modeled dependencies were found within the selected analysis depth. This does not
            necessarily mean the component is isolated — absence from the graph is not proof of
            absence in reality.
          </p>
        </div>
      ) : null}

      {/* Results */}
      {!loading && !error && analysis && analysis.summary.direct + analysis.summary.indirect > 0 ? (
        <>
          {/* Summary + graph */}
          <div ref={graphSectionRef} className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <ImpactSummary
              summary={analysis.summary}
              activeTab={activeTab}
              onSelect={(tab) => setActiveTab(tab)}
            />
            <ImpactGraph
              response={analysis}
              selectedPathId={selectedPathId}
              onSelectPath={setSelectedPathId}
            />
          </div>

          {/* AI explanation — grounded in the deterministic analysis above; the
              deterministic results stay fully visible regardless of AI state. */}
          <div
            ref={aiSectionRef}
            data-testid="ai-section"
            className={cn(
              'rounded-2xl transition-shadow duration-500',
              aiFlash && 'ring-2 ring-sky-500/60 shadow-[0_0_24px_-6px_rgba(56,189,248,0.6)]',
            )}
          >
            <AiExplanationPanel
              nodeId={analysis.root.id}
              depth={analysis.depth}
              rootLabel={analysis.root.label}
              onSelectPath={(entityId) => {
                setSelectedPathId(entityId);
                setActiveTab('all');
                // The chip lives below the graph — bring the graph back into
                // view so the full highlighted chain is visible.
                graphSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          </div>

          {/* Tabs */}
          <ImpactTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            summary={analysis.summary}
            nodeType={node.type}
          />

          <div className="pt-1">
            {/* All: direct + indirect */}
            {activeTab === 'all' ? (
              <AffectedComponents
                direct={analysis.directImpact}
                indirect={analysis.indirectImpact}
                selectedPathId={selectedPathId}
                onSelectPath={setSelectedPathId}
              />
            ) : null}

            {activeTab === 'direct' ? (
              <AffectedComponents
                direct={analysis.directImpact}
                indirect={[]}
                selectedPathId={selectedPathId}
                onSelectPath={setSelectedPathId}
              />
            ) : null}

            {activeTab === 'indirect' ? (
              <AffectedComponents
                direct={[]}
                indirect={analysis.indirectImpact}
                selectedPathId={selectedPathId}
                onSelectPath={setSelectedPathId}
              />
            ) : null}

            {activeTab === 'tests' ? (
              <div className="flex flex-col gap-3">
                <p className="px-1 text-xs text-muted-foreground">
                  Potentially affected tests — coverage for {currentLabel} and its directly affected
                  components, based on modeled TESTS relationships.
                </p>
                {analysis.tests.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card/40 py-10 text-center">
                    <FlaskConical className="size-5 text-muted-foreground/60" aria-hidden />
                    <p className="text-sm font-medium">No potentially affected tests</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      No test coverage was found for {currentLabel} or its direct dependents in the
                      current model.
                    </p>
                  </div>
                ) : (
                  <TestCoverageView
                    tests={analysis.tests}
                    loading={false}
                    error={null}
                    currentLabel={currentLabel}
                  />
                )}
              </div>
            ) : null}

            {activeTab === 'history' ? <ImpactHistoryView history={analysis.history} /> : null}
          </div>

          {/* Path explorer — why is this impacted */}
          {selectedPathId ? (
            <PathExplorer
              pathId={selectedPathId}
              response={analysis}
              onClose={() => setSelectedPathId(null)}
            />
          ) : null}
        </>
      ) : null}

      {/* "Explore the codebase" CTA for continuous navigation */}
      {!loading && !error ? (
        <section>
          <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card/40 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex max-w-md flex-col gap-1">
              <h2 className="text-sm font-semibold">Want to change something?</h2>
              <p className="text-xs text-muted-foreground">
                Open the dependency explorer or graph to trace the full neighborhood of any affected
                component.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/dependencies" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}>
                <Workflow className="size-3.5" />
                Dependency Explorer
              </Link>
              <Link href="/graph" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}>
                <Network className="size-3.5" />
                Open Graph
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <EntitySearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
