/**
 * Impact history bounds (Phase 10 — CognoDB-backed snapshots).
 *
 * Snapshot history is a lightweight, capped ledger: the newest
 * MAX_IMPACT_HISTORY snapshots per repository are kept, and the record
 * endpoint deduplicates an unchanged re-run (same entity + depth + score +
 * counts) by refreshing its timestamp instead of creating noise.
 */

/** The node label used for impact snapshot nodes in the graph. */
export const IMPACT_HISTORY_LABEL = 'ImpactSnapshot';

/** Relationship tying a snapshot to its repository. */
export const IMPACT_HISTORY_RELATIONSHIP = 'BELONGS_TO';

/** Maximum snapshots retained per repository. */
export const MAX_IMPACT_HISTORY = 50;

/** Default page size for `GET /api/impact-history`. */
export const DEFAULT_IMPACT_HISTORY_LIMIT = 50;

/** Upper bound for the list endpoint. */
export const MAX_IMPACT_HISTORY_LIMIT = 200;
