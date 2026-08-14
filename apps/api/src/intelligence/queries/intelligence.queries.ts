/**
 * Intelligence queries — deterministic, graph-driven repository
 * intelligence. Every query is anchored at the Repository node, bounded, and
 * parameterized (no string interpolation except the sanctioned label/type
 * whitelist patterns used elsewhere in the catalog).
 *
 * The collect-then-size pattern is used deliberately: OPTIONAL MATCH chains
 * cross-product rows, so counts are always computed from `collect(DISTINCT …)`
 * collapsed per entity, never from `count(x)` over the raw row set.
 */

/** Counts per property for the metrics used across intelligence queries. */

/**
 * Dead-code / orphan candidates: File / Class / Function entities with ZERO
 * inbound dependency signal. An entity's inbound signal is the union of:
 *   - direct edges into the node (IMPORTS into File, EXTENDS into Class)
 *   - CALLS into any function contained by the node (File→Function,
 *     File→Class→Function, Function→itself)
 * Calls WITHIN the entity's own containment count as usage — a private helper
 * called by its siblings is not dead code. This is computed in one CALLS pass
 * (a single repo-wide set of called function ids), then filtered per entity
 * with list membership — no per-entity scan, so the query stays fast on real
 * repositories.
 */
export const FIND_ORPHANS = `
MATCH (repo:Repository {id: $repoId})-[:CONTAINS*1..4]->(cf:File)-[:CONTAINS]->(caller:Function)-[:CALLS]->(fn:Function)
WITH collect(DISTINCT fn.id) AS calledFnIds
MATCH (repo:Repository {id: $repoId})-[:CONTAINS*1..4]->(n)
WHERE n:File OR n:Class OR n:Function
WITH n, labels(n)[0] AS nodeType, calledFnIds
OPTIONAL MATCH (n)-[:CONTAINS*0..2]->(m:Function)
WITH n, nodeType, calledFnIds, collect(DISTINCT m.id) AS memberIds
WITH n, nodeType, memberIds,
     [x IN memberIds WHERE x IN calledFnIds] AS calledMembers
OPTIONAL MATCH (a)-[r:IMPORTS|EXTENDS]->(n)
WITH n, nodeType, memberIds, size(calledMembers) AS calledCount,
     collect(DISTINCT a.id) AS directInIds
WITH n, nodeType, memberIds, calledCount + size(directInIds) AS incoming
WHERE incoming = 0
OPTIONAL MATCH (t:Test)-[:TESTS]->(n)
OPTIONAL MATCH (t2:Test)-[:TESTS]->(m2:Function)
WHERE m2.id IN memberIds
// memberIds must be carried through — WITH only forwards the listed variables.
WITH n, nodeType, memberIds, collect(DISTINCT t.id) AS tIds, collect(DISTINCT t2.id) AS t2Ids
OPTIONAL MATCH (c:Commit)-[:MODIFIES]->(n)
OPTIONAL MATCH (c2:Commit)-[:MODIFIES]->(m3:Function)
WHERE m3.id IN memberIds
RETURN properties(n) AS n, nodeType,
       size(tIds) + size(t2Ids) AS testCount,
       size([x IN collect(DISTINCT c.id) + collect(DISTINCT c2.id) WHERE x IS NOT NULL]) AS commitCount
ORDER BY commitCount DESC, n.name
LIMIT $limit
`;

/**
 * Circular import cycles among files: `a imports … imports a` of length
 * 2..6. Rows carry the cycle members in traversal order (start included once);
 * canonicalization (simple-cycle filter + sorted-id signature) happens in the
 * repository so rotations and mirrored walks collapse to one finding.
 */
export const FIND_FILE_IMPORT_CYCLES = `
MATCH p = (a:File)-[:IMPORTS*2..6]->(a)
RETURN [x IN nodes(p)[0..-1] | x.id] AS ids,
       [x IN nodes(p)[0..-1] | coalesce(x.name, x.path)] AS names,
       length(p) AS cycleLength
LIMIT $limit
`;

/** Circular inheritance cycles among classes (`a extends … extends a`). */
export const FIND_CLASS_EXTENDS_CYCLES = `
MATCH p = (a:Class)-[:EXTENDS*2..6]->(a)
RETURN [x IN nodes(p)[0..-1] | x.id] AS ids,
       [x IN nodes(p)[0..-1] | coalesce(x.name, x.path)] AS names,
       length(p) AS cycleLength
LIMIT $limit
`;

/**
 * God modules: classes with high fan-in × fan-out over CALLS, owner-resolved
 * the same way as the dependency explorer (class preferred, file fallback).
 * A class whose methods are called from many places AND call many targets
 * concentrates coupling — a change to it ripples widely and it is sensitive to
 * change everywhere else.
 */
