'use client';

import { ArrowDown, X } from 'lucide-react';
import type { ImpactResponse, ImpactedEntity } from '@tracegraph/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  getNodeTypeColor,
  NodeTypeBadge,
  NodeTypeIcon,
  RelationshipTypeBadge,
} from '@/components/dependencies/relationship-badge';
import { cn } from '@/lib/utils';

interface PathExplorerProps {
  pathId: string;
  response: ImpactResponse;
  onClose: () => void;
}

/**
 * "Why is this impacted?" — the explainability panel (Phase 9 §28). The
 * explanation is assembled from the graph evidence path returned by the API,
 * never from an LLM. For an indirect entity it shows the full chain
 * (affected → … → root) with the relationship types between hops.
 */
export function PathExplorer({ pathId, response, onClose }: PathExplorerProps) {
  const entity: ImpactedEntity | undefined =
    response.directImpact.find((e) => e.id === pathId) ??
    response.indirectImpact.find((e) => e.id === pathId);

  if (!entity) return null;

  const chain = entity.path.nodes;
  const relTypes = entity.path.relTypes;

  return (
    <Card className="border-sky-500/40 bg-card/40" data-testid="path-explorer">
      <CardHeader className="flex flex-row items-center justify-between gap-3 py-3 pl-4 pr-2">
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-sky-400">
            Why is this impacted?
          </p>
          <h3 className="text-sm font-semibold text-foreground">{entity.label}</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close path explanation"
          className="size-8"
        >
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4 pb-4 pt-1">
        {/* The evidence chain */}
        <div className="flex flex-col gap-2">
          {chain.map((node, idx) => (
            <div key={`${node.id}-${idx}`} className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md border',
                    getNodeTypeColor(node.type),
                  )}
                >
                  <NodeTypeIcon type={node.type} className="size-3" />
                </span>
                <span className="text-xs font-medium text-foreground">{node.label}</span>
                <NodeTypeBadge type={node.type} />
                {idx === chain.length - 1 ? (
                  <span className="font-mono text-[9px] font-bold uppercase text-sky-400">Root</span>
                ) : null}
              </div>
              {idx < relTypes.length ? (
                <div className="flex items-center gap-2 pl-3">
                  <ArrowDown className="size-3 text-muted-foreground/60" />
                  <RelationshipTypeBadge type={relTypes[idx]} />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* Natural-language explanation from the path facts */}
        <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {entity.reason}
        </p>
      </CardContent>
    </Card>
  );
}
