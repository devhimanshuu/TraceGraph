'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Boxes,
  Network,
  Search,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { getNodeTypeColor } from '@/components/dependencies/relationship-badge';
import { useNode } from '@/hooks/use-node';
import { useNodeCategory } from '@/hooks/use-node-category';
import { nodeService } from '@/lib/services/node.service';
import { CategoryErrorState } from '@/components/dependencies/category-error-state';
import { EntitySearchDialog } from '@/components/dependencies/entity-search-dialog';
import { EntitySummary } from '@/components/dependencies/entity-summary';
import { HistoryView } from '@/components/dependencies/history-view';
import { MultiHopPathView } from '@/components/dependencies/multi-hop-path-view';
import { RelationshipList } from '@/components/dependencies/relationship-list';
import {
  DependencyTabKey,
  RelationshipTabs,
} from '@/components/dependencies/relationship-tabs';
import { TestCoverageView } from '@/components/dependencies/test-coverage-view';

const FEATURED_ENTITIES = [
  {
    id: 'class:apps/api/services/payment.service.ts:PaymentService',
    label: 'PaymentService',
    type: 'Class',
    description: 'Payment orchestration & Stripe integration',
  },
  {
    id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
    label: 'CheckoutService',
    type: 'Class',
    description: 'Checkout workflow & validation',
  },
  {
    id: 'class:apps/api/services/order.service.ts:OrderService',
    label: 'OrderService',
    type: 'Class',
    description: 'Order lifecycle & persistence',
  },
  {
    id: 'class:packages/database/database.service.ts:DatabaseService',
    label: 'DatabaseService',
    type: 'Class',
    description: 'Database query & transaction service',
  },
] as const;

