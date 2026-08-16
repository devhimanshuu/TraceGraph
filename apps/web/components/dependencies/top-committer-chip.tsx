'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { UserRound } from 'lucide-react';
import type { KnowledgeResponse } from '@tracegraph/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useNodeCategory } from '@/hooks/use-node-category';
import { intelligenceService } from '@/lib/services/intelligence.service';

export interface TopCommitterChipProps {
  /** The entity whose top committer(s) should be shown. */
  nodeId: string | null;
  /** Human label for tooltips/aria (falls back to the committer's name). */
  entityLabel?: string;
  /**
   * `chip` (default) renders only the top committer as one pill — compact
   * enough for the graph explorer's node panel. `row` renders the top 3 as a
   * compact row of pills, each with its commit count — used by the dependency
   * explorer's entity summary. Both deep-link to the scoped knowledge map.
   */
  variant?: 'chip' | 'row';
  className?: string;
}

const MAX_ROW_COMMITTERS = 3;

/**
 * "Who touched this most" — top committers on an entity, straight off the
 * Commit → AUTHORED_BY graph. Renders as clickable pills that deep-link to the
 * Intelligence page's knowledge map scoped to this entity (`?entity=`).
 * Shared by the dependency explorer's entity summary and the graph explorer's
 * node panel so the identity context renders identically everywhere.
 */
export function TopCommitterChip({
  nodeId,
  entityLabel,
  variant = 'chip',
  className,
}: TopCommitterChipProps) {
  const knowledge = useNodeCategory<KnowledgeResponse>(
    nodeId,
    useCallback(
      (id: string, token: string | null) =>
        intelligenceService.getKnowledge({ entityId: id, limit: 3 }, token),
      [],
    ),
  );

  if (knowledge.loading) {
    return <Skeleton className={variant === 'row' ? 'h-5 w-44 rounded-full' : 'h-5 w-28 rounded-full'} />;
  }

  const owners = knowledge.data?.owners ?? [];
  const targetLabel = entityLabel ?? owners[0]?.developer.label ?? 'this entity';
  const href = `/intelligence?entity=${encodeURIComponent(nodeId ?? '')}`;

  if (variant === 'row') {
    if (owners.length === 0) return null;
    return (
      <div
        className={`flex flex-wrap items-center gap-1.5 ${className ?? ''}`}
        title={`Who touched this most — top committers on ${targetLabel}. Click for the full knowledge map.`}
        data-testid="top-committer-chip"
      >
        {owners.slice(0, MAX_ROW_COMMITTERS).map((owner, i) => (
          <Link
            key={owner.developer.id}
            href={href}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-400 transition-colors hover:border-sky-500/60 hover:bg-sky-500/20 hover:text-sky-300 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {i === 0 ? (
              <UserRound className="size-3 shrink-0" aria-hidden />
            ) : (
              <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-mono text-[8px] font-semibold text-sky-400">
                {i + 1}
              </span>
            )}
            <span className="truncate">{owner.developer.label}</span>
            <span className="text-sky-400/70">
              · {owner.commits} commit{owner.commits === 1 ? '' : 's'}
            </span>
          </Link>
        ))}
      </div>
    );
  }

  const owner = owners[0];
  if (!owner) return null;

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-400 transition-colors hover:border-sky-500/60 hover:bg-sky-500/20 hover:text-sky-300 focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`}
      title={`Who touched this most — top committer on ${targetLabel}. Click for the full knowledge map.`}
      data-testid="top-committer-chip"
    >
      <UserRound className="size-3" aria-hidden />
      {owner.developer.label}
      <span className="text-sky-400/70">
        · {owner.commits} commit{owner.commits === 1 ? '' : 's'}
      </span>
    </Link>
  );
}