export const FIND_GOD_MODULES = `
MATCH (repo:Repository {id: $repoId})-[:CONTAINS*1..4]->(f:File)-[:CONTAINS]->(c:Class)
OPTIONAL MATCH (f)-[:CONTAINS]->(fn:Function)<-[:CALLS]-(caller:Function)
OPTIONAL MATCH (callerFile:File)-[:CONTAINS]->(caller)
OPTIONAL MATCH (callerFile)-[:CONTAINS]->(ownerClass:Class)
WITH c, collect(DISTINCT coalesce(ownerClass.id, callerFile.id)) AS fanInIds
OPTIONAL MATCH (f2:File)-[:CONTAINS]->(c)
OPTIONAL MATCH (f2)-[:CONTAINS]->(fn2:Function)-[:CALLS]->(callee:Function)
OPTIONAL MATCH (calleeFile:File)-[:CONTAINS]->(callee)
OPTIONAL MATCH (calleeFile)-[:CONTAINS]->(ownerClass2:Class)
WITH c, fanInIds, collect(DISTINCT coalesce(ownerClass2.id, calleeFile.id)) AS fanOutIds
WITH c, [x IN fanInIds WHERE x IS NOT NULL] AS fanIn,
        [x IN fanOutIds WHERE x IS NOT NULL] AS fanOut
WHERE size(fanIn) > 0 AND size(fanOut) > 0
RETURN properties(c) AS n, labels(c)[0] AS nodeType,
       size(fanIn) AS fanIn, size(fanOut) AS fanOut,
       size(fanIn) * size(fanOut) AS score
ORDER BY score DESC, c.name
LIMIT $limit
`;

/**
 * Fragile entities: classes with high commit churn × many dependents. Churn
 * counts commits MODIFIES on the class's containing file; dependents counts
 * distinct caller owners. A class both frequently changed and widely depended
 * on is where a regression hurts most.
 */
export const FIND_FRAGILE_ENTITIES = `
MATCH (repo:Repository {id: $repoId})-[:CONTAINS*1..4]->(f:File)-[:CONTAINS]->(c:Class)
OPTIONAL MATCH (cm:Commit)-[:MODIFIES]->(f)
OPTIONAL MATCH (f)-[:CONTAINS]->(fn:Function)<-[:CALLS]-(caller:Function)
OPTIONAL MATCH (callerFile:File)-[:CONTAINS]->(caller)
OPTIONAL MATCH (callerFile)-[:CONTAINS]->(ownerClass:Class)
WITH c, collect(DISTINCT cm.id) AS commitIds,
        collect(DISTINCT coalesce(ownerClass.id, callerFile.id)) AS depIds
WITH c,
     [x IN commitIds WHERE x IS NOT NULL] AS commits,
     [x IN depIds WHERE x IS NOT NULL] AS dependents
WHERE size(commits) > 0 AND size(dependents) > 0
RETURN properties(c) AS n, labels(c)[0] AS nodeType,
       size(commits) AS commits, size(dependents) AS dependents,
       size(commits) * size(dependents) AS score
ORDER BY score DESC, c.name
LIMIT $limit
`;

/**
 * Test-coverage gaps: files with at least one function but ZERO tested
 * functions. Dependents (files importing them) and commit churn are returned
 * as severity context so the list reads "untested AND widely depended on".
 */
export const FIND_TEST_GAPS = `
MATCH (repo:Repository {id: $repoId})-[:CONTAINS*1..4]->(f:File)
OPTIONAL MATCH (f)-[:CONTAINS]->(fn:Function)
OPTIONAL MATCH (f)-[:CONTAINS]->(fn2:Function)<-[:TESTS]-(t:Test)
WITH f, count(DISTINCT fn) AS functionCount, count(DISTINCT fn2) AS testedFunctions
WHERE functionCount >= $minFunctions AND testedFunctions = 0
OPTIONAL MATCH (a:File)-[:IMPORTS]->(f)
OPTIONAL MATCH (cm:Commit)-[:MODIFIES]->(f)
RETURN properties(f) AS n, labels(f)[0] AS nodeType, functionCount AS untestedFunctions,
       size([x IN collect(DISTINCT a.id) WHERE x IS NOT NULL]) AS dependents,
       size([x IN collect(DISTINCT cm.id) WHERE x IS NOT NULL]) AS commits
ORDER BY dependents DESC, commits DESC, f.name
LIMIT $limit
`;

/** Tests covering any of a set of entities (ids resolved from a change). */
export const FIND_TESTS_FOR_ENTITY_IDS = `
MATCH (n)
WHERE n.id IN $ids
OPTIONAL MATCH (n)-[:CONTAINS*0..2]->(m:Function)
WITH n, collect(DISTINCT m.id) AS memberIds
MATCH (t:Test)-[:TESTS]->(fn:Function)
WHERE fn.id IN memberIds
RETURN properties(t) AS t, properties(fn) AS fn, n.id AS entityId
`;

/** Repo-wide authorship: developers ranked by commit count. */
export const FIND_REPO_KNOWLEDGE = `
MATCH (repo:Repository {id: $repoId})-[:CONTAINS*1..4]->(f:File)<-[:MODIFIES]-(c:Commit)
MATCH (c)-[:AUTHORED_BY]->(d:Developer)
RETURN properties(d) AS d, labels(d)[0] AS nodeType,
       count(DISTINCT c) AS commits, max(c.timestamp) AS lastCommit
ORDER BY commits DESC, d.username
LIMIT $limit
`;

/**
 * Entity-scoped authorship: developers whose commits touch the entity or its
 * containing file (classes and functions live in files in this schema).
 */
export const FIND_ENTITY_KNOWLEDGE = `
MATCH (n {id: $entityId})
OPTIONAL MATCH (f:File)-[:CONTAINS]->(n)
WITH coalesce(f.id, n.id) AS fileId
MATCH (c:Commit)-[:MODIFIES]->(file:File {id: fileId})
MATCH (c)-[:AUTHORED_BY]->(d:Developer)
RETURN properties(d) AS d, labels(d)[0] AS nodeType,
       count(DISTINCT c) AS commits, max(c.timestamp) AS lastCommit
ORDER BY commits DESC, d.username
LIMIT $limit
`;
