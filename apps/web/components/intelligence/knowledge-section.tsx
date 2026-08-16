'use client';

import { ArrowLeft, GitCommitHorizontal, HelpCircle, UserRound } from 'lucide-react';
import type { KnowledgeResponse } from '@tracegraph/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
import { useApiResource } from '@/hooks/use-api-resource';
import { intelligenceService } from '@/lib/services/intelligence.service';
import { formatDate } from '@/lib/format';
import { SCROLL_LIST_CLASS } from '@/lib/scroll';
import { cn } from '@/lib/utils';

function KnowledgeSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-32" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * "Who to ask" — developers ranked by commit authorship. Scoped to a single
 * entity when `entityId` is provided (deep-linked from the "Who touched this
 * most" chip); otherwise repo-wide. Graph-driven (Commit → AUTHORED_BY).
 */
export function KnowledgeSection({ entityId }: { entityId?: string }) {
  const { data, loading, error, refresh } = useApiResource<KnowledgeResponse>((token) =>
    intelligenceService.getKnowledge(
      entityId ? { entityId, limit: 10 } : { limit: 10 },
      token,
    ),
  );

  const scoped = Boolean(entityId);
  const scopedLabel = data?.entity?.label;

  if (loading) return <KnowledgeSkeleton />;
  if (error) {
    return (
      <SectionError
        title="Couldn't load who-to-ask"
        message={error === 'empty' ? 'No repository mapped yet.' : error}
        onRetry={() => void refresh()}
      />
    );
  }
  if (!data) return null;

  if (data.owners.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <HelpCircle className="size-5 text-muted-foreground/60" aria-hidden />
          <p className="text-sm font-medium">No authors found</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Commits tied to developers will appear here once the repository has history.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <UserRound className="size-3.5 text-violet-500" aria-hidden />
          Who to ask
        </CardTitle>
        <span className="shrink-0 rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {data.owners.length}
        </span>
      </CardHeader>
      <CardContent className="flex-1 p-2 pt-0">
        {scoped ? (
          <div className="flex flex-col gap-1.5 px-1 pb-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Committers on{' '}
              <span className="font-semibold text-foreground">{scopedLabel ?? 'this entity'}</span> — the
              people most likely to know why this code is the way it is.
            </p>
            <a
              href="/intelligence"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-500 transition-colors hover:text-sky-400"
            >
              <ArrowLeft className="size-3" aria-hidden />
              Show repo-wide authors
            </a>
          </div>
        ) : (
          <p className="px-1 pb-2 text-[11px] leading-relaxed text-muted-foreground">
            Repository-wide authorship — the people most likely to know why code is the way it is.
          </p>
        )}
        <ol className={cn(SCROLL_LIST_CLASS, 'flex max-h-72 flex-col gap-3 p-1')} data-testid="knowledge-list">
          {data.owners.map((owner, i) => (
            <li key={owner.developer.id} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 font-mono text-[11px] font-semibold text-muted-foreground">
                <UserRound className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-semibold text-foreground">
                  {owner.developer.label}
                  {i === 0 && owner.commits > 0 ? (
                    <span className="ml-1.5 rounded-full bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sky-500">
                      top author
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                  <GitCommitHorizontal className="size-3" aria-hidden />
                  {owner.commits} commit{owner.commits === 1 ? '' : 's'}
                  {owner.lastCommit ? ` · last ${formatDate(owner.lastCommit)}` : ''}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
