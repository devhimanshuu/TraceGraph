'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  GitCompareArrows,
  Loader2,
  Radar,
} from 'lucide-react';
import type { BlastRadiusResponse, TestToRun } from '@tracegraph/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SectionError } from '@/components/dashboard/section-error';
import { NodeTypeBadge } from '@/components/dependencies/relationship-badge';
import { useGitHubSession } from '@/hooks/use-github-session';
import { intelligenceService } from '@/lib/services/intelligence.service';
import { cn } from '@/lib/utils';

const LOADING_STEPS = ['Resolving changed files', 'Tracing dependents', 'Ranking affected tests'];

const SAMPLE_FILES = [
  'app/(dashboard)/_actions/workspaces.ts',
  'agent/model.ts',
];

const SAMPLE_TEXT = SAMPLE_FILES.join('\n');

function RiskBadge({ score }: { score: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const style =
    score === 'HIGH'
      ? 'bg-rose-500/10 text-rose-600 border-rose-500/30'
      : score === 'MEDIUM'
        ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
        : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider',
        style,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {score} risk
    </span>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border/60 bg-card/40 px-3.5 py-2.5">
      <span className={cn('text-xl font-semibold tabular-nums', accent)}>{value}</span>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * PR blast radius — the interactive centerpiece of Codebase Intelligence.
 * Paste the changed-file list from a PR/diff; the tool resolves the files in
 * the graph and shows every dependent (direct/indirect), the affected tests
 * ranked by coverage, and an overall LOW/MEDIUM/HIGH risk summary.
 */
export function BlastRadiusTool() {
  const { getToken } = useGitHubSession();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const [text, setText] = useState('');
  const [depth, setDepth] = useState(2);
  const [blast, setBlast] = useState<BlastRadiusResponse | null>(null);
  const [tests, setTests] = useState<TestToRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 800);
    return () => window.clearInterval(t);
  }, [loading]);

  const files = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const run = useCallback(async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    setStep(0);
    try {
      const token = await getTokenRef.current();
      const [blastResult, testsResult] = await Promise.all([
        intelligenceService.blastRadius(files, { depth }, token),
        intelligenceService.testsForChange(files, { depth }, token),
      ]);
      setBlast(blastResult);
      setTests(testsResult.tests);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blast radius analysis failed');
      setLoading(false);
    }
  }, [files, depth]);

  const hasResults = !loading && !error && blast;

  return (
    <Card className="overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent"
      />
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Input */}
          <div className="flex flex-col gap-2.5">
            <label htmlFor="blast-files" className="text-xs font-medium text-foreground">
              Changed files from the PR / diff
            </label>
            <textarea
              id="blast-files"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={SAMPLE_TEXT}
              rows={5}
              className="w-full resize-y rounded-lg border border-border/70 bg-background/60 p-3 font-mono text-xs leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                One path per line · diff prefixes (<code className="font-mono">a/</code>,{' '}
                <code className="font-mono">b/</code>) and GitHub blob URLs are accepted
              </p>
              <button
                type="button"
                onClick={() => setText(SAMPLE_TEXT)}
                className="text-[11px] font-medium text-sky-500 underline-offset-2 hover:underline"
              >
                Try sample files
              </button>
            </div>
          </div>

          {/* Depth + run */}
          <div className="flex flex-col justify-end gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Traversal depth</span>
              <div
                role="group"
                aria-label="Blast radius depth"
                className="flex w-max items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs"
              >
                {[1, 2, 3].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDepth(d)}
                    aria-pressed={depth === d}
                    className={cn(
                      'rounded px-2.5 py-1 transition-colors',
                      depth === d
                        ? 'bg-background font-medium text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {d} hop{d > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={() => void run()} disabled={loading || files.length === 0} className="gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <GitCompareArrows className="size-4" />}
              {loading ? LOADING_STEPS[step] : 'Analyze blast radius'}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error ? (
          <SectionError
            title="Blast radius analysis failed"
            message="We couldn't complete the batch traversal. Please try again."
            onRetry={() => void run()}
          />
        ) : null}

        {/* Results */}
        {hasResults && blast ? (
          <div className="flex flex-col gap-4 border-t border-border/60 pt-4" data-testid="blast-results">
            <div className="flex flex-wrap items-center gap-3">
              <RiskBadge score={blast.summary.score} />
              <SummaryStat label="Changed" value={blast.summary.changed} accent="text-sky-500" />
              <SummaryStat label="Direct" value={blast.summary.direct} accent="text-sky-500" />
              <SummaryStat label="Indirect" value={blast.summary.indirect} accent="text-amber-500" />
              <SummaryStat label="Tests" value={blast.summary.tests} accent="text-emerald-500" />
              {blast.unresolved.length > 0 ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  {blast.unresolved.length} path{blast.unresolved.length === 1 ? '' : 's'} not in graph
                </div>
              ) : null}
            </div>

            <ul className="flex flex-col gap-1.5">
              {blast.summary.scoreReasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500/80" aria-hidden />
                  {reason}
                </li>
              ))}
            </ul>

            {/* Affected dependents */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Direct dependents · {blast.directImpact.length}
                </h3>
                {blast.directImpact.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None found within the depth.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {blast.directImpact.map((e) => (
                      <EntityRow key={e.id} id={e.id} type={e.type} label={e.label} reason={e.reason} />
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Indirect dependents · {blast.indirectImpact.length}
                </h3>
                {blast.indirectImpact.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None found within the depth.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {blast.indirectImpact.map((e) => (
                      <EntityRow key={e.id} id={e.id} type={e.type} label={e.label} reason={e.reason} />
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Tests to run, ranked */}
            <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FlaskConical className="size-3.5" aria-hidden />
                Tests to run, ranked · {tests?.length ?? 0}
              </h3>
              {!tests || tests.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No test coverage found for the changed surface.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {tests.slice(0, 8).map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/30 px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-xs font-medium text-foreground">{t.name}</span>
                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                          {t.filePath}
                        </span>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        risk {t.risk} · covers {t.covers}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Re-run hint */}
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Radar className="size-3.5" aria-hidden />
              Edit the file list and re-run to explore another change.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EntityRow({
  id,
  type,
  label,
  reason,
}: {
  id: string;
  type: 'Class' | 'File' | 'Function' | string;
  label: string;
  reason: string;
}) {
  return (
    <li className="group flex flex-col gap-1 rounded-lg border border-border/50 bg-card/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-semibold text-foreground">{label}</span>
          <NodeTypeBadge type={type} className="shrink-0" />
        </div>
        <Link
          href={`/dependencies?node=${encodeURIComponent(id)}`}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-sky-500 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          Inspect <ArrowRight className="size-3" />
        </Link>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{reason}</p>
    </li>
  );
}
