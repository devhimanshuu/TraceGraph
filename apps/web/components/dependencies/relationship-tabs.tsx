'use client';

import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Braces,
  FlaskConical,
  GitFork,
  History,
} from 'lucide-react';
import type { RelationshipSummary } from '@tracegraph/shared';
import { cn } from '@/lib/utils';

export type DependencyTabKey =
  | 'dependencies'
  | 'dependents'
  | 'callers'
  | 'callees'
  | 'tests'
  | 'history'
  | 'paths';

export interface RelationshipTabsProps {
  activeTab: DependencyTabKey;
  onTabChange: (tab: DependencyTabKey) => void;
  summary: RelationshipSummary | null;
  nodeType?: string;
}

export function RelationshipTabs({
  activeTab,
  onTabChange,
  summary,
}: RelationshipTabsProps) {
  const historyCount =
    (summary?.commits ?? 0) + (summary?.pullRequests ?? 0) + (summary?.issues ?? 0);

  const tabs: Array<{
    key: DependencyTabKey;
    label: string;
    icon: typeof Boxes;
    count?: number;
    description: string;
  }> = [
    {
      key: 'dependencies',
      label: 'Dependencies',
      icon: ArrowUpRight,
      count: summary?.dependencies,
      description: 'What this relies on',
    },
    {
      key: 'dependents',
      label: 'Dependents',
      icon: ArrowDownLeft,
      count: summary?.dependents,
      description: 'What relies on this',
    },
    {
      key: 'callers',
      label: 'Callers',
      icon: Braces,
      count: summary?.callers,
      description: 'Calling functions',
    },
    {
      key: 'callees',
      label: 'Callees',
      icon: Braces,
      count: summary?.callees,
      description: 'Called functions',
    },
    {
      key: 'tests',
      label: 'Tests',
      icon: FlaskConical,
      count: summary?.tests,
      description: 'Automated tests',
    },
    {
      key: 'history',
      label: 'History',
      icon: History,
      count: historyCount,
      description: 'Commits, PRs, issues',
    },
    {
      key: 'paths',
      label: 'Multi-Hop Paths',
      icon: GitFork,
      description: 'Multi-hop reachability',
    },
  ];

  return (
    <div
      role="tablist"
      aria-label="Relationship Categories"
      className="flex items-center gap-1.5 overflow-x-auto border-b border-border/60 pb-px scrollbar-none"
    >
      {tabs.map(({ key, label, icon: Icon, count }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(key)}
            className={cn(
              'group relative flex items-center gap-2 whitespace-nowrap rounded-t-lg px-3.5 py-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60',
              isActive
                ? 'border-b-2 border-sky-500 bg-sky-500/5 text-foreground'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            <Icon
              className={cn(
                'size-3.5 transition-colors',
                isActive ? 'text-sky-400' : 'text-muted-foreground/70 group-hover:text-foreground',
              )}
            />
            <span>{label}</span>
            {typeof count === 'number' ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.2 text-[10px] tabular-nums font-mono',
                  isActive
                    ? 'bg-sky-500/20 text-sky-400 font-semibold'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
