'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  GitCommitHorizontal,
  Network,
  Radar,
  Share2,
  Sparkles,
  Workflow,
} from 'lucide-react';
import type { ImpactResponse } from '@tracegraph/shared';
import { buttonVariants } from '@/components/ui/button';
import { AiExplanationPanel } from '@/components/impact/ai-explanation';
import {
  getNodeTypeColor,
  NodeTypeBadge,
  NodeTypeIcon,
  RelationshipTypeBadge,
} from '@/components/dependencies/relationship-badge';
import { cn } from '@/lib/utils';

/** Compact stat cell used by the summary block. */
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
      <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
      <span
        className={cn(
          'block text-[10px] uppercase tracking-wider text-muted-foreground',
          accent,
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** A single evidence chain: affected → … → root, with relationship labels. */
function EvidenceChain({
  nodes,
  relTypes,
}: {
  nodes: ImpactResponse['paths'][number]['nodes'];
  relTypes: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {nodes.map((node, idx) => (
        <span key={`${node.id}-${idx}`} className="flex items-center gap-1.5">
          <span className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-1 font-mono text-[10px] text-foreground">
            <NodeTypeIcon type={node.type} className="size-3" />
            {node.label}
            {idx === nodes.length - 1 ? (
              <span className="font-bold uppercase text-sky-400">· root</span>
            ) : null}
          </span>
          {idx < relTypes.length ? <RelationshipTypeBadge type={relTypes[idx]} /> : null}
        </span>
      ))}
    </div>
  );
}

const scoreChip = (score: ImpactResponse['summary']['score']) =>
  score === 'HIGH'
    ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
    : score === 'MEDIUM'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';

/**
 * The printable report body, shared by the single-report view and the
 * side-by-side comparison. Everything renders from one server-computed
 * ImpactResponse — the document never re-derives counts. `showFooter` is
 * turned off in comparison mode, where one shared disclaimer renders once.
 */
export function ImpactReportDocument({
  analysis,
  depth,
  generatedAt,
  showFooter = true,
}: {
  analysis: ImpactResponse;
  depth: number;
  generatedAt?: string;
  showFooter?: boolean;
}) {
  const router = useRouter();
  const { root, summary, directImpact, indirectImpact, tests, history, paths } = analysis;

  const testsByFile = new Map<string, typeof tests>();
  for (const test of tests) {
    const list = testsByFile.get(test.filePath) ?? [];
    list.push(test);
    testsByFile.set(test.filePath, list);
  }

  const isEmpty = summary.direct + summary.indirect === 0;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Masthead ── */}
      <header className="flex flex-col gap-4 border-b border-border/60 pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
              <Radar className="size-4" />
            </span>
            <span className="font-mono text-sm font-bold tracking-tight">
              TraceGraph <span className="text-sky-400">·</span> Impact Analysis Report
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            depth {depth} hop{depth > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-lg border',
                getNodeTypeColor(root.type),
              )}
            >
              <NodeTypeIcon type={root.type} className="size-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">{root.label}</h1>
            <NodeTypeBadge type={root.type} />
            <span
              className={cn(
                'rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider',
                scoreChip(summary.score),
              )}
            >
              {summary.score} impact
            </span>
          </div>
          <p className="max-w-2xl truncate font-mono text-xs text-muted-foreground" title={root.id}>
            {root.id}
          </p>
          <p className="text-xs text-muted-foreground">
            Generated {generatedAt || 'just now'} · deterministic analysis over modeled graph
            relationships
          </p>
        </div>
      </header>

      {/* ── 1. Impact summary ── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          1 · Impact summary
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <Stat label="Direct" value={summary.direct} accent="text-sky-400" />
          <Stat label="Indirect" value={summary.indirect} accent="text-violet-400" />
          <Stat label="Tests" value={summary.tests} accent="text-amber-400" />
          <Stat label="Commits" value={summary.commits} accent="text-cyan-400" />
          <Stat label="PRs" value={summary.pullRequests} accent="text-purple-400" />
          <Stat label="Issues" value={summary.issues} accent="text-rose-400" />
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-foreground">
              Why this score?
            </span>
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase',
                scoreChip(summary.score),
              )}
            >
              {summary.score}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {summary.scoreReasons.map((reason) => (
              <li
                key={reason}
                className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"
              >
                <CheckCircle2
                  className="mt-0.5 size-3 shrink-0 text-muted-foreground/60"
                  aria-hidden
                />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── AI Engineering Explanation — grounded in the deterministic analysis.
          Deliberately unnumbered: the narrative is an AI reading of the graph
          facts above, not another deterministic section. */}
      <section className="flex flex-col gap-3" data-testid="report-ai-section">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
            <Sparkles className="size-3" />
          </span>
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-foreground">
            AI Engineering Explanation
          </h2>
          <span className="rounded border border-border/70 bg-background/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            AI-generated
          </span>
        </div>
        <AiExplanationPanel
          nodeId={root.id}
          depth={depth}
          rootLabel={root.label}
          onSelectPath={(entityId) =>
            router.push(`/impact?node=${encodeURIComponent(entityId ?? root.id)}`)
          }
          hideHeader
          evidenceHint="Click a path reference to open it in the interactive impact analysis."
        />
      </section>

      {/* ── 2. Affected components ── */}
      <section className="flex flex-col gap-4">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          2 · Potentially affected components
        </h2>

        {isEmpty ? (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border/60 p-6 text-center">
            <FlaskConical className="mx-auto size-5 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium text-foreground">No downstream impact found</p>
            <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">
              No modeled dependencies were found within the selected analysis depth. This does not
              necessarily mean the component is isolated — absence from the graph is not proof of
              absence in reality.
            </p>
          </div>
        ) : (
          <>
            {directImpact.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-sky-400">
                  <ArrowDown className="size-3" />
                  Direct impact ({directImpact.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {directImpact.map((entity) => (
                    <div
                      key={entity.id}
                      className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'flex size-6 items-center justify-center rounded-md border',
                            getNodeTypeColor(entity.type),
                          )}
                        >
                          <NodeTypeIcon type={entity.type} className="size-3" />
                        </span>
                        <span className="text-sm font-semibold text-foreground">{entity.label}</span>
                        <NodeTypeBadge type={entity.type} />
                        <RelationshipTypeBadge type={entity.relationship} />
                        {entity.via ? (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            via {entity.via.label}
                          </span>
                        ) : null}
                        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Distance: {entity.distance}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {entity.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {indirectImpact.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-violet-400">
                  <ArrowRight className="size-3" />
                  Indirect impact ({indirectImpact.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {indirectImpact.map((entity) => (
                    <div
                      key={entity.id}
                      className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card/40 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'flex size-6 items-center justify-center rounded-md border',
                            getNodeTypeColor(entity.type),
                          )}
                        >
                          <NodeTypeIcon type={entity.type} className="size-3" />
                        </span>
                        <span className="text-sm font-semibold text-foreground">{entity.label}</span>
                        <NodeTypeBadge type={entity.type} />
                        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Distance: {entity.distance}
                        </span>
                      </div>
                      <EvidenceChain nodes={entity.path.nodes} relTypes={entity.path.relTypes} />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {entity.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* ── 3. Evidence paths ── */}
      {paths.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            3 · Evidence paths (affected → … → root)
          </h2>
          <div className="flex flex-col gap-2">
            {paths.map((path, idx) => (
              <div
                key={`${path.nodes.map((n) => n.id).join('>')}-${idx}`}
                className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-card/40 p-3.5"
              >
                <EvidenceChain nodes={path.nodes} relTypes={path.relTypes} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── 4. Potentially affected tests ── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          4 · Potentially affected tests ({tests.length})
        </h2>
        {tests.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            No test coverage is modeled for the selected entity or its directly-affected
            components.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {Array.from(testsByFile.entries()).map(([filePath, suiteTests]) => (
              <div
                key={filePath}
                className="overflow-hidden rounded-xl border border-border/60 bg-card/40"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/30 px-3.5 py-2">
                  <span className="truncate font-mono text-[11px] font-medium text-foreground">
                    {filePath}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {suiteTests.length} {suiteTests.length === 1 ? 'test' : 'tests'}
                  </span>
                </div>
                <ul className="flex flex-col divide-y divide-border/30">
                  {suiteTests.map((test) => (
                    <li key={test.id} className="flex items-center gap-2.5 px-3.5 py-2">
                      <CheckCircle2 className="size-3 shrink-0 text-emerald-400" aria-hidden />
                      <span className="text-xs font-medium text-foreground">{test.name}</span>
                      <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {test.framework}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 5. Engineering history ── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          5 · Engineering history
        </h2>
        <div className="flex flex-col gap-2.5">
          <div className="rounded-xl border border-border/60 bg-card/40 p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <GitCommitHorizontal className="size-3.5 text-cyan-400" />
              Recent commits ({history.commits.length})
            </p>
            {history.commits.length === 0 ? (
              <p className="text-xs text-muted-foreground">No commits modeled for this entity.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/30">
                {history.commits.slice(0, 5).map((commit) => (
                  <li key={commit.sha} className="flex items-baseline gap-2 py-1.5">
                    <code className="shrink-0 font-mono text-[10px] text-cyan-400">
                      {commit.sha.slice(0, 7)}
                    </code>
                    <span className="truncate text-xs text-foreground">{commit.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-card/40 p-3.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Workflow className="size-3.5 text-purple-400" />
                Related pull requests ({history.pullRequests.length})
              </p>
              {history.pullRequests.length === 0 ? (
                <p className="text-xs text-muted-foreground">None modeled.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {history.pullRequests.slice(0, 4).map((pr) => (
                    <li key={pr.number} className="text-xs text-muted-foreground">
                      <span className="font-mono text-foreground/80">#{pr.number}</span> {pr.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-border/60 bg-card/40 p-3.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Share2 className="size-3.5 text-rose-400" />
                Related issues ({history.issues.length})
              </p>
              {history.issues.length === 0 ? (
                <p className="text-xs text-muted-foreground">None modeled.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {history.issues.slice(0, 4).map((issue) => (
                    <li key={issue.number} className="text-xs text-muted-foreground">
                      <span className="font-mono text-foreground/80">#{issue.number}</span>{' '}
                      {issue.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer / disclaimer + launchpad ── */}
      {showFooter ? (
        <footer className="flex flex-col gap-3 border-t border-border/60 pt-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Generated by TraceGraph from the modeled dependency graph. Affected components are
            <strong className="text-foreground"> potentially</strong> affected based on modeled
            relationships — this report does not claim they will break. Absence from the graph is
            not proof of absence in reality.
          </p>

          {/* Continue exploring — the shared report is a launchpad, not a dead end */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/graph?node=${encodeURIComponent(root.id)}`}
              className={buttonVariants({
                variant: 'outline',
                size: 'sm',
                className: 'h-7 gap-1.5 text-[11px] px-2.5',
              })}
            >
              <Network className="size-3" />
              Open in Graph
            </Link>
            <Link
              href={`/dependencies?node=${encodeURIComponent(root.id)}`}
              className={buttonVariants({
                variant: 'outline',
                size: 'sm',
                className: 'h-7 gap-1.5 text-[11px] px-2.5',
              })}
            >
              <Workflow className="size-3" />
              View Dependencies
            </Link>
            <Link
              href={`/impact?node=${encodeURIComponent(root.id)}`}
              className={buttonVariants({
                variant: 'outline',
                size: 'sm',
                className: 'h-7 gap-1.5 text-[11px] px-2.5',
              })}
            >
              <Radar className="size-3" />
              Re-run analysis
            </Link>
            <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground" title={root.id}>
              {root.id}
            </span>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
