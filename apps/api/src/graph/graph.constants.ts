/**
 * Bounds for the graph API (Phase 5 §16, §29).
 *
 * Every bound exists to protect the small CognoDB free-tier instance: the API
 * never exposes unbounded traversal or unlimited result sets. These values are
 * enforced in the DTOs (validation) and again in the service/repository where
 * structural Cypher interpolation happens.
 */

/** Variable-length traversal depth: 1..4. 4 is a hard ceiling. */
export const MAX_TRAVERSAL_DEPTH = 4;
export const DEFAULT_TRAVERSAL_DEPTH = 2;

/** Evidence paths returned by the traversal endpoint. */
export const MAX_TRAVERSAL_PATHS = 250;
export const DEFAULT_TRAVERSAL_PATHS = 100;

/** Relationship types traversable by the dependency/traversal endpoints. */
export const TRAVERSAL_TYPES = ['CALLS', 'IMPORTS', 'EXTENDS'] as const;

/**
 * Relationship types shown by the graph neighborhood endpoint by default.
 * History edges (MODIFIES, AUTHORED_BY, RELATED_TO, PR-CONTAINS-Commit) are
 * deliberately excluded from the default view — they belong to the history
 * surface, not the code-structure view.
 */
export const GRAPH_RELATIONSHIP_TYPES = [
  'CONTAINS',
  'IMPORTS',
  'CALLS',
  'EXTENDS',
  'TESTS',
] as const;

/** Node label whitelist — the 10 TraceGraph labels (Phase 4). */
export const GRAPH_NODE_TYPES = [
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
] as const;

/** Graph neighborhood result bounds. */
export const MAX_GRAPH_NODES = 500;
export const DEFAULT_GRAPH_NODES = 200;

/** Node relationships / dependencies result bounds. */
export const MAX_RELATIONSHIP_LIMIT = 200;
export const DEFAULT_RELATIONSHIP_LIMIT = 100;

/** History (commits/PRs/issues) result bounds. */
export const MAX_HISTORY_LIMIT = 100;
export const DEFAULT_HISTORY_LIMIT = 50;

/** Search result bounds. */
export const MAX_SEARCH_LIMIT = 50;
export const DEFAULT_SEARCH_LIMIT = 20;
