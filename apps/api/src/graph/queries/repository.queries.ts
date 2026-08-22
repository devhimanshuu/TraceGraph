/**
 * Repository-level intelligence queries.
 *
 * These anchor at the Repository node instead of a single file/class, so the
 * dashboard can summarize the whole codebase without N+1 per-entity calls.
 *
 *   (repo:Repository)-[:CONTAINS*1..4]->(f:File)   — every file in the repo
 *   (c:Commit)-[:MODIFIES]->(f)                    — commits touching those files
 *   (pr:PullRequest)-[:CONTAINS]->(c)              — PRs containing those commits
 *   (i:Issue)-[:RELATED_TO]->(pr)                  — issues related to those PRs
 *
 * The components query answers a genuinely graph-shaped question: which
 * classes are depended on most (ranked by distinct calling functions)?
 */

/** Recent commits across the whole repository, newest first. */
export const FIND_REPOSITORY_ACTIVITY_COMMITS = `
MATCH (repo:Repository {id: $id})-[:CONTAINS*1..4]->(f:File)<-[:MODIFIES]-(c:Commit)
WHERE ($since IS NULL OR c.timestamp >= $since)
OPTIONAL MATCH (c)-[:AUTHORED_BY]->(d:Developer)
RETURN DISTINCT properties(c) AS c, properties(d) AS d
ORDER BY c.timestamp DESC
LIMIT $limit
`;

/** Recent pull requests whose commits touched the repository, newest first. */
export const FIND_REPOSITORY_ACTIVITY_PULL_REQUESTS = `
MATCH (repo:Repository {id: $id})-[:CONTAINS*1..4]->(f:File)<-[:MODIFIES]-(c:Commit)
MATCH (pr:PullRequest)-[:CONTAINS]->(c)
WHERE ($since IS NULL OR coalesce(pr.mergedAt, pr.createdAt) >= $since)
RETURN DISTINCT properties(pr) AS pr
ORDER BY pr.number DESC
LIMIT $limit
`;

/** Recent issues related to those pull requests, newest first. */
export const FIND_REPOSITORY_ACTIVITY_ISSUES = `
MATCH (repo:Repository {id: $id})-[:CONTAINS*1..4]->(f:File)<-[:MODIFIES]-(c:Commit)
MATCH (pr:PullRequest)-[:CONTAINS]->(c)
MATCH (i:Issue)-[:RELATED_TO]->(pr)
WHERE ($since IS NULL OR i.createdAt >= $since)
RETURN DISTINCT properties(i) AS i
ORDER BY i.number DESC
LIMIT $limit
`;

/**
 * Core components: classes ranked by how many distinct functions call into
 * them. `count(DISTINCT caller)` is a lightweight popularity measure — the
 * classes a change to PaymentService would ripple into, read directly off the
 * CALLS graph. (INTENTIONALLY NOT a relational query.)
 */
export const FIND_REPOSITORY_COMPONENTS = `
MATCH (repo:Repository {id: $id})-[:CONTAINS*1..4]->(f:File)-[:CONTAINS]->(c:Class)
MATCH (f)-[:CONTAINS]->(fn:Function)<-[:CALLS]-(caller:Function)
WITH c, labels(c)[0] AS nodeType, collect(DISTINCT caller.name) AS callers, count(DISTINCT caller) AS dependents
RETURN properties(c) AS n, nodeType, dependents, callers[0..3] AS topCallers
ORDER BY dependents DESC, c.name
LIMIT $limit
`;

/**
 * Featured code entities for the dependency/impact explorers' quick-pick
 * cards: the most-connected files and classes/functions in the repository,
 * ranked by distinct inbound dependency edges (IMPORTS into files, CALLS /
 * EXTENDS into classes and functions). Files and code entities are scored
 * with the same unit (count of distinct dependents) so a single ranked list
 * can feed both card styles. Bounded by $limit — never unbounded.
 */
export const FIND_FEATURED_FILES = `
MATCH (repo:Repository {id: $id})-[:CONTAINS*1..4]->(f:File)
OPTIONAL MATCH (f)<-[:IMPORTS]-(importer)
WHERE (importer:File OR importer:Class OR importer:Function OR importer:Test)
WITH f, count(DISTINCT importer) AS dependents
WHERE dependents > 0
RETURN properties(f) AS n, labels(f)[0] AS nodeType, dependents
ORDER BY dependents DESC, f.name
LIMIT $limit
`;

export const FIND_FEATURED_CODE_ENTITIES = `
MATCH (repo:Repository {id: $id})-[:CONTAINS*1..4]->(f:File)-[:CONTAINS]->(n)
WHERE (n:Class OR n:Function)
OPTIONAL MATCH (n)<-[:CALLS|EXTENDS]-(dependent)
WHERE (dependent:Class OR dependent:Function)
WITH n, f, count(DISTINCT dependent) AS dependents
WHERE dependents > 0
RETURN properties(n) AS n, labels(n)[0] AS nodeType, dependents
ORDER BY dependents DESC, n.name
LIMIT $limit
`;

/**
 * Language distribution: file count + function + class counts grouped by
 * the `language` property on File nodes. Used by the sync status panel to
 * show the polyglot breakdown.
 */
export const FIND_LANGUAGE_DISTRIBUTION = `
MATCH (repo:Repository {id: $id})-[:CONTAINS*1..4]->(f:File)
WITH coalesce(f.language, 'Unknown') AS lang, f
OPTIONAL MATCH (f)-[:CONTAINS]->(fn:Function)
OPTIONAL MATCH (f)-[:CONTAINS]->(c:Class)
WITH lang, count(DISTINCT f) AS fileCount, count(DISTINCT fn) AS functionCount, count(DISTINCT c) AS classCount
RETURN lang AS language, fileCount, functionCount, classCount
ORDER BY fileCount DESC
`;

/** The active repository's full name and timestamps. */
export const FIND_REPOSITORY_TIMESTAMPS = `
MATCH (r:Repository)
WITH r
ORDER BY coalesce(r.active, false) DESC, r.createdAt
LIMIT 1
RETURN r.fullName AS fullName, r.updatedAt AS lastPushAt, r.createdAt AS createdAt
`;

