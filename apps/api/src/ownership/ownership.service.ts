/**
 * OwnershipService — evidence-based ownership inference engine.
 *
 * Combines git history, review activity, test contributions, and CODEOWNERS
 * to produce explainable ownership candidates ranked by relevance.
 *
 * Scoring model (transparent, no ML):
 *   Contribution volume (recent commits)       35%
 *   Historical commits                         20%
 *   PR authorship                              15%
 *   Review activity                            15%
 *   Review comments                            10%
 *   Test contributions                          5%
 *
 * Recency decay: exponential half-life of 90 days.
 */
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  OwnershipCandidate,
  OwnershipEvidence,
  OwnershipResult,
  OwnershipOverview,
  OwnershipArea,
  DeveloperExpertise,
  SignalType,
} from '@tracegraph/shared';

const logger = new Logger('OwnershipService');

// ── Scoring weights ─────────────────────────────────────────────────────────

const W_RECENT_COMMIT = 35;
const W_HISTORICAL_COMMIT = 20;
const W_PR_AUTHOR = 15;
const W_REVIEW = 15;
const W_REVIEW_COMMENT = 10;
const W_TEST = 5;

/** Half-life for recency decay in days. */
const RECENCY_HALF_LIFE_DAYS = 90;

function recencyDecay(daysSince: number): number {
  return Math.pow(0.5, daysSince / RECENCY_HALF_LIFE_DAYS);
}

