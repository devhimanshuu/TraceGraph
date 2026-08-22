'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  Clock,
  Copy,
  FileCode2,
  FlaskConical,
  AlertTriangle,
  TrendingDown,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useGitHubSession } from '@/hooks/use-github-session';
import type {
  TestIntelligenceOverview,
  TestSelectionResponse,
  TestRecommendation,
  TestSelectionRequest,
} from '@tracegraph/shared';

/** Format milliseconds to human-readable duration. */
function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const rem = Math.round(secs - mins * 60);
  return `${mins}m ${rem}s`;
}

/** Priority badge color. */
function priorityColor(p: string): string {
  if (p === 'HIGH') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (p === 'MEDIUM') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
}

export default function TestIntelligencePage() {
  const { getToken } = useGitHubSession();
  const [overview, setOverview] = useState<TestIntelligenceOverview | null>(null);
  const [selection, setSelection] = useState<TestSelectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [repoId, setRepoId] = useState<string | null>(null);

  // Fetch overview
  useEffect(() => {
    const load = async () => {
      try {
        const tkn = await getToken();
        if (!tkn) return;
        const repos = await apiClient.listRepositories(tkn);
        const active = repos[0];
        if (!active) return;

        setRepoId(active.id);
        const ov = await apiClient.getTestIntelligenceOverview(active.id, tkn);
        setOverview(ov);
      } catch {
        // Graceful degradation
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getToken]);

  // Run test selection
  const runSelection = useCallback(async () => {
    if (!repoId) return;
    setSelecting(true);
    try {
      const tkn = await getToken();
      if (!tkn) return;
      const dto: TestSelectionRequest = {
        changedFiles: [],
        repositoryId: repoId,
      };
      const result = await apiClient.selectTests(dto, tkn);
      setSelection(result);
    } catch {
      // Graceful degradation
    } finally {
      setSelecting(false);
    }
  }, [repoId, getToken]);

  // Auto-run selection on load
  useEffect(() => {
    if (repoId && !selection && !selecting) {
      void runSelection();
    }
  }, [repoId, selection, selecting, runSelection]);

  const copyCommand = useCallback(() => {
    if (selection?.runCommand) {
      void navigator.clipboard.writeText(selection.runCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [selection]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <FlaskConical className="size-5 animate-pulse" />
          <span className="text-sm">Loading test intelligence…</span>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-400/20">
            <FlaskConical className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold uppercase tracking-tight">
              Test Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              Intelligent test selection — run only what matters
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Overview stats */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card/50 p-5">
            <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Repository Health
            </h2>
            <div className="space-y-3">
              <StatRow icon={<FlaskConical className="size-4" />} label="Total tests" value={overview?.totalTests ?? 0} />
              <StatRow icon={<FileCode2 className="size-4" />} label="Test files" value={overview?.totalTestFiles ?? 0} />
              <StatRow icon={<Clock className="size-4" />} label="Avg suite duration" value={formatDuration(overview?.avgSuiteDurationMs ?? null)} />
              <StatRow icon={<AlertTriangle className="size-4" />} label="Flaky tests" value={overview?.flakyTests ?? 0} accent="text-amber-400" />
              <StatRow icon={<CheckCircle2 className="size-4" />} label="Resolved targets" value={overview?.resolvedTests ?? 0} accent="text-emerald-400" />
            </div>
          </div>

          {/* Frameworks */}
          {overview && overview.frameworks.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Frameworks
              </h2>
              <div className="space-y-2">
                {overview.frameworks.map((fw) => (
                  <div key={fw.framework} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{fw.framework}</span>
                    <span className="font-mono text-xs text-muted-foreground">{fw.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Recommendations */}
        <div className="lg:col-span-2 space-y-4">
          {/* Selection summary */}
          {selection && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Recommended Tests
                </h2>
                <button
                  type="button"
                  onClick={() => void runSelection()}
                  disabled={selecting}
                  className="rounded-md bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20 disabled:opacity-50"
                >
                  {selecting ? 'Selecting…' : 'Re-run selection'}
                </button>
              </div>

              {/* Summary bar */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard label="Recommended" value={selection.recommendations.length} color="text-sky-400" />
                <SummaryCard label="Full suite" value={selection.totalTests} color="text-muted-foreground" />
                <SummaryCard
                  label="Reduction"
                  value={selection.reductionPercent != null ? `${selection.reductionPercent.toFixed(0)}%` : '—'}
                  color="text-emerald-400"
                />
                <SummaryCard
                  label="Est. duration"
                  value={formatDuration(selection.estimatedDurationMs)}
                  color="text-violet-400"
                />
              </div>

              {/* Run command */}
              {selection.runCommand && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 p-3">
                  <code className="flex-1 truncate font-mono text-xs text-muted-foreground">
                    {selection.runCommand}
                  </code>
                  <button
                    type="button"
                    onClick={copyCommand}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Copy command"
                  >
                    {copied ? (
                      <CheckCircle2 className="size-4 text-emerald-400" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Test list */}
          {selection && selection.recommendations.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Test Rankings
              </h3>
              <div className="space-y-2">
                {selection.recommendations.slice(0, 30).map((rec) => (
                  <TestRow key={rec.testId} rec={rec} />
                ))}
                {selection.recommendations.length > 30 && (
                  <p className="pt-2 text-center text-xs text-muted-foreground">
                    + {selection.recommendations.length - 30} more tests
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!selecting && selection && selection.recommendations.length === 0 && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-8 text-center">
              <Brain className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No test recommendations available. Import a repository with test files to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatRow({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={accent ?? 'text-muted-foreground/60'}>{icon}</span>
        {label}
      </span>
      <span className={`font-mono text-sm font-semibold ${accent ?? 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-center">
      <div className={`font-mono text-lg font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function TestRow({ rec }: { rec: TestRecommendation }) {
  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border/40 bg-background/30 p-3 transition-colors hover:border-border/60 hover:bg-card/50">
      <span className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${priorityColor(rec.priority)}`}>
        {rec.priority}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{rec.testName}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">{rec.filePath}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-xs text-muted-foreground">score {rec.score}</div>
        {rec.estimatedDurationMs != null && rec.estimatedDurationMs > 0 && (
          <div className="font-mono text-[10px] text-muted-foreground/60">
            {formatDuration(rec.estimatedDurationMs)}
          </div>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/60" />
    </div>
  );
}
