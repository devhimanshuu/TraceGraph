'use client';

import { Activity, ArrowRight, Database, RefreshCw, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useHealth } from '@/hooks/use-health';
import { apiBaseUrl } from '@/lib/api-client';

type Tier = 'ok' | 'down' | 'unknown';

const tierStyles: Record<Tier, { dot: string; badge: string; label: string }> = {
  ok: {
    dot: 'bg-emerald-500',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    label: 'Connected',
  },
  down: {
    dot: 'bg-red-500',
    badge: 'border-red-500/30 bg-red-500/10 text-red-400',
    label: 'Disconnected',
  },
  unknown: {
    dot: 'bg-amber-500',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    label: 'Checking…',
  },
};

function StatusBadge({ tier }: { tier: Tier }) {
  const style = tierStyles[tier];
  return (
    <Badge variant="outline" className={style.badge}>
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </Badge>
  );
}

function FlowChip({
  icon,
  label,
  sub,
  tier,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  tier: Tier;
}) {
  const style = tierStyles[tier];
  return (
    <div className="flex flex-1 flex-col items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-6 py-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <span className={`text-xs ${style.dot} h-2 w-2 rounded-full`} />
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { api, database, loading, error, refresh } = useHealth();

  const apiTier: Tier = loading ? 'unknown' : error ? 'down' : 'ok';
  const dbTier: Tier = loading
    ? 'unknown'
    : error
      ? 'unknown'
      : database?.status === 'up'
        ? 'ok'
        : 'down';

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">TraceGraph</h1>
        <p className="text-sm text-muted-foreground">
          Understand your codebase through relationships.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Activity className="size-4" />
            Foundation status
          </h2>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
            Refresh
          </Button>
        </div>

        <div className="flex items-stretch gap-3">
          <FlowChip
            icon={<Server className="size-4" />}
            label="Frontend"
            sub="Next.js · App Router"
            tier="ok"
          />
          <div className="flex items-center text-muted-foreground">
            <ArrowRight className="size-4" />
          </div>
          <FlowChip
            icon={<Activity className="size-4" />}
            label="API"
            sub="NestJS · /api"
            tier={apiTier}
          />
          <div className="flex items-center text-muted-foreground">
            <ArrowRight className="size-4" />
          </div>
          <FlowChip
            icon={<Database className="size-4" />}
            label="CognoDB"
            sub="Bolt · openCypher"
            tier={dbTier}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Frontend</CardTitle>
              <CardDescription>This page is rendering</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusBadge tier="ok" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">API</CardTitle>
              <CardDescription>GET /api/health</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {loading ? (
                <Skeleton className="h-5 w-24" />
              ) : error ? (
                <>
                  <StatusBadge tier="down" />
                  <p className="text-xs text-muted-foreground">{error}</p>
                </>
              ) : (
                <>
                  <StatusBadge tier="ok" />
                  <p className="text-xs text-muted-foreground">
                    {api?.service} v{api?.version}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Database</CardTitle>
              <CardDescription>GET /api/health/database</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {loading ? (
                <Skeleton className="h-5 w-24" />
              ) : error ? (
                <>
                  <StatusBadge tier="unknown" />
                  <p className="text-xs text-muted-foreground">API unreachable — retry</p>
                </>
              ) : (
                <>
                  <StatusBadge tier={dbTier} />
                  <p className="text-xs text-muted-foreground">
                    {database?.status === 'up'
                      ? `Latency ${database.latencyMs}ms`
                      : database?.error}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="flex flex-col gap-1 border-t border-border/60 pt-6 text-xs text-muted-foreground">
        <p>Phase 2 foundation — this status view will be replaced by the real dashboard.</p>
        <p className="font-mono">API base URL: {apiBaseUrl}</p>
      </footer>
    </main>
  );
}
