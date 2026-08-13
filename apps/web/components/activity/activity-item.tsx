import { GitCommitHorizontal, GitPullRequest, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ActivityKind = 'commit' | 'pull-request' | 'issue';

const KIND_META: Record<
  ActivityKind,
  {
    label: string;
    icon: typeof GitCommitHorizontal | typeof GitPullRequest | typeof TriangleAlert;
    badge: string;
  }
> = {
  commit: {
    label: 'Commit',
    icon: GitCommitHorizontal,
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  },
  'pull-request': {
    label: 'Pull request',
    icon: GitPullRequest,
    badge: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  },
  issue: {
    label: 'Issue',
    icon: TriangleAlert,
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  },
};

export interface ActivityItemProps {
  kind: ActivityKind;
  /** Title or message. */
  title: string;
  /** Identifier — commit sha, #421, #912. */
  identifier: string;
  /** Optional status line (merged / open / closed …). */
  status?: string;
  /** Optional author name. */
  author?: string;
  /** ISO timestamp used for the relative "x ago" display. */
  timestamp: string;
}

/** One row in the engineering-activity feed. Pure DTO-driven, no graph terms. */
export function ActivityItem({
  kind,
  title,
  identifier,
  status,
  author,
  timestamp,
}: ActivityItemProps) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border',
          meta.badge,
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium">{title}</p>
          <time dateTime={timestamp} className="shrink-0 text-xs text-muted-foreground">
            {formatRelative(timestamp)}
          </time>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-mono text-[10px]">
            {identifier}
          </Badge>
          <span className="capitalize">{meta.label.toLowerCase()}</span>
          {status ? <span aria-hidden>·</span> : null}
          {status ? <span>{status}</span> : null}
          {author ? (
            <>
              <span aria-hidden>·</span>
              <span>{author}</span>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

// Tiny local wrapper keeps this component dependency-free and testable.
function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return '';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
