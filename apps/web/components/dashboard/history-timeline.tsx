'use client';

import { GitCommitHorizontal, GitPullRequest, MessageSquare, Clock } from 'lucide-react';
import type { HistoryTimelineEntry } from '@tracegraph/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface HistoryTimelineProps {
  timeline: HistoryTimelineEntry[];
  total: number;
  loading?: boolean;
}

function TimelineSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
        ))}
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  commit: { icon: GitCommitHorizontal, color: 'bg-sky-500/10 text-sky-600', label: 'Commit' },
  pull_request: { icon: GitPullRequest, color: 'bg-violet-500/10 text-violet-600', label: 'PR' },
  issue: { icon: MessageSquare, color: 'bg-amber-500/10 text-amber-600', label: 'Issue' },
  review_comment: { icon: MessageSquare, color: 'bg-emerald-500/10 text-emerald-600', label: 'Review' },
};

export function HistoryTimeline({ timeline, total, loading }: HistoryTimelineProps) {
  if (loading) return <TimelineSkeleton />;
  if (timeline.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="size-4 text-sky-500" aria-hidden />
            History
          </CardTitle>
          {total > timeline.length ? (
            <span className="text-[10px] text-muted-foreground">
              Showing {timeline.length} of {total}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative flex flex-col gap-0">
          {/* Vertical line */}
          <div className="absolute left-3.5 top-2 bottom-2 w-px bg-border/60" />

          {timeline.map((entry, i) => {
            const config = typeConfig[entry.type] ?? typeConfig.commit;
            const Icon = config.icon;
            const meta = entry.metadata as Record<string, unknown>;

            return (
              <div key={`${entry.type}-${i}`} className="relative flex gap-3 py-2.5">
                {/* Icon */}
                <div className={cn('relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full', config.color)}>
                  <Icon className="size-3.5" aria-hidden />
                </div>

                {/* Content */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 font-mono text-[8px] uppercase tracking-wider">
                      {config.label}
                      {meta.prNumber ? ` #${meta.prNumber}` : ''}
                      {meta.sha ? ` ${(meta.sha as string).slice(0, 7)}` : ''}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-foreground">
                    {String(meta.message ?? entry.title)}
                  </p>
                  {meta.author ? (
                    <span className="text-[10px] text-muted-foreground">
                      by {String(meta.author)}
                    </span>
                  ) : null}
                  {meta.prTitle ? (
                    <span className="text-[10px] text-muted-foreground">
                      PR: {String(meta.prTitle)}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
