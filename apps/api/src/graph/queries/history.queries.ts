/**
 * Engineering history queries.
 *
 * All three traverse the same File → Commit → PullRequest → Issue chain:
 *
 *   (f:File)-[:CONTAINS*0..3]->(entity)
 *   (c:Commit)-[:MODIFIES]->(f)
 *   (pr:PullRequest)-[:CONTAINS]->(c)
 *   (i:Issue)-[:RELATED_TO]->(pr)
 *
 * `CONTAINS*0..3` reaches the entity from its containing file whether the
 * entity is the file itself (*0), or a Class/Function inside it (*1..3).
 * This chain is a genuine multi-hop traversal — the history context version
 * of "what touches this component?". Nodes are projected with `properties()`.
 */

/** Commits that modified the entity's file, newest first. */
export const FIND_COMMITS_FOR_ENTITY = `
MATCH (f:File)-[:CONTAINS*0..3]->(n {id: $id})
MATCH (c:Commit)-[:MODIFIES]->(f)
OPTIONAL MATCH (c)-[:AUTHORED_BY]->(d:Developer)
RETURN DISTINCT properties(c) AS c, properties(d) AS d
ORDER BY c.timestamp DESC
LIMIT $limit
`;

/** Pull requests containing those commits, newest first. */
export const FIND_PULL_REQUESTS_FOR_ENTITY = `
MATCH (f:File)-[:CONTAINS*0..3]->(n {id: $id})
MATCH (c:Commit)-[:MODIFIES]->(f)
MATCH (pr:PullRequest)-[:CONTAINS]->(c)
RETURN DISTINCT properties(pr) AS pr
ORDER BY pr.number DESC
LIMIT $limit
`;

/** Issues related to those pull requests, newest first. */
export const FIND_ISSUES_FOR_ENTITY = `
MATCH (f:File)-[:CONTAINS*0..3]->(n {id: $id})
MATCH (c:Commit)-[:MODIFIES]->(f)
MATCH (pr:PullRequest)-[:CONTAINS]->(c)
MATCH (i:Issue)-[:RELATED_TO]->(pr)
RETURN DISTINCT properties(i) AS i
ORDER BY i.number DESC
LIMIT $limit
`;

// ── History counts — COUNT variants of the chain above, used by
// `GET /api/nodes/:id/relationship-summary` so the UI gets counts in one
// request. Counts mirror the list semantics (DISTINCT entities).

export const COUNT_COMMITS_FOR_ENTITY = `
MATCH (f:File)-[:CONTAINS*0..3]->(n {id: $id})
MATCH (c:Commit)-[:MODIFIES]->(f)
RETURN count(DISTINCT c) AS count
`;

export const COUNT_PULL_REQUESTS_FOR_ENTITY = `
MATCH (f:File)-[:CONTAINS*0..3]->(n {id: $id})
MATCH (c:Commit)-[:MODIFIES]->(f)
MATCH (pr:PullRequest)-[:CONTAINS]->(c)
RETURN count(DISTINCT pr) AS count
`;

export const COUNT_ISSUES_FOR_ENTITY = `
MATCH (f:File)-[:CONTAINS*0..3]->(n {id: $id})
MATCH (c:Commit)-[:MODIFIES]->(f)
MATCH (pr:PullRequest)-[:CONTAINS]->(c)
MATCH (i:Issue)-[:RELATED_TO]->(pr)
RETURN count(DISTINCT i) AS count
`;
