/**
 * Turns the declarative dataset into parameterized Cypher (Phase 4 §27, §29).
 *
 * Rules enforced here:
 * - Every VALUE is passed as a query parameter (`$nodes`, `$rels`) — nothing
 *   is string-interpolated from data.
 * - Labels and relationship types ARE interpolated into the query text, but
 *   only from the fixed `NodeLabel`/`RelType` unions in `types.ts` — never
 *   from data. Cypher has no way to parameterize structure, and the whitelist
 *   makes interpolation safe.
 * - All writes go through `DatabaseService` (the Phase 3 abstraction) inside
 *   explicit transactions so each group is atomic and re-runnable.
 * - Idempotency comes from `MERGE` on stable ids + `SET n += props` (updates
 *   properties on re-seed instead of duplicating).
 */
import type { DatabaseTransaction } from '../../src/database';
import type { SeedNode, SeedRel } from './types';

const nodeCypher = (label: string): string => `
UNWIND $nodes AS props
MERGE (n:\`${label}\` {id: props.id})
SET n += props
`;

const relCypher = (fromLabel: string, toLabel: string, type: string): string => `
UNWIND $rels AS r
MATCH (a:\`${fromLabel}\` {id: r.from})
MATCH (b:\`${toLabel}\` {id: r.to})
MERGE (a)-[rel:\`${type}\`]->(b)
SET rel += r.props
`;

/** Inserts all nodes grouped by label; one query per label. */
export async function loadNodes(tx: DatabaseTransaction, nodes: SeedNode[]): Promise<void> {
  const byLabel = new Map<string, SeedNode[]>();
  for (const node of nodes) {
    const group = byLabel.get(node.label) ?? [];
    group.push(node);
    byLabel.set(node.label, group);
  }
  for (const [label, group] of byLabel) {
    await tx.run(nodeCypher(label), { nodes: group.map((n) => n.props) });
  }
}

/** Inserts all relationships grouped by (fromLabel, toLabel, type). */
export async function loadRels(tx: DatabaseTransaction, rels: SeedRel[]): Promise<void> {
  const byKey = new Map<string, SeedRel[]>();
  for (const rel of rels) {
    const key = `${rel.fromLabel}|${rel.toLabel}|${rel.type}`;
    const group = byKey.get(key) ?? [];
    group.push(rel);
    byKey.set(key, group);
  }
  for (const [key, group] of byKey) {
    const [fromLabel, toLabel, type] = key.split('|');
    await tx.run(relCypher(fromLabel, toLabel, type), {
      rels: group.map((r) => ({ from: r.from, to: r.to, props: r.props ?? {} })),
    });
  }
}
