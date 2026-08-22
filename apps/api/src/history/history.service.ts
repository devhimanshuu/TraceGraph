import { Injectable } from '@nestjs/common';
import type {
  HistoryCommit,
  HistoryIssue,
  HistoryPullRequest,
  Contributor,
  ChangeFrequency,
  ChangeContext,
  HistoryTimelineEntry,
  ChangeHeatmapEntry,
} from '@tracegraph/shared';
import { DatabaseService } from '../database/database.service';
import { GraphRepository } from '../graph/graph.repository';
import { GraphService } from '../graph/graph.service';

/**
 * HistoryService — engineering context for an entity.
 *
 * Traverses the File → Commit → PullRequest → Issue chain for whatever the
 * entity is contained by. The existence gate (404 for unknown nodes) is
 * delegated to GraphService so semantics stay consistent across modules.
 */
@Injectable()
export class HistoryService {
  constructor(
    private readonly graphRepository: GraphRepository,
    private readonly graphService: GraphService,
    private readonly db: DatabaseService,
  ) {}

  async getCommits(id: string, limit: number): Promise<HistoryCommit[]> {
    await this.graphService.getNode(id);
    return this.graphRepository.findCommits(id, limit);
  }

  async getPullRequests(id: string, limit: number): Promise<HistoryPullRequest[]> {
    await this.graphService.getNode(id);
    return this.graphRepository.findPullRequests(id, limit);
  }

  async getIssues(id: string, limit: number): Promise<HistoryIssue[]> {
    await this.graphService.getNode(id);
    return this.graphRepository.findIssues(id, limit);
  }

  // ── Phase 16: Rich Engineering History ──────────────────────────────────

  private toNum(v: unknown): number {
    if (v && typeof v === 'object' && 'low' in v) {
      return (v as { low: number; high: number }).low + ((v as { low: number; high: number }).high || 0) * 0x100000000;
    }
    if (v && typeof v === 'object' && 'toNumber' in v) {
      return (v as { toNumber: () => number }).toNumber();
    }
    return Number(v ?? 0);
  }

  async getFileHistory(entityId: string, limit = 20): Promise<{ timeline: HistoryTimelineEntry[]; total: number; hasMore: boolean }> {
    const rows = await this.db.executeRead<Array<{ c?: Record<string, unknown>; pr?: Record<string, unknown> | null; d?: Record<string, unknown> | null }>>(
      (tx) => tx.run(
        `MATCH (c:Commit)-[:MODIFIES]->(f {id: $entityId}) OPTIONAL MATCH (pr:PullRequest)-[:CONTAINS]->(c) OPTIONAL MATCH (c)-[:AUTHORED_BY]->(d:Developer) RETURN c, pr, d ORDER BY c.timestamp DESC LIMIT $limit`,
        { entityId, limit: limit + 1 },
      ),
      { name: 'file-history' },
    );
    const timeline: HistoryTimelineEntry[] = rows.map((row) => {
      const commit = row.c as Record<string, unknown> | undefined;
      if (!commit) return null;
      const pr = row.pr as Record<string, unknown> | undefined;
      const dev = row.d as Record<string, unknown> | undefined;
      return { type: 'commit' as const, timestamp: String(commit.timestamp ?? ''), title: String(commit.message ?? '').slice(0, 100),
        relatedIds: [`commit:${commit.sha}`, ...(pr ? [`pr:${pr.number}`] : [])],
        metadata: { sha: String(commit.sha ?? ''), message: String(commit.message ?? ''), author: String(dev?.login ?? commit.author ?? 'unknown'), prNumber: pr?.number ?? null, prTitle: pr?.title ?? null } };
    }).filter(Boolean) as HistoryTimelineEntry[];
    const countRows = await this.db.executeRead<Array<{ count?: unknown }>>(
      (tx) => tx.run(`MATCH (c:Commit)-[:MODIFIES]->(f {id: $entityId}) RETURN count(c) AS count`, { entityId }),
      { name: 'file-history-count' },
    );
    return { timeline: timeline.slice(0, limit), total: this.toNum(countRows[0]?.count), hasMore: timeline.length > limit };
  }

  async getContributors(entityId: string, limit = 20): Promise<{ contributors: Contributor[]; total: number }> {
    const rows = await this.db.executeRead<Array<{ d?: Record<string, unknown>; commitCount?: unknown; lastCommitAt?: string }>>(
      (tx) => tx.run(
        `MATCH (c:Commit)-[:MODIFIES]->(f {id: $entityId}) MATCH (c)-[:AUTHORED_BY]->(d:Developer) WITH d, count(c) AS commitCount, max(c.timestamp) AS lastCommitAt ORDER BY commitCount DESC LIMIT $limit RETURN d, commitCount, lastCommitAt`,
        { entityId, limit },
      ),
      { name: 'file-contributors' },
    );
    const contributors: Contributor[] = rows.map((row) => {
      const dev = row.d as Record<string, unknown> | undefined;
      return { username: String(dev?.login ?? dev?.username ?? 'unknown'), name: String(dev?.name ?? dev?.login ?? 'unknown'), commitCount: this.toNum(row.commitCount), lastCommitAt: row.lastCommitAt ?? null, filesChanged: [] };
    });
    return { contributors, total: contributors.length };
  }

