/**
 * TraceGraph deterministic seed (Phase 4).
 *
 * Usage:  npm run db:seed   (from apps/api or the repo root)
 *
 * Behavior:
 * - Idempotent: re-running never duplicates — nodes are MERGE'd on stable ids
 *   and properties are refreshed with `SET n += props`.
 * - Deterministic: the dataset is a pure function of `scripts/seed/dataset/*`.
 * - Transactional: each logical group (repo/dirs, files, symbols, tests,
 *   history, relationships) commits atomically; a failure rolls back that
 *   group, so the graph is never left half-written.
 * - Constraint-safe: uniqueness constraints are created with `IF NOT EXISTS`
 *   (named `tg_*`), so they are never duplicated or clashing with other
 *   domains that may share the instance.
 *
 * Clears nothing. Run `npm run db:clear` first for a clean rebuild.
 */
import { bootstrapDb } from './bootstrap';
import { CONSTRAINT_SPECS, constraintCreateCypher } from './seed/constraints';
import { buildDataset } from './seed/dataset';
import { loadNodes, loadRels } from './seed/loader';

/** Naive-but-correct pluralization for progress output (Class→Classes, Directory→Directories). */
const pluralize = (label: string, count: number): string => {
  if (count === 1) return label;
  if (label.endsWith('s')) return `${label}es`;
  if (label.endsWith('y')) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
};

/** Load order — parent containers before their contents. */
const NODE_ORDER = [
  'Repository',
  'Directory',
  'File',
  'Class',
  'Function',
  'Test',
  'Developer',
  'Commit',
  'PullRequest',
  'Issue',
] as const;

async function main(): Promise<void> {
  const { db, close } = await bootstrapDb();
  const dataset = buildDataset();

  console.log('TraceGraph database seeding\n');

  // 1. Constraints — idempotent (IF NOT EXISTS), named tg_*, never touches
  //    constraints belonging to other domains that may share the instance.
  await db.executeTransaction(
    async (tx) => {
      for (const spec of CONSTRAINT_SPECS) {
        await tx.run(constraintCreateCypher(spec));
      }
    },
    { name: 'seed-constraints' },
  );
  console.log(`✓ Constraints prepared (${CONSTRAINT_SPECS.length} unique-id constraints)`);

  // 2. Nodes — one atomic transaction per label group.
  for (const label of NODE_ORDER) {
    const nodes = dataset.nodes.filter((n) => n.label === label);
    if (nodes.length === 0) continue;
    await db.executeTransaction(
      async (tx) => {
        await loadNodes(tx, nodes);
      },
      { name: `seed-${label.toLowerCase()}` },
    );
    console.log(`✓ ${nodes.length} ${pluralize(label, nodes.length)} created`);
  }

  // 3. Relationships — one atomic transaction per (fromLabel, type, toLabel).
  const relGroups = new Map<string, typeof dataset.rels>();
  for (const rel of dataset.rels) {
    const key = `${rel.fromLabel}->${rel.type}->${rel.toLabel}`;
    const group = relGroups.get(key) ?? [];
    group.push(rel);
    relGroups.set(key, group);
  }
  for (const [key, rels] of relGroups) {
    await db.executeTransaction(
      async (tx) => {
        await loadRels(tx, rels);
      },
      { name: `seed-rels-${key.replace(/\W+/g, '_')}` },
    );
    console.log(`✓ ${rels.length} ${key} relationship${rels.length === 1 ? '' : 's'} created`);
  }

  const totalNodes = dataset.nodes.length;
  const totalRels = dataset.rels.length;
  console.log(`\n✓ ${totalNodes} nodes / ${totalRels} relationships total`);
  console.log('\nSeed completed successfully.');
  await close();
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
