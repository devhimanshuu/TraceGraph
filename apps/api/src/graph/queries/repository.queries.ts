/**
 * Repository-level intelligence queries (Phase 6 §8, §13, §14).
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
OPTIONAL MATCH (c)-[:AUTHORED_BY]->(d:Developer)
RETURN DISTINCT properties(c) AS c, properties(d) AS d
ORDER BY c.timestamp DESC
LIMIT $limit
`;

/** Recent pull requests whose commits touched the repository, newest first. */
export const FIND_REPOSITORY_ACTIVITY_PULL_REQUESTS = `
MATCH (repo:Repository {id: $id})-[:CONTAINS*1..4]->(f:File)<-[:MODIFIES]-(c:Commit)
MATCH (pr:PullRequest)-[:CONTAINS]->(c)
RETURN DISTINCT properties(pr) AS pr
ORDER BY pr.number DESC
LIMIT $limit
`;

/** Recent issues related to those pull requests, newest first. */
export const FIND_REPOSITORY_ACTIVITY_ISSUES = `
MATCH (repo:Repository {id: $id})-[:CONTAINS*1..4]->(f:File)<-[:MODIFIES]-(c:Commit)
MATCH (pr:PullRequest)-[:CONTAINS]->(c)
MATCH (i:Issue)-[:RELATED_TO]->(pr)
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
RETURN properties(c) AS n, labels(c)[0] AS nodeType, count(DISTINCT caller) AS dependents
ORDER BY dependents DESC, c.name
LIMIT $limit
`;
