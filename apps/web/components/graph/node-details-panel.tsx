'use client';

import Link from 'next/link';
import {
  ArrowRight,
  FileCode2,
  GitCompareArrows,
  Radar,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';
import type { GraphNode } from '@tracegraph/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  getNodeTypeColor,
  NodeTypeBadge,
  NodeTypeIcon,
} from '@/components/dependencies/relationship-badge';
import { TopCommitterChip } from '@/components/dependencies/top-committer-chip';

export interface NodeDetailsPanelProps {
  node: GraphNode | null;
  onClose?: () => void;
}

export function NodeDetailsPanel({ node, onClose }: NodeDetailsPanelProps) {
  if (!node) return null;

  // properties is optional on the shared GraphNode type — never assume it.
  const filePath =
    (node.properties?.filePath as string | undefined) ||
    (node.properties?.path as string | undefined) ||
    (node.type === 'File' ? node.label : undefined);

  return (
    <Card className="border-border/80 bg-card/95 shadow-xl backdrop-blur-md">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md',
              getNodeTypeColor(node.type),
            )}
          >
            <NodeTypeIcon type={node.type} className="size-3.5" />
          </span>
          <CardTitle className="text-sm font-semibold truncate">{node.label}</CardTitle>
        </div>
        <div className="flex items-center gap-1.5">
          <NodeTypeBadge type={node.type} />
          <TopCommitterChip nodeId={node.id} entityLabel={node.label} />
          {onClose ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-7 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 p-4">
        {filePath ? (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              File Path
            </span>
            <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/30 px-2.5 py-1.5 text-xs font-mono text-foreground truncate">
              <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{filePath}</span>
            </div>
          </div>
        ) : null}

        {/* Action: Explore Dependencies */}
        <div className="flex flex-col gap-2 pt-1">
          <Link
            href={`/dependencies?node=${encodeURIComponent(node.id)}`}
            className={buttonVariants({ className: 'w-full gap-2 text-xs', size: 'sm' })}
          >
            <Workflow className="size-3.5" />
            Explore Dependencies
            <ArrowRight className="size-3 ml-auto" />
          </Link>

          <Link
            href={`/impact?node=${encodeURIComponent(node.id)}`}
            className={buttonVariants({
              variant: 'outline',
              className: 'w-full gap-2 text-xs',
              size: 'sm',
            })}
          >
            <Radar className="size-3.5" />
            Analyze Impact
          </Link>

          {filePath ? (
            <Link
              href={`/intelligence?blast=${encodeURIComponent(filePath)}`}
              className={buttonVariants({
                variant: 'outline',
                className:
                  'w-full gap-2 text-xs border-emerald-500/40 text-emerald-500 hover:border-emerald-500/70 hover:bg-emerald-500/10 hover:text-emerald-400',
                size: 'sm',
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
              className: 'w-full gap-2 text-xs',
              size: 'sm',
            })}
          >
            <Sparkles className="size-3.5" />
            Explain impact
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
