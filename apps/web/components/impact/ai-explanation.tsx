'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, FlaskConical, GitCommitHorizontal, GitPullRequest, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
import type { AiEvidenceItem, ImpactExplanation } from '@tracegraph/shared';
import { useGitHubSession } from '@/hooks/use-github-session';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api-client';
import { aiService } from '@/lib/services/ai.service';

/** Staged copy while the explanation is generated (Phase 10 §19). */
const LOADING_STEPS = [
  'Reviewing dependency paths',
  'Reviewing test coverage',
  'Reviewing recent engineering history',
];

type PanelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; explanation: ImpactExplanation }
  | { status: 'disabled'; message: string }
  | { status: 'error'; message: string };

/** Icon + tint per evidence kind — subtle, integrated with the app's design. */
const KIND_META: Record<AiEvidenceItem['kind'], { icon: typeof FlaskConical; className: string }> = {
  path: { icon: GitCommitHorizontal, className: 'text-sky-400' },
  test: { icon: FlaskConical, className: 'text-amber-400' },
  commit: { icon: GitCommitHorizontal, className: 'text-cyan-400' },
  pullRequest: { icon: GitPullRequest, className: 'text-violet-400' },
  issue: { icon: ShieldAlert, className: 'text-rose-400' },
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  insufficient: 'border-muted bg-muted/40 text-muted-foreground',
};

export interface AiExplanationPanelProps {
  nodeId: string;
  depth: number;
  rootLabel: string;
  /** Highlight the path of a clicked evidence reference in the impact graph. */
  onSelectPath: (entityId: string | null) => void;
  /** Hide the card header — used when an enclosing section supplies its own heading. */
  hideHeader?: boolean;
  /** Override the hint under the evidence chips (context-dependent copy). */
  evidenceHint?: string;
}

