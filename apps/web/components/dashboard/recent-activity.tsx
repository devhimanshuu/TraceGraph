import { TriangleAlert } from 'lucide-react';
import type { RepositoryActivity } from '@tracegraph/shared';
import { ActivityItem, type ActivityItemProps } from '@/components/activity/activity-item';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ACTIVITY_RANGE_OPTIONS, type ActivityRange } from '@/lib/activity';
import { cn } from '@/lib/utils';

/** Merges commits / PRs / issues into one recency-ordered activity feed. */
export function buildActivityFeed(activity: RepositoryActivity): ActivityItemProps[] {
  const items: ActivityItemProps[] = [
    ...activity.commits.map<ActivityItemProps>((c) => ({
      kind: 'commit',
      title: c.message,
      identifier: c.sha.slice(0, 7),
      author: c.author?.name ?? c.author?.username ?? undefined,
      timestamp: c.timestamp,
    })),
    ...activity.pullRequests.map<ActivityItemProps>((pr) => ({
      kind: 'pull-request',
      title: pr.title,
      identifier: `#${pr.number}`,
      status: pr.status,
      timestamp: pr.mergedAt ?? pr.createdAt,
    })),
    ...activity.issues.map<ActivityItemProps>((i) => ({
      kind: 'issue',
      title: i.title,
      identifier: `#${i.number}`,
      status: i.status,
      timestamp: i.createdAt,
    })),
  ];
  return items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

interface RecentActivityProps {
  activity: RepositoryActivity;
  /** Selected time window — the API filters by this cutoff. */
  range: ActivityRange;
  onRangeChange: (range: ActivityRange) => void;
}

/** Recent engineering activity across the repository, filterable by time. */
export function RecentActivity({ activity, range, onRangeChange }: RecentActivityProps) {
  const feed = buildActivityFeed(activity);
  const empty =
    activity.commits.length === 0 &&
    activity.pullRequests.length === 0 &&
    activity.issues.length === 0;
  const filtered = range !== 'all';

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm">Recent activity</CardTitle>
          <CardDescription>
            Commits, pull requests, and issues touching the repository
            {filtered ? ` in the last ${range}` : ''}.
          </CardDescription>
        </div>
        <div
          role="group"
          aria-label="Activity time range"
          className="flex shrink-0 items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs"
        >
          {ACTIVITY_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onRangeChange(option.value)}
              aria-pressed={range === option.value}
              className={cn(
                'rounded px-2.5 py-1 transition-colors',
                range === option.value
                  ? 'bg-background font-medium text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {empty ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <TriangleAlert className="size-5 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium">
              {filtered ? 'No activity in this period' : 'No recent activity'}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {filtered
                ? 'Try a wider time range, or check back as the repository changes.'
                : 'Commits, pull requests, and issues will appear here as the repository changes.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {feed.map((item) => (
              <ActivityItem key={`${item.kind}-${item.identifier}`} {...item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
