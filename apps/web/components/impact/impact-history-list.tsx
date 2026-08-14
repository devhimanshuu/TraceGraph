'use client';

import { useState } from 'react';
import { ChartLine, GitCompare, History, Trash2, X } from 'lucide-react';
import type { ImpactSnapshot } from '@/lib/impact-history';
import { timeAgo } from '@/lib/impact-history';
import { Button } from '@/components/ui/button';
import { NodeTypeIcon } from '@/components/dependencies/relationship-badge';
import { ImpactHistoryTrend } from '@/components/impact/impact-history-trend';
import { cn } from '@/lib/utils';

const scoreChip = (score: ImpactSnapshot['score']) =>
  score === 'HIGH'
    ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
    : score === 'MEDIUM'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';

const rowKey = (s: ImpactSnapshot) => `${s.nodeId}|${s.timestamp}`;

/**
 * Per-browser history of past impact analyses. Clicking a row revisits that
 * analysis via /impact?node=<id>&depth=<n>. Two runs can be picked and diffed
 * in the compare view via onCompare. The button + panel are screen-only
 * affordances (hidden when printing).
 */
export function ImpactHistoryList({
  history,
  onNavigate,
  onClear,
  onCompare,
}: {
  history: ImpactSnapshot[];
  onNavigate: (snapshot: ImpactSnapshot) => void;
  onClear: () => void;
  onCompare: (a: ImpactSnapshot, b: ImpactSnapshot) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // Resolve in pick order (selectedKeys), not history order — the first picked
  // run is A and the second is B when the diff opens.
  const selected = selectedKeys
    .map((key) => history.find((s) => rowKey(s) === key))
    .filter((s): s is ImpactSnapshot => Boolean(s));

  const toggleSelect = (key: string) =>
    setSelectedKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );

  const clearSelection = () => setSelectedKeys([]);

  return (
    <div className="print:hidden">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="impact-history-panel"
        className="h-8 gap-1.5 text-xs"
      >
        <History className="size-3.5" />
        History
        {history.length > 0 ? (
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            {history.length}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          id="impact-history-panel"
          className="mt-2 flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-3"
          data-testid="impact-history-panel"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">Recent analyses</p>
            {history.length > 0 ? (
              <button
                type="button"
                onClick={onClear}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-destructive outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
              >
                <Trash2 className="size-3" />
                Clear
              </button>
            ) : null}
          </div>

          {/* Compare selection bar — pick exactly two runs to diff */}
          {selected.length > 0 ? (
            <div
              className="flex items-center justify-between gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-2.5 py-1.5"
              data-testid="impact-history-compare"
            >
              <p className="text-[10px] text-muted-foreground">
                {selected.length} selected · pick 2 to compare
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
                >
                  <X className="size-3" />
                  Clear selection
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selected.length === 2) onCompare(selected[0], selected[1]);
                  }}
                  disabled={selected.length !== 2}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
                    selected.length === 2
                      ? 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
                      : 'cursor-not-allowed text-muted-foreground/50',
                  )}
                >
                  <GitCompare className="size-3" />
                  Compare
                </button>
              </div>
            </div>
          ) : null}

          {history.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No analyses recorded yet — every completed impact run is saved here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((snapshot) => {
                const entityRuns = history.filter((s) => s.nodeId === snapshot.nodeId);
                const key = rowKey(snapshot);
                const expanded = expandedKey === key;
                const isSelected = selectedKeys.includes(key);
                return (
                  <li key={key} className="flex flex-col">
                    <div
                      className={cn(
                        'flex items-center gap-1 rounded-lg transition-shadow',
                        isSelected && 'ring-1 ring-sky-500/40',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onNavigate(snapshot)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border/60 hover:bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/60">
                          <NodeTypeIcon type={snapshot.type} className="size-3 text-muted-foreground" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-xs font-semibold text-foreground">
                            {snapshot.label}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {snapshot.depth} hop{snapshot.depth > 1 ? 's' : ''} ·{' '}
                            {snapshot.direct} direct · {snapshot.indirect} indirect ·{' '}
                            {snapshot.tests} tests
                          </span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider',
                            scoreChip(snapshot.score),
                          )}
                        >
                          {snapshot.score}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {timeAgo(snapshot.timestamp)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSelect(key)}
                        aria-pressed={isSelected}
                        aria-label={`Compare ${snapshot.label} (${snapshot.depth} ${snapshot.depth > 1 ? 'hops' : 'hop'})`}
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
                          isSelected && 'bg-sky-500/15 text-sky-300 hover:text-sky-200',
                        )}
                      >
                        <GitCompare className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? null : key)}
                        aria-expanded={expanded}
                        aria-label={`Score history for ${snapshot.label} (${snapshot.depth} ${snapshot.depth > 1 ? 'hops' : 'hop'})`}
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
                          expanded && 'text-sky-400',
                        )}
                      >
                        <ChartLine className="size-3.5" />
                      </button>
                    </div>

                    {expanded ? (
                      <div className="ml-7 mt-1 flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                        <ImpactHistoryTrend snapshots={entityRuns} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