export function AiExplanationPanel({
  nodeId,
  depth,
  rootLabel,
  onSelectPath,
  hideHeader = false,
  evidenceHint,
}: AiExplanationPanelProps) {
  const { getToken } = useGitHubSession();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const [state, setState] = useState<PanelState>({ status: 'idle' });
  const [regenerate, setRegenerate] = useState(0);

  const run = useCallback(() => {
    setRegenerate((c) => c + 1);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setState({ status: 'loading' });
      try {
        const token = await getTokenRef.current();
        const explanation = await aiService.explain(nodeId, depth, token);
        if (!ignore) setState({ status: 'success', explanation });
      } catch (err) {
        if (ignore) return;
        const code = err instanceof ApiRequestError ? err.code : undefined;
        if (code === 'AI_DISABLED') {
          setState({
            status: 'disabled',
            message: 'AI explanation is unavailable in this environment. Deterministic graph analysis remains available.',
          });
        } else {
          setState({
            status: 'error',
            message:
              err instanceof Error
                ? 'The AI explanation could not be generated. The deterministic impact analysis is still available.'
                : 'AI explanation unavailable.',
          });
        }
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [nodeId, depth, regenerate]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <section
        aria-busy={state.status === 'loading'}
        aria-label="AI engineering explanation"
        className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-5"
        data-testid="ai-explanation-loading"
      >
        {!hideHeader ? <PanelHeader rootLabel={rootLabel} /> : null}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Generating engineering explanation…</p>
          <LoadingSteps />
        </div>
      </section>
    );
  }

  if (state.status === 'disabled') {
    return (
      <section
        aria-label="AI engineering explanation"
        className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-5"
        data-testid="ai-explanation-disabled"
      >
        {!hideHeader ? <PanelHeader rootLabel={rootLabel} /> : null}
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-muted bg-muted/30 text-muted-foreground">
            <Sparkles className="size-3.5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">AI explanation is unavailable in this environment.</p>
            <p className="text-xs text-muted-foreground">Deterministic graph analysis remains available.</p>
          </div>
        </div>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section
        aria-label="AI engineering explanation"
        className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-card/40 p-5"
        data-testid="ai-explanation-error"
      >
        {!hideHeader ? <PanelHeader rootLabel={rootLabel} /> : null}
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-500">
            <AlertTriangle className="size-3.5" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">AI explanation unavailable</p>
            <p className="text-xs text-muted-foreground">{state.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-10 print:hidden">
          <Button variant="outline" size="sm" onClick={run} className="h-8 gap-1.5 text-xs">
            <RotateCcw className="size-3.5" />
            Retry explanation
          </Button>
        </div>
      </section>
    );
  }

  const { explanation } = state;
  return (
    <section
      aria-label="AI engineering explanation"
      className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-5"
      data-testid="ai-explanation"
    >
      {!hideHeader ? <PanelHeader rootLabel={rootLabel} /> : null}

      <div className="flex flex-col gap-2.5">
        <p className="text-sm leading-relaxed text-foreground/90" data-testid="ai-summary">
          {explanation.summary}
        </p>

        {explanation.keyFindings.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Key findings
            </p>
            <ul className="flex flex-col gap-1.5">
              {explanation.keyFindings.map((finding) => (
                <li key={finding} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-sky-400/70" />
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Confidence — qualitative only, never a fake percentage. */}
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
              CONFIDENCE_STYLE[explanation.confidence] ?? CONFIDENCE_STYLE.insufficient
            }`}
          >
            {explanation.confidence} confidence
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/80">{explanation.model}</span>
        </div>
      </div>

      {explanation.evidence.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Evidence
          </p>
          <div className="flex flex-wrap items-center gap-1.5" data-testid="ai-evidence">
            {explanation.evidence.map((item) => {
              const meta = KIND_META[item.kind] ?? KIND_META.path;
              const cited = explanation.evidenceReferences.includes(item.id);
              const chip = (
                <span
                  key={item.id}
                  title={item.description}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 font-mono text-[10px] transition-colors ${
                    cited
                      ? 'border-sky-500/40 bg-sky-500/10 text-sky-400'
                      : 'border-border/70 bg-background/50 text-muted-foreground'
                  }`}
                >
                  <meta.icon className={`size-3 ${meta.className}`} aria-hidden />
                  [{item.id}]
                </span>
              );
              if (item.kind !== 'path' || !item.nodes || item.nodes.length === 0) {
                return chip;
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectPath(item.nodes?.[0] ?? null)}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-1 font-mono text-[10px] transition-all hover:border-sky-500/60 hover:bg-sky-500/15 hover:text-sky-300 focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:outline-none ${
                    cited
                      ? 'border-sky-500/40 bg-sky-500/10 text-sky-400'
                      : 'border-border/70 bg-background/50 text-muted-foreground'
                  }`}
                  aria-label={`Highlight evidence ${item.id}: ${item.description}`}
                >
                  <meta.icon className={`size-3 ${meta.className}`} aria-hidden />
                  [{item.id}]
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            {evidenceHint ??
              'Click a path reference to highlight it in the graph above. Cited references are highlighted.'}
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={run} className="h-8 gap-1.5 text-xs">
          <RotateCcw className="size-3.5" />
          Regenerate explanation
        </Button>
      </div>
    </section>
  );
}

/** Staged loading copy — advances on an interval (mirrors the analysis loader). */
function LoadingSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 900);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col gap-1.5 font-mono text-[11px] text-muted-foreground">
      {LOADING_STEPS.map((label, i) => (
        <span key={label} className={i <= step ? 'text-sky-400' : ''}>
          {i < step ? '✓ ' : i === step ? '▸ ' : '· '}
          {label}
        </span>
      ))}
    </div>
  );
}

function PanelHeader({ rootLabel }: { rootLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-[0_0_12px_-2px_rgba(56,189,248,0.4)]">
        <Sparkles className="size-3.5" />
      </span>
      <h2 className="text-sm font-semibold tracking-tight text-foreground">AI Engineering Explanation</h2>
      <span className="rounded-md border border-border/70 bg-background/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        AI-generated
      </span>
      <span className="text-[11px] text-muted-foreground/80">for {rootLabel}</span>
    </div>
  );
}