export function DependencyExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeId = searchParams.get('node');

  const [activeTab, setActiveTab] = useState<DependencyTabKey>('dependencies');
  const [traversalDir, setTraversalDir] = useState<'in' | 'out'>('in');
  const [searchOpen, setSearchOpen] = useState(false);

  // 1. Core node & summary data
  const { node, summary, loading: nodeLoading, error: nodeError, refresh: refreshNode } = useNode(nodeId);

  // 2. Fetchers for categories
  const dependenciesFetcher = useCallback(
    (id: string, token: string | null) => nodeService.getDependencies(id, 100, token),
    [],
  );
  const dependentsFetcher = useCallback(
    (id: string, token: string | null) => nodeService.getDependents(id, 100, token),
    [],
  );
  const callersFetcher = useCallback(
    (id: string, token: string | null) => nodeService.getCallers(id, 100, token),
    [],
  );
  const calleesFetcher = useCallback(
    (id: string, token: string | null) => nodeService.getCallees(id, 100, token),
    [],
  );
  const testsFetcher = useCallback(
    (id: string, token: string | null) => nodeService.getTests(id, 100, token),
    [],
  );
  const commitsFetcher = useCallback(
    (id: string, token: string | null) => nodeService.getCommits(id, 50, token),
    [],
  );
  const prsFetcher = useCallback(
    (id: string, token: string | null) => nodeService.getPullRequests(id, 50, token),
    [],
  );
  const issuesFetcher = useCallback(
    (id: string, token: string | null) => nodeService.getIssues(id, 50, token),
    [],
  );
  const traversalFetcher = useCallback(
    (id: string, token: string | null) =>
      nodeService.getTraversal(id, { depth: 3, direction: traversalDir, limit: 20 }, token),
    [traversalDir],
  );

  // 3. Category hooks with lazy-loading behavior
  const deps = useNodeCategory(nodeId, dependenciesFetcher, activeTab === 'dependencies');
  const dependents = useNodeCategory(nodeId, dependentsFetcher, activeTab === 'dependents');
  const callers = useNodeCategory(nodeId, callersFetcher, activeTab === 'callers');
  const callees = useNodeCategory(nodeId, calleesFetcher, activeTab === 'callees');
  const tests = useNodeCategory(nodeId, testsFetcher, activeTab === 'tests');
  const commits = useNodeCategory(nodeId, commitsFetcher, activeTab === 'history');
  const prs = useNodeCategory(nodeId, prsFetcher, activeTab === 'history');
  const issues = useNodeCategory(nodeId, issuesFetcher, activeTab === 'history');
  const traversal = useNodeCategory(nodeId, traversalFetcher, activeTab === 'paths');

  // No node selected state
  if (!nodeId) {
    return (
      <div className="flex flex-col gap-8 py-4">
        {/* Welcome prompt */}
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-[0_0_20px_-2px_rgba(56,189,248,0.5)]">
            <Workflow className="size-6" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Dependency Explorer</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select a code entity to explore its dependencies, dependents, callers, callees, tests,
              and engineering history.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button onClick={() => setSearchOpen(true)} className="gap-2">
              <Search className="size-4" />
              Search codebase symbols
            </Button>
            <Link
              href="/graph"
              className={buttonVariants({ variant: 'outline', className: 'gap-2' })}
            >
              <Network className="size-4" />
              Open Graph Explorer
            </Link>
          </div>
        </div>

        {/* Featured Codebase Entities */}
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Or pick a featured component to inspect
            </h2>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {FEATURED_ENTITIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/dependencies?node=${encodeURIComponent(item.id)}`)}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3.5 text-left transition-all hover:border-primary/40 hover:bg-card/80 hover:shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${getNodeTypeColor(item.type)}`}
                  >
                    <Boxes className="size-4" />
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {item.label}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </span>
                  </div>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground/60" />
              </button>
            ))}
          </div>
        </div>

        <EntitySearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    );
  }

  // Node 404 state
  if (nodeError === 'empty') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h2 className="text-lg font-semibold">Entity not found</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The requested node <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{nodeId}</code> does not exist in the current graph.
        </p>
        <div className="flex items-center gap-2 pt-3">
          <Button onClick={() => setSearchOpen(true)} size="sm">
            Search symbols
          </Button>
          <Link
            href="/graph"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Open Graph
          </Link>
        </div>
        <EntitySearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    );
  }

  // General node load error
  if (nodeError) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <CategoryErrorState
          title="Could not load entity"
          message={nodeError}
          onRetry={() => void refreshNode()}
        />
      </div>
    );
  }

  const currentLabel = node?.label ?? 'Entity';

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Entity Summary */}
      <EntitySummary node={node} summary={summary} loading={nodeLoading} />

      {/* 2. Relationship Intelligence Section */}
      <div className="flex flex-col gap-4">
        <RelationshipTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          summary={summary}
          nodeType={node?.type}
        />

        {/* Tab Content Panels */}
        <div className="pt-1">
          {activeTab === 'dependencies' ? (
            <RelationshipList
              items={deps.data}
              loading={deps.loading}
              error={deps.error}
              direction="dependency"
              currentLabel={currentLabel}
              onRetry={() => void deps.retry()}
              emptyTitle="No direct dependencies"
              emptyDescription={`${currentLabel} does not directly depend on, import, or extend another component in the current model.`}
            />
          ) : null}

          {activeTab === 'dependents' ? (
            <RelationshipList
              items={dependents.data}
              loading={dependents.loading}
              error={dependents.error}
              direction="dependent"
              currentLabel={currentLabel}
              onRetry={() => void dependents.retry()}
              emptyTitle="No direct dependents"
              emptyDescription={`No other components directly call or import ${currentLabel}.`}
            />
          ) : null}

          {activeTab === 'callers' ? (
            <RelationshipList
              items={callers.data}
              loading={callers.loading}
              error={callers.error}
              direction="caller"
              currentLabel={currentLabel}
              onRetry={() => void callers.retry()}
              emptyTitle="No callers found"
              emptyDescription={`No caller functions have been found targeting ${currentLabel}.`}
            />
          ) : null}

          {activeTab === 'callees' ? (
            <RelationshipList
              items={callees.data}
              loading={callees.loading}
              error={callees.error}
              direction="callee"
              currentLabel={currentLabel}
              onRetry={() => void callees.retry()}
              emptyTitle="No callees found"
              emptyDescription={`${currentLabel} does not call any other functions in this model.`}
            />
          ) : null}

          {activeTab === 'tests' ? (
            <TestCoverageView
              tests={tests.data}
              loading={tests.loading}
              error={tests.error}
              currentLabel={currentLabel}
              onRetry={() => void tests.retry()}
            />
          ) : null}

          {activeTab === 'history' ? (
            <HistoryView
              commits={commits.data}
              pullRequests={prs.data}
              issues={issues.data}
              loading={commits.loading || prs.loading || issues.loading}
              error={commits.error || prs.error || issues.error}
              currentLabel={currentLabel}
              onRetry={() => {
                void commits.retry();
                void prs.retry();
                void issues.retry();
              }}
            />
          ) : null}

          {activeTab === 'paths' ? (
            <MultiHopPathView
              traversal={traversal.data}
              loading={traversal.loading}
              error={traversal.error}
              currentLabel={currentLabel}
              direction={traversalDir}
              onDirectionChange={setTraversalDir}
              onRetry={() => void traversal.retry()}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
