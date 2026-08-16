'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  FileCode2,
  FlaskConical,
  GitCompareArrows,
  History,
  Network,
  Radar,
  Search,
  Share2,
  Sparkles,
} from 'lucide-react';
import type { GraphNode, RelationshipSummary } from '@tracegraph/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EntitySearchDialog } from '@/components/dependencies/entity-search-dialog';
import { TopCommitterChip } from '@/components/dependencies/top-committer-chip';
import {
  getNodeTypeColor,
  NodeTypeBadge,
  NodeTypeIcon,
} from '@/components/dependencies/relationship-badge';
import { cn } from '@/lib/utils';

export interface EntitySummaryProps {
  node: GraphNode | null;
  summary: RelationshipSummary | null;
  loading: boolean;
}

export function EntitySummary({ node, summary, loading }: EntitySummaryProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  if (loading || !node) {
    return (
      <Card className="border-border/60 bg-card/40" data-testid="entity-summary-skeleton">
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
          <Skeleton className="h-4 w-full max-w-sm" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const filePath =
    (node.properties.filePath as string) ||
    (node.properties.path as string) ||
    (node.type === 'File' ? node.label : undefined);

  const lineStart = node.properties.lineStart as number | undefined;
  const lineEnd = node.properties.lineEnd as number | undefined;
  const lineInfo = lineStart && lineEnd ? `L${lineStart}–${lineEnd}` : lineStart ? `L${lineStart}` : undefined;

  const totalHistory =
    (summary?.commits ?? 0) + (summary?.pullRequests ?? 0) + (summary?.issues ?? 0);

  return (
    <>
      <Card className="relative overflow-hidden border-border/60 bg-card/50 shadow-xs">
        {/* Subtle accent glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/5 blur-2xl"
        />

        <CardContent className="flex flex-col gap-5 p-5">
          {/* Header row: Icon, Label, Badges, Search & Actions */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-xl border shadow-xs',
                  getNodeTypeColor(node.type),
                )}
              >
                <NodeTypeIcon type={node.type} className="size-5" />
              </span>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">
                    {node.label}
                  </h1>
                  <NodeTypeBadge type={node.type} />
                </div>

                {/* Who touched this most — top 3 committers, clickable */}
                <TopCommitterChip nodeId={node.id} entityLabel={node.label} variant="row" />

                {/* File path + line numbers */}
                {filePath ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <FileCode2 className="size-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="font-mono truncate" title={filePath}>
                      {filePath}
                    </span>
                    {lineInfo ? (
                      <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
                        {lineInfo}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchOpen(true)}
                className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Search className="size-3.5" />
                Change Entity
              </Button>
              <Link
                href={`/graph?node=${encodeURIComponent(node.id)}`}
                className={buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                  className: 'h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground',
                })}
              >
                <Network className="size-3.5" />
                Open in Graph
              </Link>
              <Link
                href={`/impact?node=${encodeURIComponent(node.id)}`}
                className={buttonVariants({
                  size: 'sm',
                  className: 'h-8 text-xs gap-1.5 bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
                })}
              >
                <Radar className="size-3.5" />
                Analyze Impact
                <ArrowRight className="size-3" />
              </Link>
              {filePath ? (
                <Link
                  href={`/intelligence?blast=${encodeURIComponent(filePath)}`}
                  className={buttonVariants({
                    variant: 'outline',
                    size: 'sm',
                    className:
                      'h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-500 hover:border-emerald-500/70 hover:bg-emerald-500/10 hover:text-emerald-400',
                  })}
                  title="Pre-fill the PR blast-radius tool with this file"
                >
                  <GitCompareArrows className="size-3.5" />
                  Analyze PR
                </Link>
              ) : null}
              <Link
                href={`/impact?node=${encodeURIComponent(node.id)}&explain=1`}
                className={buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                  className:
                    'h-8 text-xs gap-1.5 border-sky-500/40 text-sky-400 hover:border-sky-500/70 hover:bg-sky-500/10 hover:text-sky-300',
                })}
              >
                <Sparkles className="size-3.5" />
                Explain impact
              </Link>
            </div>
          </div>

          {/* Metric Badges Grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 pt-1">
            <div className="flex flex-col rounded-lg border border-border/50 bg-background/50 p-2.5">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Share2 className="size-3 text-muted-foreground/70" />
                Relationships
              </span>
              <span className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {summary?.relationships.toLocaleString() ?? '—'}
              </span>
            </div>

            <div className="flex flex-col rounded-lg border border-border/50 bg-background/50 p-2.5">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Boxes className="size-3 text-sky-400" />
                Dependencies
              </span>
              <span className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {summary?.dependencies.toLocaleString() ?? '—'}
              </span>
            </div>

            <div className="flex flex-col rounded-lg border border-border/50 bg-background/50 p-2.5">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Boxes className="size-3 text-violet-400" />
                Dependents
              </span>
              <span className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {summary?.dependents.toLocaleString() ?? '—'}
              </span>
            </div>

            <div className="flex flex-col rounded-lg border border-border/50 bg-background/50 p-2.5">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <FlaskConical className="size-3 text-amber-400" />
                Tests
              </span>
              <span className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {summary?.tests.toLocaleString() ?? '—'}
              </span>
            </div>

            <div className="flex flex-col rounded-lg border border-border/50 bg-background/50 p-2.5 col-span-2 sm:col-span-1">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <History className="size-3 text-cyan-400" />
                Recent Changes
              </span>
              <span className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {totalHistory.toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <EntitySearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
