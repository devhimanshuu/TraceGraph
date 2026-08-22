'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Play,
  Eye,
  EyeOff,
  ChevronRight,
  Plus,
  XCircle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useGitHubSession } from '@/hooks/use-github-session';
import type {
  ArchitectureRule,
  ArchitectureViolation,
  GuardrailDashboard,
  GuardrailEvaluation,
  Severity,
} from '@tracegraph/shared';

function severityColor(s: Severity): string {
  if (s === 'CRITICAL') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (s === 'HIGH') return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  if (s === 'MEDIUM') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  if (s === 'LOW') return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
  return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
}

function statusIcon(s: string) {
  if (s === 'OPEN') return <XCircle className="size-4 text-red-400" />;
  if (s === 'SUPPRESSED') return <EyeOff className="size-4 text-amber-400" />;
  return <CheckCircle2 className="size-4 text-emerald-400" />;
}

export default function GuardrailsPage() {
  const { getToken } = useGitHubSession();
  const [dashboard, setDashboard] = useState<GuardrailDashboard | null>(null);
  const [rules, setRules] = useState<ArchitectureRule[]>([]);
  const [violations, setViolations] = useState<ArchitectureViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [repoId, setRepoId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    sourcePattern: '',
    relationship: 'IMPORTS' as const,
    targetPattern: '',
    severity: 'HIGH' as Severity,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const tkn = await getToken();
        if (!tkn) return;
        const repos = await apiClient.listRepositories(tkn);
        const active = repos[0];
        if (!active) return;

        setRepoId(active.id);

        // Seed default rules if none exist
        await apiClient.seedGuardrailRules(active.id, tkn).catch(() => {});

        const [dash, ruleList] = await Promise.all([
          apiClient.getGuardrailDashboard(active.id, tkn),
          apiClient.listGuardrailRules(active.id, tkn),
        ]);
        setDashboard(dash);
        setRules(ruleList);
      } catch {
        // Graceful degradation
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getToken]);

  const runEvaluation = useCallback(async () => {
    if (!repoId) return;
    setEvaluating(true);
    try {
      const tkn = await getToken();
      if (!tkn) return;
      const result = await apiClient.evaluateGuardrails({ repositoryId: repoId }, tkn);
      setViolations(result.violations);
      // Refresh dashboard
      const dash = await apiClient.getGuardrailDashboard(repoId, tkn);
      setDashboard(dash);
    } catch {
      // Graceful degradation
    } finally {
      setEvaluating(false);
    }
  }, [repoId, getToken]);

  const createRule = useCallback(async () => {
    if (!repoId || !newRule.name) return;
    try {
      const tkn = await getToken();
      if (!tkn) return;
      await apiClient.createGuardrailRule({
        repositoryId: repoId,
        name: newRule.name,
        description: newRule.description,
        sourceSelector: { pattern: newRule.sourcePattern, mode: 'glob' },
        relationship: newRule.relationship,
        targetSelector: { pattern: newRule.targetPattern, mode: 'glob' },
        severity: newRule.severity,
        enabled: true,
        maxDepth: 1,
        ruleType: 'forbidden-dependency',
      }, tkn);
      setShowCreate(false);
      setNewRule({ name: '', description: '', sourcePattern: '', relationship: 'IMPORTS', targetPattern: '', severity: 'HIGH' });
      // Refresh
      const ruleList = await apiClient.listGuardrailRules(repoId, tkn);
      setRules(ruleList);
    } catch {
      // Graceful
    }
  }, [repoId, newRule, getToken]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <ShieldCheck className="size-5 animate-pulse" />
          <span className="text-sm">Loading guardrails…</span>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-400/20">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold uppercase tracking-tight">
              Architecture Guardrails
            </h1>
            <p className="text-sm text-muted-foreground">
              Enforce architecture policies on your code graph
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-md bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-400 transition-colors hover:bg-violet-500/20"
          >
            <Plus className="size-3.5" /> New Rule
          </button>
          <button
            type="button"
            onClick={() => void runEvaluation()}
            disabled={evaluating}
            className="flex items-center gap-1.5 rounded-md bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20 disabled:opacity-50"
          >
            <Play className="size-3.5" /> {evaluating ? 'Evaluating…' : 'Run Check'}
          </button>
        </div>
      </div>

      {/* Dashboard stats */}
      {dashboard && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <DashCard label="Rules" value={dashboard.totalRules} />
          <DashCard label="Enabled" value={dashboard.enabledRules} color="text-emerald-400" />
          <DashCard label="Open" value={dashboard.openViolations} color="text-red-400" />
          <DashCard label="Suppressed" value={dashboard.suppressedViolations} color="text-amber-400" />
          <DashCard label="Critical" value={dashboard.severityCounts.CRITICAL ?? 0} color="text-red-400" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Rules list */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Rules ({rules.length})
          </h2>
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`rounded-xl border p-4 transition-colors ${
                rule.enabled
                  ? 'border-border/60 bg-card/50 hover:border-violet-500/40'
                  : 'border-border/30 bg-card/20 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{rule.name}</div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {rule.sourceSelector.pattern} → {rule.relationship} → {rule.targetSelector.pattern}
                  </div>
                </div>
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${severityColor(rule.severity)}`}>
                  {rule.severity}
                </span>
              </div>
              {rule.description && (
                <p className="mt-2 text-xs text-muted-foreground">{rule.description}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                {rule.enabled ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <Eye className="size-3" /> Enabled
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <EyeOff className="size-3" /> Disabled
                  </span>
                )}
                {rule.ruleType && (
                  <span className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                    {rule.ruleType}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Violations */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Violations ({violations.length})
          </h2>
          {violations.length === 0 && !evaluating && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-8 text-center">
              <CheckCircle2 className="mx-auto size-8 text-emerald-400/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No violations detected. Run a check to evaluate rules against the graph.
              </p>
            </div>
          )}
          {violations.map((v) => (
            <div
              key={v.id}
              className="rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-border/80"
            >
              <div className="flex items-start gap-3">
                {statusIcon(v.status)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{v.ruleName}</span>
                    <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${severityColor(v.severity)}`}>
                      {v.severity}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="text-sky-400">→</span>
                      <span className="truncate">{v.sourceNode.path || v.sourceNode.label}</span>
                      <span className="text-muted-foreground/40">→</span>
                      <span className="text-muted-foreground/60">{v.relationship}</span>
                      <span className="text-muted-foreground/40">→</span>
                      <span className="truncate">{v.targetNode.path || v.targetNode.label}</span>
                    </div>
                  </div>
                  {v.suppression && (
                    <div className="mt-2 rounded-md bg-amber-500/5 border border-amber-500/20 px-3 py-2 text-xs text-amber-400">
                      Suppressed: {v.suppression.reason}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create rule modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Create Architecture Rule</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="size-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder="Services cannot import UI"
                  className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
                <input
                  type="text"
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  placeholder="Service layer must not depend on presentation layer"
                  className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Source (path pattern)</label>
                  <input
                    type="text"
                    value={newRule.sourcePattern}
                    onChange={(e) => setNewRule({ ...newRule, sourcePattern: e.target.value })}
                    placeholder="services/**"
                    className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Target (path pattern)</label>
                  <input
                    type="text"
                    value={newRule.targetPattern}
                    onChange={(e) => setNewRule({ ...newRule, targetPattern: e.target.value })}
                    placeholder="apps/web/**"
                    className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Relationship</label>
                  <select
                    value={newRule.relationship}
                    onChange={(e) => setNewRule({ ...newRule, relationship: e.target.value as any })}
                    className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm"
                  >
                    <option value="IMPORTS">IMPORTS</option>
                    <option value="CALLS">CALLS</option>
                    <option value="EXTENDS">EXTENDS</option>
                    <option value="IMPLEMENTS">IMPLEMENTS</option>
                    <option value="REFERENCES">REFERENCES</option>
                    <option value="ANY">ANY</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Severity</label>
                  <select
                    value={newRule.severity}
                    onChange={(e) => setNewRule({ ...newRule, severity: e.target.value as Severity })}
                    className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                    <option value="INFO">INFO</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void createRule()}
                  disabled={!newRule.name || !newRule.sourcePattern || !newRule.targetPattern}
                  className="rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
                >
                  Create Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DashCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4 text-center">
      <div className={`font-mono text-2xl font-bold ${color ?? 'text-foreground'}`}>{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
