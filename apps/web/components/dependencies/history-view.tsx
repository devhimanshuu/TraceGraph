'use client';

import { useMemo, useState } from 'react';
import {
  GitCommitHorizontal,
  GitPullRequest,
  History,
  Info,
  Search,
  Tag,
  User,
} from 'lucide-react';
import type { HistoryCommit, HistoryIssue, HistoryPullRequest } from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryErrorState } from '@/components/dependencies/category-error-state';
import { EmptyRelationshipState } from '@/components/dependencies/empty-relationship-state';
import { formatDate } from '@/lib/format';

export interface HistoryViewProps {
  commits: HistoryCommit[] | null;
  pullRequests: HistoryPullRequest[] | null;
  issues: HistoryIssue[] | null;
  loading: boolean;
  error: string | null;
  currentLabel: string;
  onRetry?: () => void;
}

type HistoryTab = 'all' | 'commits' | 'prs' | 'issues';

export function HistoryView({
  commits,
  pullRequests,
  issues,
  loading,
  error,
  currentLabel,
  onRetry,
}: HistoryViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<HistoryTab>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCommits = useMemo(() => {
    if (!commits) return [];
    if (!searchTerm.trim()) return commits;
    const q = searchTerm.toLowerCase();
    return commits.filter(
      (c) =>
        c.message.toLowerCase().includes(q) ||
        c.sha.toLowerCase().includes(q) ||
        (c.author && (c.author.name.toLowerCase().includes(q) || c.author.username.toLowerCase().includes(q))),
    );
  }, [commits, searchTerm]);

  const filteredPRs = useMemo(() => {
    if (!pullRequests) return [];
    if (!searchTerm.trim()) return pullRequests;
    const q = searchTerm.toLowerCase();
    return pullRequests.filter(
      (pr) => pr.title.toLowerCase().includes(q) || String(pr.number).includes(q),
    );
  }, [pullRequests, searchTerm]);

  const filteredIssues = useMemo(() => {
    if (!issues) return [];
    if (!searchTerm.trim()) return issues;
    const q = searchTerm.toLowerCase();
    return issues.filter(
      (i) => i.title.toLowerCase().includes(q) || String(i.number).includes(q),
    );
  }, [issues, searchTerm]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-2" data-testid="history-skeleton">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-9 w-64" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <CategoryErrorState
        title="Failed to load engineering history"
        message={error}
        onRetry={onRetry}
      />
    );
  }

  const totalItems =
    (commits?.length ?? 0) + (pullRequests?.length ?? 0) + (issues?.length ?? 0);

  if (totalItems === 0) {
    return (
      <EmptyRelationshipState
        title="No engineering history found"
        description={`No commits, pull requests, or issues are connected to ${currentLabel} or its source file.`}
        icon={History}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Multi-hop History Path Explanation Banner */}
      <Card className="border-border/60 bg-muted/20">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Info className="size-4 text-sky-400" />
            <span>How history connects to {currentLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2.5 py-1 font-medium text-foreground">
              <span>{currentLabel}</span>
            </div>
            <span className="text-muted-foreground/60">──contained in──►</span>
            <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2.5 py-1 text-muted-foreground">
              <span>Source File</span>
            </div>
            <span className="text-muted-foreground/60">◄──MODIFIES──</span>
            <div className="flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-400">
              <GitCommitHorizontal className="size-3" />
              <span>Commit</span>
            </div>
            <span className="text-muted-foreground/60">◄──CONTAINS──</span>
            <div className="flex items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-purple-400">
              <GitPullRequest className="size-3" />
              <span>Pull Request</span>
            </div>
            <span className="text-muted-foreground/60">◄──RELATED_TO──</span>
            <div className="flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-rose-400">
              <Tag className="size-3" />
              <span>Issue</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Changes are linked through the file modified by commits, which belong to pull requests
            addressing tracked issues.
          </p>
        </CardContent>
      </Card>

      {/* Filter and Sub-tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search commits, PRs, issues..."
            aria-label="Search history"
            className="h-9 w-full rounded-md border border-border/80 bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Sub-tab pills */}
        <div className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('all')}
            className={`rounded px-2.5 py-1 transition-colors ${
              activeSubTab === 'all'
                ? 'bg-background font-medium text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({totalItems})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('prs')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 transition-colors ${
              activeSubTab === 'prs'
                ? 'bg-background font-medium text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <GitPullRequest className="size-3" />
            PRs ({pullRequests?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('commits')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 transition-colors ${
              activeSubTab === 'commits'
                ? 'bg-background font-medium text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <GitCommitHorizontal className="size-3" />
            Commits ({commits?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('issues')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 transition-colors ${
              activeSubTab === 'issues'
                ? 'bg-background font-medium text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Tag className="size-3" />
            Issues ({issues?.length ?? 0})
          </button>
        </div>
      </div>

      {/* Pull Requests */}
      {(activeSubTab === 'all' || activeSubTab === 'prs') && filteredPRs.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <GitPullRequest className="size-3.5 text-purple-400" />
            Pull Requests ({filteredPRs.length})
          </h4>
          <div className="flex flex-col gap-2">
            {filteredPRs.map((pr) => (
              <div
                key={pr.number}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-400">
                    <GitPullRequest className="size-3.5" />
                  </span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-purple-400">
                        #{pr.number}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate">
                        {pr.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          pr.status === 'merged'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]'
                            : 'bg-sky-500/10 text-sky-400 border-sky-500/30 text-[10px]'
                        }
                      >
                        {pr.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Created {formatDate(pr.createdAt)}
                      {pr.mergedAt ? ` • Merged ${formatDate(pr.mergedAt)}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Commits */}
      {(activeSubTab === 'all' || activeSubTab === 'commits') && filteredCommits.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <GitCommitHorizontal className="size-3.5 text-cyan-400" />
            Commits ({filteredCommits.length})
          </h4>
          <div className="flex flex-col gap-2">
            {filteredCommits.map((commit) => (
              <div
                key={commit.sha}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400 font-mono text-xs">
                    <GitCommitHorizontal className="size-3.5" />
                  </span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="font-mono text-xs font-semibold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                        {commit.sha}
                      </code>
                      <span className="text-sm font-medium text-foreground truncate">
                        {commit.message}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {commit.author ? (
                        <span className="flex items-center gap-1">
                          <User className="size-3" />
                          {commit.author.name} (@{commit.author.username})
                        </span>
                      ) : null}
                      <span>•</span>
                      <span>{formatDate(commit.timestamp)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Issues */}
      {(activeSubTab === 'all' || activeSubTab === 'issues') && filteredIssues.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Tag className="size-3.5 text-rose-400" />
            Issues ({filteredIssues.length})
          </h4>
          <div className="flex flex-col gap-2">
            {filteredIssues.map((issue) => (
              <div
                key={issue.number}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-rose-500/10 text-rose-400">
                    <Tag className="size-3.5" />
                  </span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-rose-400">
                        #{issue.number}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate">
                        {issue.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          issue.status === 'open'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px]'
                            : 'bg-muted text-muted-foreground text-[10px]'
                        }
                      >
                        {issue.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Opened {formatDate(issue.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
