'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  User,
  GitCommit,
  Eye,
  MessageSquare,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  Search,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useGitHubSession } from '@/hooks/use-github-session';
import type {
  OwnershipResult,
  OwnershipCandidate,
  OwnershipOverview,
  OwnershipArea,
} from '@tracegraph/shared';

function confidenceColor(c: string): string {
  if (c === 'HIGH') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  if (c === 'MEDIUM') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
}

function signalIcon(type: string) {
  if (type === 'RECENT_COMMIT' || type === 'COMMIT') return <GitCommit className="size-3.5" />;
  if (type === 'PR_AUTHOR') return <TrendingUp className="size-3.5" />;
  if (type === 'PR_REVIEW') return <Eye className="size-3.5" />;
  if (type === 'REVIEW_COMMENT') return <MessageSquare className="size-3.5" />;
  if (type === 'TEST_CONTRIBUTION') return <FlaskConical className="size-3.5" />;
  return <User className="size-3.5" />;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Unknown';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function OwnershipPage() {
  const { getToken } = useGitHubSession();
  const [overview, setOverview] = useState<OwnershipOverview | null>(null);
  const [ownership, setOwnership] = useState<OwnershipResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchEntity, setSearchEntity] = useState('');
  const [repoId, setRepoId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const tkn = await getToken();
        if (!tkn) return;
        const repos = await apiClient.listRepositories(tkn);
        const active = repos[0];
        if (!active) return;

        setRepoId(active.id);
        const ov = await apiClient.getOwnershipOverview(active.id, tkn);
        setOverview(ov);
      } catch {
        // Graceful degradation
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getToken]);

  const searchOwnership = useCallback(async () => {
    if (!searchEntity) return;
    try {
      const tkn = await getToken();
      if (!tkn) return;
      const result = await apiClient.getOwnership(searchEntity, tkn);
      setOwnership(result);
    } catch {
      // Graceful
    }
  }, [searchEntity, getToken]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Users className="size-5 animate-pulse" />
          <span className="text-sm">Loading ownership intelligence…</span>
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
            <Users className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold uppercase tracking-tight">
              Ownership Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              Who understands this part of the codebase?
            </p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-6 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchEntity}
            onChange={(e) => setSearchEntity(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void searchOwnership(); }}
            placeholder="Search entity (e.g. file:src/payment.ts, fn:src/payment.ts:PaymentService)"
            className="w-full rounded-lg border border-border/60 bg-background/50 py-2.5 pl-10 pr-4 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void searchOwnership()}
          disabled={!searchEntity}
          className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
        >
          Who to Ask?
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Ownership health */}
        <div className="space-y-4">
          {overview && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Ownership Health
              </h2>
              <div className="space-y-3">
                <HealthBar label="Well-covered" value={overview.health.wellCovered} total={overview.health.totalAreas} color="bg-emerald-500" />
                <HealthBar label="Single contributor" value={overview.health.singleContributor} total={overview.health.totalAreas} color="bg-amber-500" />
                <HealthBar label="Unclear ownership" value={overview.health.unclear} total={overview.health.totalAreas} color="bg-red-500" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="font-mono text-lg font-bold text-emerald-400">{overview.health.totalAreas}</div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Areas</div>
                </div>
                <div>
                  <div className="font-mono text-lg font-bold text-amber-400">{overview.health.singleContributor}</div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Single</div>
                </div>
                <div>
                  <div className="font-mono text-lg font-bold text-red-400">{overview.health.unclear}</div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Unclear</div>
                </div>
              </div>
            </div>
          )}

          {/* Single contributor areas */}
          {overview && overview.singleContributorAreas.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <AlertTriangle className="mr-1 inline size-3 text-amber-400" />
                Single Contributor
              </h2>
              <div className="space-y-2">
                {overview.singleContributorAreas.slice(0, 10).map((area) => (
                  <div key={area.entityId} className="flex items-center justify-between text-sm">
                    <span className="truncate text-muted-foreground">{area.label}</span>
                    <span className="shrink-0 text-xs text-amber-400">
                      {area.topContributor?.name ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Ownership details or area list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Ownership result */}
          {ownership && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Who Should I Ask?
                </h2>
                <span className="text-xs text-muted-foreground">
                  {ownership.totalContributors} contributor{ownership.totalContributors !== 1 ? 's' : ''} found
                </span>
              </div>

              {/* CODEOWNERS if present */}
              {ownership.codeowners.length > 0 && (
                <div className="mb-4 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                  <div className="mb-1 text-xs font-semibold text-violet-400">Explicit CODEOWNERS</div>
                  {ownership.codeowners.map((co) => (
                    <div key={co.path} className="font-mono text-xs text-muted-foreground">
                      {co.name} — {co.path}
                    </div>
                  ))}
                </div>
              )}

              {/* Top candidates */}
              <div className="space-y-3">
                {ownership.candidates.slice(0, 10).map((candidate) => (
                  <CandidateCard key={candidate.developer.id} candidate={candidate} />
                ))}
              </div>

              {ownership.candidates.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No contributors found for this entity. It may not have modification history in the graph.
                </div>
              )}
            </div>
          )}

          {/* Area ownership list */}
          {overview && !ownership && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Most Active Areas
              </h2>
              <div className="space-y-2">
                {overview.areas
                  .filter((a) => a.topContributor)
                  .slice(0, 20)
                  .map((area) => (
                    <div
                      key={area.entityId}
                      className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 p-3 transition-colors hover:border-border/60 hover:bg-card/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{area.label}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{area.path}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-medium">{area.topContributor?.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {area.contributorCount} contributor{area.contributorCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!ownership && !overview && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-8 text-center">
              <Users className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Import a repository with Git history to see ownership intelligence.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CandidateCard({ candidate }: { candidate: OwnershipCandidate }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/30 p-4 transition-colors hover:border-border/60 hover:bg-card/50">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 font-mono text-sm font-bold text-white shadow-[0_0_14px_rgba(167,139,250,0.35)]">
          {candidate.developer.name.slice(0, 2).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{candidate.developer.name}</span>
            <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase">
              #{candidate.rank}
            </span>
            <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${confidenceColor(candidate.confidence)}`}>
              {candidate.confidence}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {candidate.evidence.map((ev) => (
              <span
                key={ev.signal}
                className="flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {signalIcon(ev.signal)}
                {ev.count} {ev.label.toLowerCase()}
              </span>
            ))}
          </div>

          {candidate.lastActiveAt && (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground/60">
              <Clock className="size-3" />
              Last active: {timeAgo(candidate.lastActiveAt)}
            </div>
          )}
        </div>

        {/* Score */}
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-bold text-violet-400">
            {Math.round(candidate.score)}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">score</div>
        </div>
      </div>
    </div>
  );
}

function HealthBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">{value}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-muted/30">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
