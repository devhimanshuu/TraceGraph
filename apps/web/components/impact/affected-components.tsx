'use client';

import Link from 'next/link';
import { ArrowDown, ArrowRight, Network, Workflow } from 'lucide-react';
import type { ImpactedEntity, ImpactType } from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  getNodeTypeColor,
  NodeTypeBadge,
  NodeTypeIcon,
  RelationshipTypeBadge,
} from '@/components/dependencies/relationship-badge';
import { cn } from '@/lib/utils';

function ImpactTypeBadge({ impactType }: { impactType: ImpactType }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-mono text-[10px] uppercase tracking-wider',
        impactType === 'DIRECT'
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-400'
          : 'border-violet-500/40 bg-violet-500/10 text-violet-400',
      )}
    >
      {impactType === 'DIRECT' ? 'Direct impact' : 'Indirect impact'}
    </Badge>
  );
}

function AffectedComponentItem({
  entity,
  selected,
  onSelect,
}: {
  entity: ImpactedEntity;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Card
      className={cn(
        'overflow-hidden border-border/60 bg-card/40 transition-all',
        selected && 'border-sky-500/50 ring-1 ring-sky-500/25',
      )}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-md border',
                getNodeTypeColor(entity.type),
              )}
            >
              <NodeTypeIcon type={entity.type} className="size-3.5" />
            </span>
            <span className="truncate text-sm font-semibold text-foreground" title={entity.id}>
              {entity.label}
            </span>
            <NodeTypeBadge type={entity.type} />
            <ImpactTypeBadge impactType={entity.impactType} />
          </div>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Distance: {entity.distance}
          </span>
        </div>

        {/* Reason — the key differentiator */}
        <p className="text-xs leading-relaxed text-muted-foreground">{entity.reason}</p>

        {/* Path (esp. for indirect impact) */}
        {entity.path.nodes.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {entity.path.nodes.map((node, idx) => (
              <span key={`${node.id}-${idx}`} className="flex items-center gap-1.5">
                <span className="rounded-md border border-border/60 bg-background/60 px-2 py-0.5 font-mono text-[10px] text-foreground">
                  {node.label}
                </span>
                {idx < entity.path.nodes.length - 1 ? (
                  <ArrowDown className="size-3 text-muted-foreground/60" />
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <RelationshipTypeBadge type={entity.relationship} />
            {entity.via ? (
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                via {entity.via.label}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelect(entity.id)}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-7 text-[11px] px-2 text-muted-foreground' }),
              )}
            >
              Why impacted?
            </button>
            <Link
              href={`/graph?node=${encodeURIComponent(entity.id)}`}
              className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-7 text-[11px] px-2 gap-1 text-muted-foreground' })}
            >
              <Network className="size-3" />
              Open in Graph
            </Link>
            <Link
              href={`/dependencies?node=${encodeURIComponent(entity.id)}`}
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-7 text-[11px] px-2.5 gap-1' })}
            >
              <Workflow className="size-3" />
              View Dependencies
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AffectedComponentsProps {
  direct: ImpactedEntity[];
  indirect: ImpactedEntity[];
  selectedPathId: string | null;
  onSelectPath: (id: string | null) => void;
}

/**
 * The affected components list. Direct and indirect buckets are visually
 * distinct (badges + colored icons), every card explains WHY via a
 * graph-fact reason, and each entity links out to the graph + dependency
 * explorer (Phase 9 §25, §29–30).
 */
export function AffectedComponents({ direct, indirect, selectedPathId, onSelectPath }: AffectedComponentsProps) {
  const all = [...direct, ...indirect];
  if (all.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-6 text-center text-xs text-muted-foreground">
        No affected components in this category.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="affected-components">
      {direct.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h3 className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-widest text-sky-400">
            <ArrowDown className="size-3" />
            Direct impact ({direct.length})
          </h3>
          <div className="flex flex-col gap-2.5">
            {direct.map((entity) => (
              <AffectedComponentItem
                key={entity.id}
                entity={entity}
                selected={selectedPathId === entity.id}
                onSelect={onSelectPath}
              />
            ))}
          </div>
        </section>
      ) : null}

      {indirect.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h3 className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-widest text-violet-400">
            <ArrowRight className="size-3" />
            Indirect impact ({indirect.length})
          </h3>
          <div className="flex flex-col gap-2.5">
            {indirect.map((entity) => (
              <AffectedComponentItem
                key={entity.id}
                entity={entity}
                selected={selectedPathId === entity.id}
                onSelect={onSelectPath}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
