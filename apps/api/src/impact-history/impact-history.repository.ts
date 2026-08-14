/**
 * ImpactHistoryRepository — persists impact analysis snapshots as
 * `ImpactSnapshot` nodes tied to the repository via `BELONGS_TO`.
 *
 * The repository knows nothing about HTTP, sessions, or dedup policy — it
 * executes the parameterized Cypher and maps records to the shared DTO. All
 * dedup/retention decisions live in ImpactHistoryService.
 */
import { Injectable } from '@nestjs/common';
import type { GraphNode, ImpactScore, ImpactSnapshot } from '@tracegraph/shared';
import { DatabaseService } from '../database/database.service';
import { asProperties, toNumber } from '../graph/mappers';
import {
  CREATE_SNAPSHOT,
  DELETE_OLDEST_SNAPSHOTS,
  DELETE_SNAPSHOTS_FOR_REPO,
  FIND_SNAPSHOTS_FOR_REPO,
  FIND_SNAPSHOT_BY_SIGNATURE,
  TOUCH_SNAPSHOT,
} from './queries/impact-history.queries';

/** The exact analysis shape that identifies an unchanged re-run. */
export interface ImpactSnapshotSignature {
  nodeId: string;
  depth: number;
  score: ImpactScore;
  direct: number;
  indirect: number;
  tests: number;
}

interface SnapshotRow {
  s?: Record<string, unknown>;
  repo?: Record<string, unknown>;
}

function toSnapshot(row: SnapshotRow): ImpactSnapshot {
  const s = asProperties(row.s);
  const repo = asProperties(row.repo);
  return {
    id: String(s.id ?? ''),
    nodeId: String(s.nodeId ?? ''),
    label: String(s.label ?? ''),
    type: (s.type ?? 'Class') as ImpactSnapshot['type'],
    depth: toNumber(s.depth),
    score: (s.score ?? 'LOW') as ImpactScore,
    direct: toNumber(s.direct),
    indirect: toNumber(s.indirect),
    tests: toNumber(s.tests),
    timestamp: toNumber(s.timestamp),
    repoId: String(s.repoId ?? repo.id ?? ''),
    repoName: String(s.repoName ?? repo.name ?? ''),
    analyzedBy:
      typeof s.analyzedByUsername === 'string' && s.analyzedByUsername
        ? { username: s.analyzedByUsername, name: String(s.analyzedByName ?? '') }
        : null,
  };
}

@Injectable()
export class ImpactHistoryRepository {
  constructor(private readonly db: DatabaseService) {}

  /** The newest snapshot with an identical analysis signature, or null. */
  async findBySignature(repoId: string, signature: ImpactSnapshotSignature): Promise<ImpactSnapshot | null> {
    const rows = await this.db.executeRead<SnapshotRow[]>(
      (tx) =>
        tx.run<SnapshotRow>(FIND_SNAPSHOT_BY_SIGNATURE, {
          repoId,
          nodeId: signature.nodeId,
          depth: signature.depth,
          score: signature.score,
          direct: signature.direct,
          indirect: signature.indirect,
          tests: signature.tests,
        }),
      { name: 'impact-history-find-by-signature' },
    );
    return rows.length ? toSnapshot(rows[0]) : null;
  }

  /** All snapshots for a repository, newest first. */
  async list(repoId: string, limit: number): Promise<ImpactSnapshot[]> {
    const rows = await this.db.executeRead<SnapshotRow[]>(
      (tx) => tx.run<SnapshotRow>(FIND_SNAPSHOTS_FOR_REPO, { repoId, limit }),
      { name: 'impact-history-list' },
    );
    return rows.map(toSnapshot);
  }

  /** Creates a snapshot node and ties it to the repository. */
  async create(repoId: string, snapshot: ImpactSnapshot): Promise<ImpactSnapshot> {
    const rows = await this.db.executeWrite<SnapshotRow[]>(
      (tx) =>
        tx.run<SnapshotRow>(CREATE_SNAPSHOT, {
          repoId,
          repoName: snapshot.repoName,
          id: snapshot.id,
          nodeId: snapshot.nodeId,
          label: snapshot.label,
          type: snapshot.type,
          depth: snapshot.depth,
          score: snapshot.score,
          direct: snapshot.direct,
          indirect: snapshot.indirect,
          tests: snapshot.tests,
          timestamp: snapshot.timestamp,
          analyzedByUsername: snapshot.analyzedBy?.username ?? '',
          analyzedByName: snapshot.analyzedBy?.name ?? '',
        }),
      { name: 'impact-history-create' },
    );
    return rows.length ? toSnapshot(rows[0]) : snapshot;
  }

  /** Refreshes a snapshot's timestamp (unchanged re-run). */
  async touch(id: string, timestamp: number): Promise<ImpactSnapshot | null> {
    const rows = await this.db.executeWrite<SnapshotRow[]>(
      (tx) => tx.run<SnapshotRow>(TOUCH_SNAPSHOT, { id, timestamp }),
      { name: 'impact-history-touch' },
    );
    return rows.length ? toSnapshot(rows[0]) : null;
  }

  /** Deletes every snapshot belonging to the repository. */
  async clear(repoId: string): Promise<number> {
    const rows = await this.db.executeWrite<Array<{ deleted?: unknown }>>(
      (tx) => tx.run(DELETE_SNAPSHOTS_FOR_REPO, { repoId }),
      { name: 'impact-history-clear' },
    );
    return toNumber(rows[0]?.deleted);
  }

  /** Deletes the oldest snapshots beyond the retention cap. */
  async trimTo(repoId: string, keep: number): Promise<number> {
    const rows = await this.db.executeWrite<Array<{ deleted?: unknown }>>(
      (tx) => tx.run(DELETE_OLDEST_SNAPSHOTS, { repoId, keep }),
      { name: 'impact-history-trim' },
    );
    return toNumber(rows[0]?.deleted);
  }
}

export type { GraphNode };
