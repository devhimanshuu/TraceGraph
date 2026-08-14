'use client';

import Link from 'next/link';
import { ArrowRight, CornerDownRight, Network, Workflow } from 'lucide-react';
import type { DependencyTarget } from '@tracegraph/shared';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getNodeTypeColor,
  NodeTypeBadge,
  NodeTypeIcon,
  RelationshipTypeBadge,
} from '@/components/dependencies/relationship-badge';

export interface RelationshipItemProps {
  item: DependencyTarget;
  currentLabel: string;
  direction: 'dependency' | 'dependent' | 'caller' | 'callee';
}

export function RelationshipItem({ item, currentLabel, direction }: RelationshipItemProps) {
  // Human-readable explanation of why these nodes are connected
  const explanation = (() => {
    switch (direction) {
      case 'dependency':
      case 'callee':
        if (item.relationshipType === 'IMPORTS') {
          return `${currentLabel} imports ${item.label}`;
        }
        if (item.relationshipType === 'EXTENDS') {
          return `${currentLabel} extends ${item.label}`;
        }
        return `${currentLabel} calls ${item.label}`;
      case 'dependent':
      case 'caller':
        if (item.relationshipType === 'IMPORTS') {
          return `${item.label} imports ${currentLabel}`;
        }
        if (item.relationshipType === 'EXTENDS') {
          return `${item.label} extends ${currentLabel}`;
        }
        return `${item.label} calls ${currentLabel}`;
    }
  })();

  return (
    <div className="group relative flex flex-col gap-3 rounded-lg border border-border/60 bg-card/40 p-4 transition-all hover:border-border hover:bg-card/80 sm:flex-row sm:items-center sm:justify-between">
      {/* Left side: Icon, Name, Explanation */}
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg border',
            getNodeTypeColor(item.type),
          )}
        >
          <NodeTypeIcon type={item.type} className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dependencies?node=${encodeURIComponent(item.id)}`}
              className="truncate text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none"
              title={item.label}
            >
              {item.label}
            </Link>
            <NodeTypeBadge type={item.type} />
            <RelationshipTypeBadge type={item.relationshipType} />
          </div>

          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">Reason:</span>
            <span>{explanation}</span>
          </p>

          {item.via ? (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
              <CornerDownRight className="size-3 text-muted-foreground/60" />
              <span>via function:</span>
              <span className="font-mono text-foreground/90">{item.via.label}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Right side: Navigation actions */}
      <div className="flex shrink-0 items-center gap-2 pt-2 sm:pt-0">
        <Link
          href={`/graph?node=${encodeURIComponent(item.id)}`}
          title="View in Graph Explorer"
          className={buttonVariants({
            variant: 'outline',
            size: 'sm',
            className: 'h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground',
          })}
        >
          <Network className="size-3.5" />
          <span className="hidden xs:inline">Open in</span> Graph
        </Link>
        <Link
          href={`/dependencies?node=${encodeURIComponent(item.id)}`}
          title="Explore Dependencies"
          className={buttonVariants({
            variant: 'secondary',
            size: 'sm',
            className: 'h-8 text-xs gap-1.5',
          })}
        >
          <Workflow className="size-3.5" />
          Explore
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
