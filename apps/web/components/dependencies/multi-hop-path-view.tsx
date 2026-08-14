'use client';

import Link from 'next/link';
import { ArrowDown, GitFork, Network, Workflow } from 'lucide-react';
import type { TraversalResult } from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryErrorState } from '@/components/dependencies/category-error-state';
import { EmptyRelationshipState } from '@/components/dependencies/empty-relationship-state';
import {
  getNodeTypeColor,
  NodeTypeBadge,
  NodeTypeIcon,
  RelationshipTypeBadge,
} from '@/components/dependencies/relationship-badge';
import { cn } from '@/lib/utils';

export interface MultiHopPathViewProps {
  traversal: TraversalResult | null;
  loading: boolean;
  error: string | null;
  currentLabel: string;
  onRetry?: () => void;
  direction?: 'in' | 'out';
  onDirectionChange?: (dir: 'in' | 'out') => void;
}

export function MultiHopPathView({
  traversal,
  loading,
  error,
  currentLabel,
  onRetry,
  direction = 'in',
  onDirectionChange,
}: MultiHopPathViewProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-2" data-testid="multi-hop-skeleton">
        <Skeleton className="h-9 w-72" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <CategoryErrorState
        title="Failed to trace multi-hop paths"
        message={error}
        onRetry={onRetry}
      />
    );
  }

  const paths = traversal?.paths ?? [];
  const nodeMap = new Map<string, { id: string; label: string; type: string; hops?: number }>();
  if (traversal) {
    nodeMap.set(traversal.root.id, traversal.root);
    for (const n of traversal.nodes) {
      nodeMap.set(n.id, n);
    }
  }

  if (paths.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {onDirectionChange ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Direction:</span>
            <div className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => onDirectionChange('in')}
                className={`rounded px-2.5 py-1 transition-colors ${
                  direction === 'in'
                    ? 'bg-background font-medium text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Inbound (Who reaches this)
              </button>
              <button
                type="button"
                onClick={() => onDirectionChange('out')}
                className={`rounded px-2.5 py-1 transition-colors ${
                  direction === 'out'
                    ? 'bg-background font-medium text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Outbound (What this reaches)
              </button>
            </div>
          </div>
        ) : null}
        <EmptyRelationshipState
          title="No multi-hop paths found"
          description={`No multi-hop evidence paths (2–3 hops) were found connecting ${currentLabel} in this direction.`}
          icon={GitFork}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header with direction switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h4 className="text-sm font-semibold tracking-tight text-foreground">
            Multi-hop connection chains
          </h4>
          <p className="text-xs text-muted-foreground">
            Bounded evidence paths (up to 3 hops) showing how components connect through intermediate symbols.
          </p>
        </div>

        {onDirectionChange ? (
          <div className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs shrink-0">
            <button
              type="button"
              onClick={() => onDirectionChange('in')}
              className={`rounded px-2.5 py-1 transition-colors ${
                direction === 'in'
                  ? 'bg-background font-medium text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Inbound (Dependents)
            </button>
            <button
              type="button"
              onClick={() => onDirectionChange('out')}
              className={`rounded px-2.5 py-1 transition-colors ${
                direction === 'out'
                  ? 'bg-background font-medium text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Outbound (Dependencies)
            </button>
          </div>
        ) : null}
      </div>

      {/* List of paths */}
      <div className="flex flex-col gap-3">
        {paths.map((path, pIdx) => (
          <Card key={pIdx} className="border-border/60 bg-card/40 overflow-hidden">
            <CardHeader className="py-2.5 px-4 bg-muted/20 border-b border-border/40 flex flex-row items-center justify-between">
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                Path #{pIdx + 1} ({path.nodes.length - 1} hops)
              </span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {path.nodes.length} nodes
              </Badge>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex flex-col gap-2">
                {path.nodes.map((nodeId, idx) => {
                  const node = nodeMap.get(nodeId);
                  const label = node?.label ?? nodeId.split(':').pop() ?? nodeId;
                  const type = node?.type ?? 'Class';
                  const relType = path.relTypes[idx];
                  const isCurrent = nodeId === traversal?.root.id;

                  return (
                    <div key={`${nodeId}-${idx}`} className="flex flex-col">
                      {/* Node row */}
                      <div
                        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-md border ${
                          isCurrent
                            ? 'border-primary/40 bg-primary/5 font-medium'
                            : 'border-border/60 bg-background/60 hover:bg-card/90'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={cn(
                              'flex size-6 shrink-0 items-center justify-center rounded-md border',
                              getNodeTypeColor(type),
                            )}
                          >
                            <NodeTypeIcon type={type} className="size-3" />
                          </span>
                          <Link
                            href={`/dependencies?node=${encodeURIComponent(nodeId)}`}
                            className="font-medium text-xs text-foreground truncate hover:underline hover:text-primary"
                            title={nodeId}
                          >
                            {label}
                          </Link>
                          <NodeTypeBadge type={type} />
                          {isCurrent ? (
                            <Badge
                              variant="outline"
                              className="border-sky-500/40 bg-sky-500/10 text-[10px] uppercase font-mono text-sky-400"
                            >
                              Selected
                            </Badge>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Link
                            href={`/graph?node=${encodeURIComponent(nodeId)}`}
                            className={buttonVariants({
                              variant: 'ghost',
                              size: 'sm',
                              className: 'h-6 text-[11px] px-1.5 text-muted-foreground',
                            })}
                          >
                            <Network className="size-3 mr-1" />
                            Graph
                          </Link>
                          <Link
                            href={`/dependencies?node=${encodeURIComponent(nodeId)}`}
                            className={buttonVariants({
                              variant: 'ghost',
                              size: 'sm',
                              className: 'h-6 text-[11px] px-1.5 text-primary',
                            })}
                          >
                            <Workflow className="size-3 mr-1" />
                            Inspect
                          </Link>
                        </div>
                      </div>

                      {/* Relationship link to next node */}
                      {idx < path.nodes.length - 1 && relType ? (
                        <div className="flex items-center gap-2 py-1 pl-5">
                          <ArrowDown className="size-3 text-muted-foreground/60" />
                          <RelationshipTypeBadge type={relType} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
