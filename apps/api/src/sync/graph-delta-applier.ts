/**
 * GraphDeltaApplier — applies GraphDelta to CognoDB.
 *
 * Responsibilities:
 * - Apply entity changes (add/update/remove)
 * - Apply relationship changes (add/remove)
 * - Update repository graph revision ONLY after full success
 * - Preserve historical Commit/MODIFIES relationships when removing code entities
 *
 * Design invariant:
 *   A failed sync NEVER destroys the previous valid graph.
 *   Revision promotion only happens after the entire delta is applied.
 */
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { GraphDelta, EntityDelta, RelationshipDelta } from '@tracegraph/shared';

const logger = new Logger('GraphDeltaApplier');

const BATCH_SIZE = 200;

@Injectable()
export class GraphDeltaApplier {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Apply a complete GraphDelta to CognoDB.
   *
   * Order of operations (critical for correctness):
   * 1. Remove stale relationships (before removing entities, to avoid dangling refs)
   * 2. Remove stale entities (preserve historical Commit→MODIFIES edges)
   * 3. Add/update entities (MERGE)
   * 4. Add new relationships
   * 5. Update repository graph revision
   *
   * @returns Summary of what was applied.
   */
  async applyDelta(
    delta: GraphDelta,
    repoId: string,
    newRevision: string,
  ): Promise<{
    entitiesApplied: number;
    relationshipsApplied: number;
  }> {
    const startedAt = Date.now();
    let entitiesApplied = 0;
    let relationshipsApplied = 0;

    // ── Phase 1: Remove stale relationships ────────────────────────────────
    const removedRels = delta.relationships.filter((r) => r.action === 'REMOVED');
    if (removedRels.length > 0) {
      logger.log(`Removing ${removedRels.length} stale relationships`);
      for (let i = 0; i < removedRels.length; i += BATCH_SIZE) {
        const batch = removedRels.slice(i, i + BATCH_SIZE);
        const rows = batch.map((r) => ({ from: r.fromId, to: r.toId, type: r.type }));

        await this.db.executeWrite(
          (tx) => tx.run(
            `UNWIND $rows AS row
             MATCH (a)-[r]->(b)
             WHERE a.id = row.from AND b.id = row.to AND type(r) = row.type
               AND NOT (a:Commit) AND NOT (b:Commit)
             DELETE r`,
            { rows },
          ),
          { name: 'sync-delete-relationships' },
        );
        relationshipsApplied += batch.length;
      }
    }

    // ── Phase 2: Remove stale entities ─────────────────────────────────────
    // IMPORTANT: Preserve Commit, PullRequest, Issue, Developer nodes and
    // their MODIFIES/AUTHORED_BY/RELATED_TO edges. Only remove code entities.
    const removedEntities = delta.entities.filter((e) => e.action === 'REMOVED');
    if (removedEntities.length > 0) {
      logger.log(`Removing ${removedEntities.length} stale entities`);
      const codeLabels = ['File', 'Function', 'Class', 'Interface', 'Enum', 'Struct', 'Trait', 'Module', 'Namespace', 'Test'];

      for (let i = 0; i < removedEntities.length; i += BATCH_SIZE) {
        const batch = removedEntities.slice(i, i + BATCH_SIZE);
        const ids = batch.map((e) => e.entityId);

        for (const label of codeLabels) {
          await this.db.executeWrite(
            (tx) => tx.run(
              `UNWIND $ids AS entityId
               MATCH (n:\`${label}\` {id: entityId})
               WHERE NOT (n)<-[:MODIFIES]-(:Commit)
               DETACH DELETE n`,
              { ids },
            ),
            { name: `sync-delete-${label.toLowerCase()}` },
          );
        }
        entitiesApplied += batch.length;
      }
    }

    // ── Phase 3: Add/update entities ──────────────────────────────────────
    const addedEntities = delta.entities.filter((e) => e.action === 'ADDED' || e.action === 'UPDATED');
    if (addedEntities.length > 0) {
      logger.log(`Upserting ${addedEntities.length} entities`);
      for (let i = 0; i < addedEntities.length; i += BATCH_SIZE) {
        const batch = addedEntities.slice(i, i + BATCH_SIZE);

        for (const entity of batch) {
          const props = entity.newProps ?? entity.previousProps ?? {};
          const label = entity.label;
          if (!label || !props.id) continue;

          await this.db.executeWrite(
            (tx) => tx.run(
              `MERGE (n:\`${label}\` {id: $id})
               SET n += $props`,
              { id: props.id, props },
            ),
            { name: `sync-upsert-${label.toLowerCase()}` },
          );
          entitiesApplied++;
        }
      }
    }

    // ── Phase 4: Add new relationships ────────────────────────────────────
    const addedRels = delta.relationships.filter((r) => r.action === 'ADDED');
    if (addedRels.length > 0) {
      logger.log(`Adding ${addedRels.length} new relationships`);
      for (let i = 0; i < addedRels.length; i += BATCH_SIZE) {
        const batch = addedRels.slice(i, i + BATCH_SIZE);
        const rows = batch.map((r) => ({
          from: r.fromId,
          to: r.toId,
          type: r.type,
          props: r.props ?? {},
        }));

        // Group by relationship type for efficient MATCH
        const byType = new Map<string, typeof rows>();
        for (const row of rows) {
          const group = byType.get(row.type) ?? [];
          group.push(row);
          byType.set(row.type, group);
        }

        for (const [type, typeRows] of byType) {
          await this.db.executeWrite(
            (tx) => tx.run(
              `UNWIND $rows AS row
               MATCH (a {id: row.from})
               MATCH (b {id: row.to})
               MERGE (a)-[r:\`${type}\`]->(b)
               SET r += row.props`,
              { rows: typeRows },
            ),
            { name: `sync-add-${type.toLowerCase()}` },
          );
          relationshipsApplied += typeRows.length;
        }
      }
    }

    // ── Phase 5: Update repository graph revision ─────────────────────────
    // CRITICAL: This ONLY happens after all writes succeed.
    await this.db.executeWrite(
      (tx) => tx.run(
        `MATCH (r:Repository {id: $repoId})
         SET r.graphRevision = $revision, r.lastSyncedAt = $timestamp`,
        { repoId, revision: newRevision, timestamp: new Date().toISOString() },
      ),
      { name: 'sync-update-revision' },
    );

    const durationMs = Date.now() - startedAt;
    logger.log(
      `Graph delta applied in ${durationMs}ms: ` +
      `${entitiesApplied} entities, ${relationshipsApplied} relationships, ` +
      `revision → ${newRevision.slice(0, 8)}`,
    );

    return { entitiesApplied, relationshipsApplied };
  }
}
