'use client';

import { Users } from 'lucide-react';
import type { Contributor } from '@tracegraph/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ContributorsListProps {
  contributors: Contributor[];
  loading?: boolean;
}

function ContributorSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 rounded" />
        ))}
      </CardContent>
    </Card>
  );
}

function getAvatarColor(username: string): string {
  const colors = [
    'bg-sky-500/15 text-sky-600',
    'bg-violet-500/15 text-violet-600',
    'bg-emerald-500/15 text-emerald-600',
    'bg-amber-500/15 text-amber-600',
    'bg-rose-500/15 text-rose-600',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function ContributorsList({ contributors, loading }: ContributorsListProps) {
  if (loading) return <ContributorSkeleton />;
  if (contributors.length === 0) return null;

  const maxCount = contributors[0]?.commitCount ?? 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="size-4 text-violet-500" aria-hidden />
          Contributors
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {contributors.map((contributor) => (
            <div
              key={contributor.username}
              className="flex items-center gap-2.5"
            >
              <div
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  getAvatarColor(contributor.username),
                )}
              >
                {contributor.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium text-foreground">
                  {contributor.name || contributor.username}
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-violet-500/60"
                      style={{ width: `${(contributor.commitCount / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {contributor.commitCount} commits
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