  async getChangeFrequency(entityId: string): Promise<ChangeFrequency> {
    const now = Date.now();
    const d7 = new Date(now - 7 * 86400000).toISOString();
    const d30 = new Date(now - 30 * 86400000).toISOString();
    const d90 = new Date(now - 90 * 86400000).toISOString();
    const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
      (tx) => tx.run(
        `MATCH (c:Commit)-[:MODIFIES]->(f {id: $entityId}) RETURN $entityId AS entityId, count(c) AS total, max(c.timestamp) AS lastChangedAt, count(CASE WHEN c.timestamp >= $d7 THEN 1 END) AS d7, count(CASE WHEN c.timestamp >= $d30 THEN 1 END) AS d30, count(CASE WHEN c.timestamp >= $d90 THEN 1 END) AS d90`,
        { entityId, d7, d30, d90 },
      ),
      { name: 'change-frequency' },
    );
    const row = rows[0];
    const contribRows = await this.db.executeRead<Array<{ login?: string; count?: unknown }>>(
      (tx) => tx.run(`MATCH (c:Commit)-[:MODIFIES]->(f {id: $entityId}) MATCH (c)-[:AUTHORED_BY]->(d:Developer) RETURN d.login AS login, count(c) AS count ORDER BY count DESC LIMIT 5`, { entityId }),
      { name: 'top-contributors' },
    );
    return { path: String(row?.entityId ?? entityId), totalChanges: this.toNum(row?.total), lastChangedAt: String(row?.lastChangedAt ?? ''),
      changesLast7Days: this.toNum(row?.d7), changesLast30Days: this.toNum(row?.d30), changesLast90Days: this.toNum(row?.d90),
      topContributors: contribRows.map((r) => ({ username: String(r.login ?? 'unknown'), count: this.toNum(r.count) })) };
  }

  async getChangeContext(entityId: string): Promise<ChangeContext> {
    const rows = await this.db.executeRead<Array<{ c?: Record<string, unknown>; pr?: Record<string, unknown> | null; issue?: Record<string, unknown> | null; d?: Record<string, unknown> | null }>>(
      (tx) => tx.run(
        `MATCH (c:Commit)-[:MODIFIES]->(f {id: $entityId}) OPTIONAL MATCH (pr:PullRequest)-[:CONTAINS]->(c) OPTIONAL MATCH (pr)-[:RELATED_TO]->(issue:Issue) OPTIONAL MATCH (c)-[:AUTHORED_BY]->(d:Developer) RETURN c, pr, issue, d ORDER BY c.timestamp DESC LIMIT 1`,
        { entityId },
      ),
      { name: 'change-context' },
    );
    const row = rows[0];
    const commit = row?.c as Record<string, unknown> | undefined;
    const pr = row?.pr as Record<string, unknown> | undefined;
    const issue = row?.issue as Record<string, unknown> | undefined;
    const dev = row?.d as Record<string, unknown> | undefined;
    const countRows = await this.db.executeRead<Array<{ count?: unknown }>>(
      (tx) => tx.run(`MATCH (c:Commit)-[:MODIFIES]->(f {id: $entityId}) RETURN count(c) AS count`, { entityId }),
      { name: 'change-count' },
    );
    const contribRows = await this.db.executeRead<Array<{ login?: string; count?: unknown }>>(
      (tx) => tx.run(`MATCH (c:Commit)-[:MODIFIES]->(f {id: $entityId}) MATCH (c)-[:AUTHORED_BY]->(d:Developer) RETURN d.login AS login, count(c) AS count ORDER BY count DESC LIMIT 5`, { entityId }),
      { name: 'recent-contributors' },
    );
    const lastRows = await this.db.executeRead<Array<{ ts?: string }>>(
      (tx) => tx.run(`MATCH (c:Commit)-[:MODIFIES]->(f {id: $entityId}) RETURN max(c.timestamp) AS ts`, { entityId }),
      { name: 'last-changed' },
    );
    return {
      entity: { id: entityId, label: entityId.startsWith('file:') ? 'File' : 'Function', path: entityId.replace(/^(file:|fn:)/, '') },
      mostRecentChange: commit ? { commitSha: String(commit.sha ?? ''), commitMessage: String(commit.message ?? ''), commitTimestamp: String(commit.timestamp ?? ''), author: String(dev?.login ?? commit.author ?? 'unknown'),
        prNumber: pr?.number ? Number(pr.number) : null, prTitle: pr?.title ? String(pr.title) : null, issueNumber: issue?.number ? Number(issue.number) : null, issueTitle: issue?.title ? String(issue.title) : null } : null,
      totalChanges: this.toNum(countRows[0]?.count),
      recentContributors: contribRows.map((r) => ({ username: String(r.login ?? 'unknown'), commitCount: this.toNum(r.count) })),
      lastChangedAt: lastRows[0]?.ts ?? null,
    };
  }

  async getChangeHeatmap(repoId: string, limit = 30): Promise<{ entries: ChangeHeatmapEntry[]; totalFiles: number; maxChanges: number }> {
    const rows = await this.db.executeRead<Array<{ f?: Record<string, unknown>; count?: unknown }>>(
      (tx) => tx.run(
        `MATCH (c:Commit)-[:MODIFIES]->(f:File) WHERE (f)-[:CONTAINS*1..5]-(:Repository {id: $repoId}) OR (f)<-[:CONTAINS*1..5]-(:Repository {id: $repoId}) WITH f, count(c) AS changeCount ORDER BY changeCount DESC LIMIT $limit RETURN f, changeCount`,
        { repoId, limit },
      ),
      { name: 'change-heatmap' },
    );
    const entries: ChangeHeatmapEntry[] = rows.map((row) => {
      const file = row.f as Record<string, unknown> | undefined;
      return { path: String(file?.path ?? ''), label: String(file?.name ?? file?.path ?? ''), changeCount: this.toNum(row.count), normalizedIntensity: 0 };
    });
    const maxChanges = entries.length > 0 ? entries[0].changeCount : 0;
    for (const entry of entries) entry.normalizedIntensity = maxChanges > 0 ? entry.changeCount / maxChanges : 0;
    return { entries, totalFiles: entries.length, maxChanges };
  }

}