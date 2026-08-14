/**
 * Bounds for the Intelligence module (orphans, smells, test gaps, blast
 * radius, knowledge). Same discipline as the graph/impact modules: every
 * traversal is bounded, every result capped, so the small CognoDB free-tier
 * instance is never exposed to an unbounded fan-out.
 */

/** Result caps for list endpoints. */
export const MAX_INTELLIGENCE_LIMIT = 100;
export const DEFAULT_INTELLIGENCE_LIMIT = 50;

/** Blast-radius traversal bounds (mirrors the impact engine). */
export const MAX_BLAST_DEPTH = 4;
export const DEFAULT_BLAST_DEPTH = 2;
export const MAX_BLAST_FILES = 100;
export const MAX_BLAST_PATHS = 400;

/** Per-entity test cap while collecting potentially affected tests. */
export const BLAST_TESTS_PER_TARGET = 20;
export const MAX_BLAST_TESTS = 50;

/** Cycle detection bounds (import/extends cycles). */
export const CYCLE_MIN_LENGTH = 2;
export const CYCLE_MAX_LENGTH = 6;
export const MAX_SMELL_CYCLES = 12;

/** How many god-modules / fragile entities to surface. */
export const SMELL_LIMIT = 8;

/** Knowledge-map bounds. */
export const MAX_KNOWLEDGE_LIMIT = 20;
export const DEFAULT_KNOWLEDGE_LIMIT = 10;

/**
 * Test-gap definition: a file whose functions have ZERO `TESTS` coverage.
 * `MIN_GAP_FUNCTIONS` avoids flagging near-empty files as coverage gaps.
 */
export const MIN_GAP_FUNCTIONS = 1;
