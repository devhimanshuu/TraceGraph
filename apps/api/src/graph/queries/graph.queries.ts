/**
 * Repository-level queries.
 *
 * Counts are LABEL-SCOPED: the hosted CognoDB instance may be shared with
 * other domains, so overview statistics and search never touch nodes with
 * non-TraceGraph labels.
 */

/**
 * The active repository (the one the user last imported / switched to),
 * falling back to the oldest one when nothing is marked active yet.
 * Used as the default graph root and repository overview anchor.
 */
export const FIND_DEFAULT_REPOSITORY = `
MATCH (r:Repository)
WITH r
ORDER BY coalesce(r.active, false) DESC, r.createdAt
LIMIT 1
RETURN properties(r) AS n, labels(r)[0] AS nodeType
`;

/** All repositories in the graph, oldest first — for the repo switcher. */
export const FIND_ALL_REPOSITORIES = `
MATCH (r:Repository)
RETURN properties(r) AS n, labels(r)[0] AS nodeType
ORDER BY r.createdAt
`;

/** Marks one repository active and every other one inactive (single write). */
export const SET_ACTIVE_REPOSITORY = `
MATCH (r:Repository)
SET r.active = (r.id = $repoId)
`;

/**
 * Marks the given repository active after an import and every other one
 * inactive — the same atomic semantics as SET_ACTIVE_REPOSITORY. Without the
 * "deactivate others" half, two repositories end up active and
 * FIND_DEFAULT_REPOSITORY (oldest active wins) keeps surfacing the previous
 * repo instead of the freshly imported one.
 */
export const MARK_REPOSITORY_ACTIVE = `
MATCH (r:Repository)
SET r.active = (r.id = $repoId)
`;

/**
 * Node count for one TraceGraph label. `label` is interpolated from the fixed
 * 10-label whitelist in graph.constants (labels cannot be parameterized).
 */
export const countNodesByLabel = (label: string): string => `
MATCH (n:\`${label}\`)
RETURN count(n) AS count
`;

/** Total relationships whose BOTH endpoints carry a TraceGraph label. */
export const COUNT_TRACEGRAPH_RELATIONSHIPS = `
MATCH (a)-[r]->(b)
WHERE any(l IN labels(a) WHERE l IN $labels)
  AND any(l IN labels(b) WHERE l IN $labels)
RETURN count(r) AS count
`;

/** Deterministic substring search across the 10 TraceGraph labels. */
export const SEARCH_NODES = `
MATCH (n)
WHERE (n:File OR n:Function OR n:Class OR n:Test OR n:Repository OR n:Directory
       OR n:Commit OR n:PullRequest OR n:Issue OR n:Developer)
  AND toLower(coalesce(n.name, n.title, n.sha, n.username, n.message, '')) CONTAINS toLower($q)
RETURN properties(n) AS n, labels(n)[0] AS nodeType
ORDER BY n.name
LIMIT $limit
`;
