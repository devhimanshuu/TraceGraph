'use client';

import { useCallback, useState, useEffect } from 'react';
import { HelpCircle, GitPullRequest, MessageSquare, Loader2, User } from 'lucide-react';
import type { ChangeContext } from '@tracegraph/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGitHubSession } from '@/hooks/use-github-session';
import { apiClient } from '@/lib/api-client';

interface WhyChangedPanelProps {
  entityId: string;
}

export function WhyChangedPanel({ entityId }: WhyChangedPanelProps) {
  const { getToken } = useGitHubSession();
  const [context, setContext] = useState<ChangeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const resp = await apiClient.getWhyChanged(entityId, token);
      setContext(resp.context);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load context');
    } finally {
      setLoading(false);
    }
  }, [entityId, getToken]);

  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-16 bg-muted/50 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (error || !context) return null;

  const { mostRecentChange, totalChanges, recentContributors } = context;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HelpCircle className="size-4 text-amber-500" aria-hidden />
          Why Was This Changed?
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Most recent change */}
        {mostRecentChange ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Most recent change</span>
              <span className="font-mono text-[10px]">{mostRecentChange.commitSha.slice(0, 7)}</span>
            </div>
            <p className="text-xs text-foreground">{mostRecentChange.commitMessage}</p>
            <div className="flex flex-wrap gap-2">
              {mostRecentChange.prNumber ? (
                <Badge variant="outline" className="gap-1 font-mono text-[9px]">
                  <GitPullRequest className="size-2.5" />
                  PR #{mostRecentChange.prNumber}
                </Badge>
              ) : null}
              {mostRecentChange.issueNumber ? (
                <Badge variant="outline" className="gap-1 font-mono text-[9px]">
                  <MessageSquare className="size-2.5" />
                  Issue #{mostRecentChange.issueNumber}
                </Badge>
              ) : null}
            </div>
            {mostRecentChange.issueTitle ? (
              <p className="text-[11px] text-muted-foreground">
                Issue: {mostRecentChange.issueTitle}
              </p>
            ) : null}
            <span className="text-[10px] text-muted-foreground">
              by {mostRecentChange.author}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No historical changes found.</p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>Total changes: <strong className="tabular-nums">{totalChanges}</strong></span>
        </div>

        {/* Recent contributors */}
        {recentContributors.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium text-muted-foreground">Top contributors</span>
            {recentContributors.map((c) => (
              <div key={c.username} className="flex items-center gap-2 text-xs">
                <User className="size-3 text-muted-foreground" />
                <span className="text-foreground">{c.username}</span>
                <span className="text-muted-foreground">{c.commitCount} commits</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
