/**
 * Bounds for the Impact Analysis engine (Phase 9 §8, §19).
 *
 * The impact traversal is a bounded variable-length walk over inbound
 * dependency edges — the same class of traversal as Phase 5, with its own
 * caps so the small CognoDB free-tier instance is never exposed to an
 * unbounded fan-out. Values are enforced in the DTO (validation) and again in
 * the repository where structural Cypher interpolation happens.
 */

/** Traversal depth: 1..4, matching the graph module's hard ceiling. */
export const MAX_IMPACT_DEPTH = 4;
export const DEFAULT_IMPACT_DEPTH = 2;

/** Impacted-entity result bounds. */
export const MAX_IMPACT_LIMIT = 200;
export const DEFAULT_IMPACT_LIMIT = 100;

/** Raw graph evidence paths the repository may materialize. */
export const MAX_IMPACT_PATHS = 400;

/**
 * Impact relationship policy (Phase 9 §7): ONLY these inbound edges carry
 * impact in the dependency sense.
 *   - CALLS   — strong: a caller depends on the callee's behavior.
 *   - IMPORTS — strong: an importing file depends on the imported module.
 *   - EXTENDS — strong: a subclass depends on its superclass contract.
 * History edges (MODIFIES, AUTHORED_BY, RELATED_TO) and test edges (TESTS)
 * are deliberately NOT traversed as impact — they are collected as context
 * (tests + engineering history) instead, so a TESTS edge never shows up as a
 * direct dependency merely because its distance is 1 (Phase 9 §15).
 */
export const IMPACT_TRAVERSAL_TYPES = ['CALLS', 'IMPORTS', 'EXTENDS'] as const;

/** How many directly-affected entities contribute tests to the report. */
export const IMPACT_TEST_TARGETS = 10;
/** Per-entity test limit while collecting potentially affected tests. */
export const IMPACT_TESTS_PER_TARGET = 20;
/** Hard cap on the total test list in the response. */
export const MAX_IMPACT_TESTS = 50;

/**
 * Deterministic impact-score thresholds (Phase 9 §19) — an explainable
 * LOW / MEDIUM / HIGH indicator built from three graph facts:
 *
 *   dependents    0 → 0 · 1–2 → 1 · 3+ → 2
 *   depth coverage  ratio of the farthest impacted entity to the requested
 *                   depth: ≥ 2/3 → 2 · ≥ 1/3 → 1 · else 0
 *   test exposure 0 → 0 · 1–4 → 1 · 5+ → 2
 *
 * Total (0–6): ≥ 5 → HIGH · ≥ 3 → MEDIUM · else LOW. Every component maps to
 * a reason string returned alongside the score, so the indicator is fully
 * defensible from the graph evidence.
 */
export const SCORE_DEPENDENTS_LOW = 1;
export const SCORE_DEPENDENTS_HIGH = 3;
export const SCORE_TESTS_MEDIUM = 1;
export const SCORE_TESTS_HIGH = 5;
export const SCORE_MEDIUM = 3;
export const SCORE_HIGH = 5;
