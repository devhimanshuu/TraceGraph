/**
 * Uniqueness constraints for stable node ids (Phase 4 §8, §28).
 *
 * Dialect notes (verified against the live CognoDB instance):
 * - `CREATE CONSTRAINT name IF NOT EXISTS FOR (n:Label) REQUIRE n.id IS UNIQUE`
 *   is supported and idempotent — safe to run on every seed.
 * - The legacy `ASSERT` form and drop-by-schema are NOT supported, so:
 *   - constraints are always created with an explicit `tg_` name,
 *   - `clear` drops them by name with `IF EXISTS`.
 * - `SHOW CONSTRAINTS` returns no rows on CognoDB, so we never enumerate
 *   existing constraints; named `tg_*` constraints keep us self-contained and
 *   never touch constraints belonging to other domains that may share the
 *   instance.
 */

import type { NodeLabel } from './types';

export interface ConstraintSpec {
  name: string;
  label: NodeLabel;
}

const LABELS: NodeLabel[] = [
  'Repository',
  'Directory',
  'File',
  'Function',
  'Class',
  'Test',
  'Commit',
  'PullRequest',
  'Issue',
  'Developer',
];

export const CONSTRAINT_SPECS: ConstraintSpec[] = LABELS.map((label) => ({
  name: `tg_${label.toLowerCase()}_id`,
  label,
}));

export const constraintCreateCypher = (spec: ConstraintSpec): string =>
  `CREATE CONSTRAINT ${spec.name} IF NOT EXISTS FOR (n:\`${spec.label}\`) REQUIRE n.id IS UNIQUE`;

export const constraintDropCypher = (spec: ConstraintSpec): string =>
  `DROP CONSTRAINT ${spec.name} IF EXISTS`;
