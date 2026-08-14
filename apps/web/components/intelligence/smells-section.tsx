'use client';

import Link from 'next/link';
import { ArrowRight, GitFork, RefreshCcw, Scale, Siren } from 'lucide-react';
import type { ArchitectureSmell, SmellResponse } from '@tracegraph/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
import { NodeTypeBadge } from '@/components/dependencies/relationship-badge';
import { useApiResource } from '@/hooks/use-api-resource';
import { intelligenceService } from '@/lib/services/intelligence.service';

function SmellCard({ smell }: { smell: ArchitectureSmell }) {
  const icon =
    smell.kind === 'cycle' ? (
      <RefreshCcw className="size-4 text-rose-500" />
    ) : smell.kind === 'god-module' ? (
      <Scale className="size-4 text-amber-500" />
    ) : (
      <Siren className="size-4 text-orange-500" />
    );

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {icon}
            {smell.title}
          </div>
          <span className="shrink-0 rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {Object.entries(smell.metrics)
              .map(([key, value]) => `${key} ${value}`)
              .join(' · ')}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{smell.reason}</p>
        <ul className="flex flex-wrap gap-1.5">
          {smell.entities.map((entity, i) => (
            <li key={entity.id} className="flex items-center gap-1.5">
              {i > 0 ? <span className="text-[10px] text-muted-foreground/60">→</span> : null}
              <Link
                href={`/dependencies?node=${encodeURIComponent(entity.id)}`}
                className="group inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-1 text-xs text-foreground transition-colors hover:border-sky-500/40 hover:bg-card"
              >
                {entity.label}
                <NodeTypeBadge type={entity.type} className="hidden" />
                <ArrowRight className="size-3 text-muted-foreground/50 transition-colors group-hover:text-sky-500" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Group({
  title,
  icon: Icon,
  accent,
  smells,
}: {
  title: string;
  icon: typeof GitFork;
  accent: string;
  smells: ArchitectureSmell[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${accent}`}>
        <Icon className="size-3.5" aria-hidden />
        {title} · {smells.length}
      </h3>
      {smells.length === 0 ? (
        <p className="rounded-lg border border-border/40 bg-card/20 px-3 py-2.5 text-xs text-muted-foreground">
          None found — the modeled graph is clean here.
        </p>
      ) : (
        <div className="flex flex-col gap-2">{smells.map((s) => <SmellCard key={s.reason + s.entities[0]?.id} smell={s} />)}</div>
      )}
    </div>
  );
}

function SmellsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-24" />
    </div>
  );
}

/**
 * Architecture smells: circular import/extends cycles, god modules (high
 * fan-in × fan-out) and fragile entities (high churn × many dependents).
 */
export function SmellsSection() {
  const { data, loading, error, refresh } = useApiResource<SmellResponse>((token) =>
    intelligenceService.getSmells(token),
  );

  if (loading) return <SmellsSkeleton />;
  if (error) {
    return (
      <SectionError
        title="Couldn't load architecture smells"
        message={error === 'empty' ? 'No repository mapped yet.' : error}
        onRetry={() => void refresh()}
      />
    );
  }
  if (!data) return null;

  const total = data.cycles.length + data.godModules.length + data.fragile.length;
  if (total === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <GitFork className="size-5 text-muted-foreground/60" aria-hidden />
          <p className="text-sm font-medium">No architecture smells found</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            No cycles, god modules or fragile entities detected in the modeled graph.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Group title="Cycles" icon={GitFork} accent="text-rose-500" smells={data.cycles} />
      <Group title="God modules" icon={Scale} accent="text-amber-500" smells={data.godModules} />
      <Group title="Fragile" icon={Siren} accent="text-orange-500" smells={data.fragile} />
    </div>
  );
}
