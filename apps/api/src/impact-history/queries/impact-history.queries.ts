/**
 * Impact-history Cypher (Phase 10). All queries are parameterized and anchor
 * at the repository node — snapshot nodes live under `(s:ImpactSnapshot)
 * -[:BELONGS_TO]-> (repo:Repository)` so history is scoped to the repository
 * and shared across every device/user with access to it.
 */

/** The newest snapshot matching an exact analysis signature, if any. */
export const FIND_SNAPSHOT_BY_SIGNATURE = `
MATCH (repo:Repository {id: $repoId})<-[:BELONGS_TO]-(s:ImpactSnapshot)
WHERE s.nodeId = $nodeId
  AND s.depth = $depth
  AND s.score = $score
  AND s.direct = $direct
  AND s.indirect = $indirect
  AND s.tests = $tests
RETURN properties(s) AS s
ORDER BY s.timestamp DESC
LIMIT 1
`;

/** Snapshot list for a repository, newest first. */
export const FIND_SNAPSHOTS_FOR_REPO = `
MATCH (repo:Repository {id: $repoId})<-[:BELONGS_TO]-(s:ImpactSnapshot)
RETURN properties(s) AS s, properties(repo) AS repo
ORDER BY s.timestamp DESC
LIMIT $limit
`;

/** Creates a snapshot node and ties it to the repository. */
export const CREATE_SNAPSHOT = `
MATCH (repo:Repository {id: $repoId})
CREATE (s:ImpactSnapshot {
  id: $id,
  nodeId: $nodeId,
  label: $label,
  type: $type,
  depth: $depth,
  score: $score,
  direct: $direct,
  indirect: $indirect,
  tests: $tests,
  timestamp: $timestamp,
  repoId: $repoId,
  repoName: $repoName,
  analyzedByUsername: $analyzedByUsername,
  analyzedByName: $analyzedByName
})
CREATE (s)-[:BELONGS_TO]->(repo)
RETURN properties(s) AS s, properties(repo) AS repo
`;

/** Refreshes a snapshot's timestamp (unchanged re-run). */
export const TOUCH_SNAPSHOT = `
MATCH (s:ImpactSnapshot {id: $id})
SET s.timestamp = $timestamp
RETURN properties(s) AS s
`;

/** Deletes every snapshot belonging to the repository. */
export const DELETE_SNAPSHOTS_FOR_REPO = `
MATCH (repo:Repository {id: $repoId})<-[:BELONGS_TO]-(s:ImpactSnapshot)
WITH collect(s) AS stale
FOREACH (s IN stale | DETACH DELETE s)
RETURN size(stale) AS deleted
`;

/** Deletes the oldest snapshots beyond the retention cap. */
export const DELETE_OLDEST_SNAPSHOTS = `
MATCH (repo:Repository {id: $repoId})<-[:BELONGS_TO]-(s:ImpactSnapshot)
WITH s
ORDER BY s.timestamp DESC
SKIP $keep
WITH collect(s) AS stale
FOREACH (s IN stale | DETACH DELETE s)
RETURN size(stale) AS deleted
`;
