'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  FlaskConical,
  Gauge,
  GitCommitHorizontal,
  GitPullRequest,
  Layers,
  Network,
  ShieldCheck,
  Tag,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import type { ImpactScore, ImpactSummary as ImpactSummaryData } from '@tracegraph/shared';
import type { ImpactTabKey } from '@/components/impact/impact-tabs';
import { cn } from '@/lib/utils';

/** Deterministic severity indicator styling — server-computed, explained by reasons. */
const SCORE_META: Record<
  ImpactScore,
  { label: string; icon: typeof Gauge; chip: string; card: string; text: string }
> = {
  LOW: {
    label: 'Low',
    icon: ShieldCheck,
    chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    text: 'text-emerald-400',
    card: 'border-emerald-500/25 bg-emerald-500/[0.03]',
  },
  MEDIUM: {
    label: 'Medium',
    icon: Gauge,
    chip: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    text: 'text-amber-400',
    card: 'border-amber-500/25 bg-amber-500/[0.03]',
  },
  HIGH: {
    label: 'High',
    icon: TrendingUp,
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
    text: 'text-rose-400',
    card: 'border-rose-500/25 bg-rose-500/[0.03]',
  },
};

/**
 * The explainable score chip: every point maps to a graph fact the API
 * returned — no hidden math, so the indicator is defensible (Phase 9 §19).
 */
function ImpactScoreCard({ score, reasons }: { score: ImpactScore; reasons: string[] }) {
  const [open, setOpen] = useState(false);
  const meta = SCORE_META[score];
  const Icon = meta.icon;

  return (
    <div className={cn('rounded-xl border p-3', meta.card)} data-testid="impact-score">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn('flex size-8 items-center justify-center rounded-lg', meta.chip)}>
            <Icon className="size-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Impact score
            </span>
            <span className={cn('font-mono text-sm font-bold uppercase tracking-wider', meta.text)}>
              {meta.label}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
        >
          {open ? 'Hide reasons' : 'Why this score?'}
        </button>
      </div>

      {open ? (
        <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-border/50 pt-2.5">
          {reasons.map((reason) => (
            <li
              key={reason}
              className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"
            >
              <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-muted-foreground/60" aria-hidden />
              {reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const METRICS: Array<{
  key: ImpactTabKey;
  label: string;
  value: (s: ImpactSummaryData) => number;
  icon: typeof Layers;
  accent: string;
}> = [
  { key: 'direct', label: 'Direct', value: (s) => s.direct, icon: Workflow, accent: 'bg-sky-500/10 text-sky-400' },
  { key: 'indirect', label: 'Indirect', value: (s) => s.indirect, icon: Network, accent: 'bg-violet-500/10 text-violet-400' },
  { key: 'tests', label: 'Tests', value: (s) => s.tests, icon: FlaskConical, accent: 'bg-amber-500/10 text-amber-400' },
  { key: 'commits', label: 'Commits', value: (s) => s.commits, icon: GitCommitHorizontal, accent: 'bg-cyan-500/10 text-cyan-400' },
  { key: 'prs', label: 'PRs', value: (s) => s.pullRequests, icon: GitPullRequest, accent: 'bg-purple-500/10 text-purple-400' },
  { key: 'issues', label: 'Issues', value: (s) => s.issues, icon: Tag, accent: 'bg-rose-500/10 text-rose-400' },
];

interface ImpactSummaryProps {
  summary: ImpactSummaryData;
  activeTab: ImpactTabKey;
  onSelect: (tab: ImpactTabKey) => void;
}

/**
 * Server-computed impact counts (Phase 9 §18) — the frontend never derives
 * these. Clicking a metric filters the results below to that category.
 */
export function ImpactSummary({ summary, activeTab, onSelect }: ImpactSummaryProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="impact-summary">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Impact summary</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          depth {summary.maxDepth}
        </span>
      </div>

      {/* Deterministic, explainable severity indicator (Phase 9 §19) */}
      <ImpactScoreCard score={summary.score} reasons={summary.scoreReasons} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        {METRICS.map(({ key, label, value, icon: Icon, accent }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(active ? 'all' : key)}
              aria-pressed={active}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
                active
                  ? 'border-sky-500/50 bg-sky-500/5'
                  : 'border-border/60 bg-card/40 hover:border-border hover:bg-card/70',
              )}
            >
              <span className={cn('flex size-7 items-center justify-center rounded-md', accent)}>
                <Icon className="size-3.5" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold tabular-nums leading-none text-foreground">
                  {value(summary)}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
