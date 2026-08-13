import { TriangleAlert } from 'lucide-react';
import type { RepositoryActivity } from '@tracegraph/shared';
import { ActivityItem, type ActivityItemProps } from '@/components/activity/activity-item';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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

/** Recent engineering activity across the repository. */
export function RecentActivity({ activity }: { activity: RepositoryActivity }) {
  const feed = buildActivityFeed(activity);
  const empty = activity.commits.length === 0 &&
    activity.pullRequests.length === 0 &&
    activity.issues.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Recent activity</CardTitle>
        <CardDescription>
          Commits, pull requests, and issues touching the repository.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {empty ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <TriangleAlert className="size-5 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium">No recent activity</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Commits, pull requests, and issues will appear here as the repository changes.
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
