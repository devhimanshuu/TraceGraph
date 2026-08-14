/**
 * ImpactHistoryService — the impact analysis ledger.
 *
 * Snapshot history lives in CognoDB as `ImpactSnapshot` nodes tied to the
 * repository. Rules:
 *
 * - an unchanged re-run (same entity + depth + score + counts) refreshes the
 *   newest matching snapshot's timestamp instead of creating noise
 * - a meaningful change prepends a genuinely new snapshot
 * - the newest MAX_IMPACT_HISTORY snapshots per repository are retained
 * - the analyst is derived from the verified session claims (shared across
 *   devices and users — anyone on the repository sees the same ledger)
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { GraphNode, ImpactHistoryListResponse, ImpactSnapshot } from '@tracegraph/shared';
import { GraphRepository } from '../graph/graph.repository';
import {
  DEFAULT_IMPACT_HISTORY_LIMIT,
  MAX_IMPACT_HISTORY,
} from './impact-history.constants';
import {
  ImpactHistoryRepository,
  type ImpactSnapshotSignature,
} from './impact-history.repository';
import type { RecordImpactSnapshotDto } from './dto/record-impact-snapshot.dto';

/** Session claims shape attached by the auth guard. */
type SessionClaims = Record<string, unknown>;

function toAnalyst(user: unknown): ImpactSnapshot['analyzedBy'] {
  if (!user || typeof user !== 'object') return null;
  const claims = user as SessionClaims;
  // TraceGraph's own sessions attach { id, login, name, avatarUrl } (the
  // GitHub identity). `login` is the analyst's handle; the legacy fallbacks
  // keep older claim shapes working.
  const username = String(claims.login ?? claims.username ?? claims.sub ?? claims.userId ?? '');
  if (!username) return null;
  return { username, name: String(claims.name ?? '') };
}

@Injectable()
export class ImpactHistoryService {
  constructor(
    private readonly graphRepository: GraphRepository,
    private readonly repository: ImpactHistoryRepository,
  ) {}

  /** All snapshots for the repository, newest first. */
  async list(limit: number = DEFAULT_IMPACT_HISTORY_LIMIT): Promise<ImpactHistoryListResponse> {
    const repo = await this.requireRepository();
    const snapshots = await this.repository.list(repo.id, limit);
    return { repo: { id: repo.id, type: repo.type, label: repo.label }, snapshots };
  }

  /**
   * Records a completed analysis. Deduplicates an unchanged re-run, trims to
   * the retention cap, and returns the full updated ledger (newest first) so
   * the client can sync its state from one response.
   */
  async record(
    input: RecordImpactSnapshotDto,
    user: unknown,
  ): Promise<ImpactHistoryListResponse> {
    const repo = await this.requireRepository();
    const now = Date.now();
    const signature: ImpactSnapshotSignature = {
      nodeId: input.nodeId,
      depth: input.depth,
      score: input.score,
      direct: input.direct,
      indirect: input.indirect,
      tests: input.tests,
    };

    const existing = await this.repository.findBySignature(repo.id, signature);
    if (existing) {
      await this.repository.touch(existing.id, now);
    } else {
      const snapshot: ImpactSnapshot = {
        id: `impact-snapshot:${repo.id}:${randomUUID()}`,
        nodeId: input.nodeId,
        label: input.label,
        type: input.type,
        depth: input.depth,
        score: input.score,
        direct: input.direct,
        indirect: input.indirect,
        tests: input.tests,
        timestamp: now,
        repoId: repo.id,
        repoName: repo.label,
        analyzedBy: toAnalyst(user),
      };
      await this.repository.create(repo.id, snapshot);
    }

    await this.repository.trimTo(repo.id, MAX_IMPACT_HISTORY);
    const snapshots = await this.repository.list(repo.id, DEFAULT_IMPACT_HISTORY_LIMIT);
    return { repo: { id: repo.id, type: repo.type, label: repo.label }, snapshots };
  }

  /** Deletes every snapshot for the repository. */
  async clear(): Promise<{ deleted: number }> {
    const repo = await this.requireRepository();
    const deleted = await this.repository.clear(repo.id);
    return { deleted };
  }

  private async requireRepository(): Promise<GraphNode> {
    const repo = await this.graphRepository.findDefaultRepository();
    if (!repo) {
      throw new NotFoundException('No repository is available for impact history.');
    }
    return repo;
  }
}