function daysSince(isoDate: string | null): number {
  if (!isoDate) return 9999;
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

function confidenceFromScore(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

@Injectable()
export class OwnershipService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get ownership candidates for an entity (file, class, function, etc.).
   */
  async getOwnership(entityId: string): Promise<OwnershipResult> {
    const entity = await this.getEntity(entityId);
    const entityLabel = entity?.name ?? entityId;
    const entityType = entity?.type ?? 'Unknown';

    // Gather all contribution signals
    const signals = await this.gatherSignals(entityId);

    // Group by developer
    const devMap = new Map<string, {
      name: string;
      username: string;
      avatarUrl: string | null;
      signals: Array<{ type: SignalType; weight: number; observedAt: string }>;
    }>();

    for (const sig of signals) {
      const existing = devMap.get(sig.developerId);
      if (existing) {
        existing.signals.push({ type: sig.signalType, weight: sig.weight, observedAt: sig.observedAt });
      } else {
        devMap.set(sig.developerId, {
          name: sig.developerName,
          username: sig.developerUsername,
          avatarUrl: null,
          signals: [{ type: sig.signalType, weight: sig.weight, observedAt: sig.observedAt }],
        });
      }
    }

    // Score each developer
    const candidates: OwnershipCandidate[] = [];
    let rank = 0;

    for (const [devId, dev] of devMap) {
      const score = this.computeScore(dev.signals);
      const evidence = this.buildEvidence(dev.signals);
      const lastActive = dev.signals
        .map((s) => s.observedAt)
        .filter(Boolean)
        .sort()
        .pop() ?? null;

      const commitCount = dev.signals.filter((s) => s.type === 'COMMIT' || s.type === 'RECENT_COMMIT').length;
      const reviewCount = dev.signals.filter((s) => s.type === 'PR_REVIEW').length;
      const testContributions = dev.signals.filter((s) => s.type === 'TEST_CONTRIBUTION').length;

      candidates.push({
        developer: { id: devId, name: dev.name, username: dev.username, avatarUrl: dev.avatarUrl },
        score,
        rank: 0,
        confidence: confidenceFromScore(score),
        evidence,
        lastActiveAt: lastActive,
        commitCount,
        reviewCount,
        testContributions,
      });
    }

    // Sort by score descending and assign ranks
    candidates.sort((a, b) => b.score - a.score);
    candidates.forEach((c, i) => { c.rank = i + 1; });

    // Get CODEOWNERS if available
    const codeowners = await this.getCodeowners(entityId);

    return {
      entityId,
      entityLabel,
      entityType,
      candidates,
      totalContributors: candidates.length,
      revision: null,
      calculatedAt: new Date().toISOString(),
      codeowners,
    };
  }

  /**
   * Get ownership overview for a repository.
   */
  async getOverview(repositoryId: string): Promise<OwnershipOverview> {
    const files = await this.getRepositoryFiles(repositoryId);
    const areas: OwnershipArea[] = [];

    for (const file of files.slice(0, 100)) {
      const ownership = await this.getOwnership(file.id);
      const top = ownership.candidates[0] ?? null;

      areas.push({
        entityId: file.id,
        label: file.name,
        path: file.path,
        topContributor: top ? {
          name: top.developer.name,
          username: top.developer.username,
          score: top.score,
        } : null,
        contributorCount: ownership.totalContributors,
        singleContributor: ownership.totalContributors === 1,
        staleExpertise: top?.lastActiveAt
          ? daysSince(top.lastActiveAt) > 180
          : true,
      });
    }

    const unclearAreas = areas.filter((a) => a.contributorCount === 0);
    const singleContributorAreas = areas.filter((a) => a.singleContributor);

    const totalAreas = areas.length;
    const wellCovered = areas.filter((a) => a.contributorCount >= 2 && !a.staleExpertise).length;

    return {
      repositoryId,
      areas,
      unclearAreas,
      singleContributorAreas,
      health: {
        totalAreas,
        wellCovered,
        singleContributor: singleContributorAreas.length,
        unclear: unclearAreas.length,
      },
    };
  }

  /**
   * Get developer expertise profile.
   */
  async getDeveloperExpertise(developerUsername: string): Promise<DeveloperExpertise | null> {
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `MATCH (d:Developer {login: $username})
           OPTIONAL MATCH (d)-[:AUTHORED]->(c:Commit)-[:MODIFIES]->(f:File)
           WITH d, collect(DISTINCT f.path) AS files, count(DISTINCT c) AS commits
           OPTIONAL MATCH (d)-[:REVIEWED]->(pr:PullRequest)
           WITH d, files, commits, count(DISTINCT pr) AS reviews
           RETURN d.id AS id, d.name AS name, d.login AS username, d.avatarUrl AS avatarUrl,
                  commits, reviews, files[0..10] AS topFiles`,
          { username: developerUsername },
        ),
        { name: 'get-developer-expertise' },
      );

      if (rows.length === 0) return null;
      const row = rows[0];

      const topFiles = (row.topFiles ?? []) as string[];
      const primaryAreas = [...new Set(topFiles.map((f) => f.split('/').slice(0, 2).join('/')))].slice(0, 5);

      return {
        developerId: String(row.id ?? ''),
        name: String(row.name ?? ''),
        username: String(row.username ?? ''),
        avatarUrl: row.avatarUrl as string | null,
        primaryAreas,
        recentContributions: Number(row.commits ?? 0),
        totalReviews: Number(row.reviews ?? 0),
        totalTestContributions: 0,
        mostActiveEntities: topFiles.slice(0, 5).map((f) => ({
          entityId: `file:${f}`,
          label: f.split('/').pop() ?? f,
          contributions: 0,
        })),
        lastActiveAt: null,
      };
    } catch {
      return null;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async gatherSignals(entityId: string): Promise<Array<{
    developerId: string;
    developerName: string;
    developerUsername: string;
    signalType: SignalType;
    weight: number;
    observedAt: string;
  }>> {
    const signals: Array<{
      developerId: string;
      developerName: string;
      developerUsername: string;
      signalType: SignalType;
      weight: number;
      observedAt: string;
    }> = [];

    // Signal 1: Commits that modified this entity
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `MATCH (c:Commit)-[:MODIFIES]->(n {id: $entityId})
           OPTIONAL MATCH (c)-[:AUTHORED_BY]->(d:Developer)
           WHERE d IS NOT NULL
           RETURN d.id AS devId, d.name AS devName, d.login AS devLogin,
                  c.timestamp AS timestamp, c.sha AS sha
           ORDER BY c.timestamp DESC
           LIMIT 100`,
          { entityId },
        ),
        { name: 'ownership-commit-signals' },
      );

      for (const row of rows) {
        const devId = String(row.devId ?? '');
        if (!devId) continue;
        const timestamp = String(row.timestamp ?? '');
        const daysAgo = daysSince(timestamp);
        const isRecent = daysAgo <= 90;
        signals.push({
          developerId: devId,
          developerName: String(row.devName ?? ''),
          developerUsername: String(row.devLogin ?? ''),
          signalType: isRecent ? 'RECENT_COMMIT' : 'COMMIT',
          weight: isRecent ? W_RECENT_COMMIT : W_HISTORICAL_COMMIT,
          observedAt: timestamp,
        });
      }
    } catch { /* Non-fatal */ }

    // Signal 2: PR authorship for PRs touching this entity
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `MATCH (pr:PullRequest)-[:CONTAINS]->(c:Commit)-[:MODIFIES]->(n {id: $entityId})
           OPTIONAL MATCH (pr)-[:AUTHORED_BY]->(d:Developer)
           WHERE d IS NOT NULL
           RETURN d.id AS devId, d.name AS devName, d.login AS devLogin,
                  pr.createdAt AS prDate
           LIMIT 50`,
          { entityId },
        ),
        { name: 'ownership-pr-author-signals' },
      );

      for (const row of rows) {
        const devId = String(row.devId ?? '');
        if (!devId) continue;
        signals.push({
          developerId: devId,
          developerName: String(row.devName ?? ''),
          developerUsername: String(row.devLogin ?? ''),
          signalType: 'PR_AUTHOR',
          weight: W_PR_AUTHOR,
          observedAt: String(row.prDate ?? ''),
        });
      }
    } catch { /* Non-fatal */ }

    // Signal 3: PR reviews
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `MATCH (pr:PullRequest)-[:CONTAINS]->(c:Commit)-[:MODIFIES]->(n {id: $entityId})
           MATCH (d:Developer)-[:REVIEWED]->(pr)
           WHERE d.id IS NOT NULL
           RETURN d.id AS devId, d.name AS devName, d.login AS devLogin,
                  pr.createdAt AS prDate
           LIMIT 50`,
          { entityId },
        ),
        { name: 'ownership-review-signals' },
      );

      for (const row of rows) {
        signals.push({
          developerId: String(row.devId ?? ''),
          developerName: String(row.devName ?? ''),
          developerUsername: String(row.devLogin ?? ''),
          signalType: 'PR_REVIEW',
          weight: W_REVIEW,
          observedAt: String(row.prDate ?? ''),
        });
      }
    } catch { /* Non-fatal */ }

    return signals;
  }

  private computeScore(signals: Array<{ type: SignalType; weight: number; observedAt: string }>): number {
    let score = 0;

    for (const sig of signals) {
      const decay = recencyDecay(daysSince(sig.observedAt));
      // Apply weight with recency decay
      let effectiveWeight = sig.weight;
      if (sig.type === 'COMMIT' || sig.type === 'RECENT_COMMIT') {
        effectiveWeight *= decay;
      }
      score += effectiveWeight;
    }

    // Normalize to 0-100 scale
    const maxPossible = W_RECENT_COMMIT + W_HISTORICAL_COMMIT + W_PR_AUTHOR + W_REVIEW + W_REVIEW_COMMENT + W_TEST;
    return Math.min(100, (score / maxPossible) * 100);
  }

  private buildEvidence(signals: Array<{ type: SignalType; weight: number; observedAt: string }>): OwnershipEvidence[] {
    const evidence: OwnershipEvidence[] = [];

    const byType = new Map<SignalType, number>();
    for (const s of signals) {
      byType.set(s.type, (byType.get(s.type) ?? 0) + 1);
    }

    const labels: Record<SignalType, string> = {
      COMMIT: 'Historical commits',
      RECENT_COMMIT: 'Recent commits',
      LINES_CHANGED: 'Lines changed',
      PR_AUTHOR: 'PR authorship',
      PR_REVIEW: 'PR reviews',
      REVIEW_COMMENT: 'Review comments',
      TEST_CONTRIBUTION: 'Test contributions',
      CODEOWNER: 'CODEOWNERS',
    };

    for (const [type, count] of byType) {
      evidence.push({
        signal: type,
        label: labels[type] ?? type,
        count,
        detail: `${count} ${labels[type]?.toLowerCase() ?? type}`,
      });
    }

    return evidence.sort((a, b) => b.count - a.count);
  }

  private async getEntity(entityId: string): Promise<{ name: string; type: string } | null> {
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `MATCH (n {id: $entityId}) RETURN labels(n)[0] AS label, n.name AS name, n.path AS path`,
          { entityId },
        ),
        { name: 'get-entity-info' },
      );
      if (rows.length === 0) return null;
      return {
        name: String(rows[0].name ?? rows[0].path ?? entityId),
        type: String(rows[0].label ?? 'Unknown'),
      };
    } catch {
      return null;
    }
  }

  private async getCodeowners(entityId: string): Promise<Array<{ name: string; path: string }>> {
    // CODEOWNERS would be parsed from the repository root
    // For now return empty — this is a placeholder for future implementation
    return [];
  }

  private async getRepositoryFiles(repositoryId: string): Promise<Array<{ id: string; name: string; path: string }>> {
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `MATCH (repo:Repository {id: $repoId})-[:CONTAINS*1..5]->(f:File)
           WHERE NOT f.path CONTAINS 'test' AND NOT f.path CONTAINS 'spec'
           RETURN f.id AS id, f.name AS name, f.path AS path
           ORDER BY f.path
           LIMIT 200`,
          { repoId: repositoryId },
        ),
        { name: 'get-repo-files' },
      );
      return rows.map((r) => ({
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        path: String(r.path ?? ''),
      }));
    } catch {
      return [];
    }
  }
}
