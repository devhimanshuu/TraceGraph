/**
 * TraceGraph database clear (Phase 4 §21).
 *
 * Usage:  npm run db:clear   (from apps/api or the repo root)
 *
 * Safety strategy — LABEL-SCOPED, never a full-graph reset:
 * The CognoDB instance may be shared with other domains (it is a hosted,
 * assessment-provided instance). This script therefore:
 *   1. DETACH DELETEs nodes carrying ONLY the 10 TraceGraph labels
 *      (Repository, Directory, File, Function, Class, Test, Commit,
 *      PullRequest, Issue, Developer), and
 *   2. Drops the named `tg_*` uniqueness constraints created by the seed.
 * It never touches nodes with other labels, other constraints, or a global
 * `MATCH (n) DETACH DELETE n`.
 *
 * The clear is transactional per label group; a failure rolls back that group.
 */
import { bootstrapDb } from './bootstrap';
import { CONSTRAINT_SPECS, constraintDropCypher } from './seed/constraints';

const LABELS = [
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

  console.log('TraceGraph database clear\n');

  // 1. Drop TraceGraph constraints (by name; IF EXISTS → safe on first run).
  await db.executeTransaction(
    async (tx) => {
      for (const spec of CONSTRAINT_SPECS) {
        await tx.run(constraintDropCypher(spec));
      }
    },
    { name: 'clear-constraints' },
  );
  console.log(`✓ TraceGraph constraints dropped (${CONSTRAINT_SPECS.length})`);

  // 2. Delete TraceGraph-labeled nodes (with their relationships).
  let deleted = 0;
  for (const label of LABELS) {
    await db.executeTransaction(
      async (tx) => {
        const rows = await tx.run<{ c: unknown }>(
          `MATCH (n:\`${label}\`) DETACH DELETE n RETURN count(n) AS c`,
        );
        deleted += Number(
          (rows[0]?.c as { toNumber?: () => number })?.toNumber?.() ?? rows[0]?.c ?? 0,
        );
      },
      { name: `clear-${label.toLowerCase()}` },
    );
  }
  console.log(`✓ Removed ${deleted} TraceGraph nodes (${LABELS.length} labels)`);
  console.log('\nClear completed. Other domains/labels in the instance were not touched.');
  await close();
}

main().catch((err) => {
  console.error('Clear failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
