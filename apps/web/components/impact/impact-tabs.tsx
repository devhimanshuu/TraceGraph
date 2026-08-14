'use client';

import type { ImpactSummary } from '@tracegraph/shared';
import { cn } from '@/lib/utils';

export type ImpactTabKey = 'all' | 'direct' | 'indirect' | 'tests' | 'history' | 'commits' | 'prs' | 'issues';

interface ImpactTabsProps {
  activeTab: ImpactTabKey;
  onTabChange: (tab: ImpactTabKey) => void;
  summary: ImpactSummary;
  nodeType?: string;
}

const TABS: Array<{ key: ImpactTabKey; label: string; count: (s: ImpactSummary) => number }> = [
  { key: 'all', label: 'All', count: (s) => s.direct + s.indirect },
  { key: 'direct', label: 'Direct', count: (s) => s.direct },
  { key: 'indirect', label: 'Indirect', count: (s) => s.indirect },
  { key: 'tests', label: 'Tests', count: (s) => s.tests },
  { key: 'history', label: 'History', count: (s) => s.commits + s.pullRequests + s.issues },
];

/** Filters the affected-components results. History maps commits/PRs/issues together. */
export function ImpactTabs({ activeTab, onTabChange, summary }: ImpactTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Impact categories"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1"
    >
      {TABS.map(({ key, label, count }) => {
        const isHistory = key === 'history';
        const active =
          activeTab === key || (isHistory && ['commits', 'prs', 'issues'].includes(activeTab));
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
              active
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              {count(summary)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
