'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Users,
  FolderGit2,
  ShieldCheck,
  FileText,
  Activity,
  Plus,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useGitHubSession } from '@/hooks/use-github-session';
import type {
  Workspace,
  WorkspaceDashboard,
  WorkspaceMembership,
  SavedReport,
  AuditEvent,
} from '@tracegraph/shared';

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function eventIcon(type: string) {
  if (type.includes('REPOSITORY') || type.includes('INDEX')) return <FolderGit2 className="size-4 text-sky-400" />;
  if (type.includes('GUARDRAIL')) return <ShieldCheck className="size-4 text-violet-400" />;
  if (type.includes('REPORT')) return <FileText className="size-4 text-emerald-400" />;
  if (type.includes('MEMBER')) return <Users className="size-4 text-amber-400" />;
  return <Activity className="size-4 text-muted-foreground" />;
}

function roleBadge(role: string): string {
  if (role === 'OWNER') return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
  if (role === 'ADMIN') return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
  if (role === 'MEMBER') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
}

export default function WorkspacesPage() {
  const { getToken } = useGitHubSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWs, setSelectedWs] = useState<Workspace | null>(null);
  const [dashboard, setDashboard] = useState<WorkspaceDashboard | null>(null);
  const [members, setMembers] = useState<WorkspaceMembership[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newWsName, setNewWsName] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const tkn = await getToken();
        if (!tkn) return;

        // Ensure a default workspace exists
        const wsList = await apiClient.listWorkspaces(tkn);
        if (wsList.length === 0) {
          const defaultWs = await apiClient.createWorkspace({
            organizationId: 'org:default',
            name: 'My Workspace',
            slug: 'my-workspace',
            description: 'Default engineering workspace',
          }, tkn);
          setWorkspaces([defaultWs]);
          setSelectedWs(defaultWs);
        } else {
          setWorkspaces(wsList);
          setSelectedWs(wsList[0]);
        }
      } catch {
        // Graceful degradation
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getToken]);

  // Load workspace data when selected
  useEffect(() => {
    if (!selectedWs) return;
    const loadWs = async () => {
      try {
        const tkn = await getToken();
        if (!tkn) return;
        const [dash, memList, reportList, actList] = await Promise.all([
          apiClient.getWorkspaceDashboard(selectedWs.id, tkn),
          apiClient.listWorkspaceMembers(selectedWs.id, tkn),
          apiClient.listWorkspaceReports(selectedWs.id, tkn),
          apiClient.listWorkspaceActivity(selectedWs.id, tkn),
        ]);
        setDashboard(dash);
        setMembers(memList);
        setReports(reportList);
        setActivity(actList);
      } catch {
        // Graceful
      }
    };
    void loadWs();
  }, [selectedWs, getToken]);

  const createWorkspace = useCallback(async () => {
    if (!newWsName) return;
    try {
      const tkn = await getToken();
      if (!tkn) return;
      const ws = await apiClient.createWorkspace({
        organizationId: 'org:default',
        name: newWsName,
        slug: newWsName.toLowerCase().replace(/\s+/g, '-'),
      }, tkn);
      setWorkspaces((prev) => [...prev, ws]);
      setSelectedWs(ws);
      setShowCreate(false);
      setNewWsName('');
    } catch {
      // Graceful
    }
  }, [newWsName, getToken]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Building2 className="size-5 animate-pulse" />
          <span className="text-sm">Loading workspaces…</span>
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
            <Building2 className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold uppercase tracking-tight">
              {selectedWs?.name ?? 'Workspaces'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Team engineering intelligence platform
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-md bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-400 transition-colors hover:bg-violet-500/20"
        >
          <Plus className="size-3.5" /> New Workspace
        </button>
      </div>

      {/* Workspace switcher */}
      <div className="mb-6 flex items-center gap-2 overflow-x-auto">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            type="button"
            onClick={() => setSelectedWs(ws)}
            className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              selectedWs?.id === ws.id
                ? 'border-violet-500/40 bg-violet-500/10 text-violet-400'
                : 'border-border/60 bg-card/50 text-muted-foreground hover:border-border/80 hover:text-foreground'
            }`}
          >
            {ws.name}
          </button>
        ))}
      </div>

      {selectedWs && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Stats + Members */}
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={<FolderGit2 className="size-4" />} label="Repositories" value={dashboard?.repositoryCount ?? 0} />
              <StatCard icon={<Users className="size-4" />} label="Members" value={members.length} />
              <StatCard icon={<ShieldCheck className="size-4" />} label="Rules" value={dashboard?.guardrailRuleCount ?? 0} />
              <StatCard icon={<FileText className="size-4" />} label="Reports" value={reports.length} />
            </div>

            {/* Members */}
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Members ({members.length})
              </h2>
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[10px] font-bold text-white">
                        {m.user.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm">{m.user.name}</span>
                    </div>
                    <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${roleBadge(m.role)}`}>
                      {m.role}
                    </span>
                  </div>
                ))}
                {members.length === 0 && (
                  <p className="text-xs text-muted-foreground">No members yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Right: Activity + Reports */}
          <div className="lg:col-span-2 space-y-4">
            {/* Activity */}
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Recent Activity
              </h2>
              <div className="space-y-2">
                {activity.map((evt) => (
                  <div key={evt.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/30 p-3">
                    {eventIcon(evt.eventType)}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        <span className="font-medium">{evt.actorName}</span>{' '}
                        <span className="text-muted-foreground">{evt.eventType.toLowerCase().replace(/_/g, ' ')}</span>
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground/60">{timeAgo(evt.createdAt)}</div>
                    </div>
                  </div>
                ))}
                {activity.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No activity yet</p>
                )}
              </div>
            </div>

            {/* Reports */}
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Saved Reports ({reports.length})
              </h2>
              <div className="space-y-2">
                {reports.map((rpt) => (
                  <div key={rpt.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 p-3 transition-colors hover:border-border/60 hover:bg-card/50">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{rpt.title}</div>
                      <div className="text-xs text-muted-foreground">{rpt.summary}</div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground/60">
                        {rpt.createdBy.name} · {timeAgo(rpt.createdAt)}
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/30" />
                  </div>
                ))}
                {reports.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No saved reports. Run an analysis and save the results.
                  </p>
                )}
              </div>
            </div>

            {/* Workspace description */}
            {selectedWs.description && (
              <div className="rounded-xl border border-border/60 bg-card/50 p-5">
                <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  About
                </h2>
                <p className="text-sm text-muted-foreground">{selectedWs.description}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create workspace modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold">Create Workspace</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder="Platform Engineering"
                  className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button type="button" onClick={() => void createWorkspace()} disabled={!newWsName} className="rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <div className="mt-2 font-mono text-2xl font-bold">{value}</div>
    </div>
  );
}
