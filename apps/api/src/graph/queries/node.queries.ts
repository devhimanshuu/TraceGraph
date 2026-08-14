/**
 * Node queries.
 *
 * Every query returns a consistent shape: `n` = the node's PROPERTY MAP
 * (via `properties(n)`, never the raw driver Node object), `nodeType` = the
 * node's label, plus query-specific columns. All values are parameterized
 * (`$id`, `$limit`); labels/types come from fixed whitelists.
 */

/** `GET /api/nodes/:id` — one node by stable id (any of the 10 labels). */
export const FIND_NODE_BY_ID = `
MATCH (n {id: $id})
RETURN properties(n) AS n, labels(n)[0] AS nodeType
LIMIT 1
`;

/** Outgoing relationships of a node. */
export const FIND_OUTGOING_RELATIONSHIPS = `
MATCH (n {id: $id})-[r]->(target)
RETURN type(r) AS relType, properties(r) AS relProps,
       target.id AS targetId, labels(target)[0] AS targetType, target.name AS targetName
ORDER BY relType, targetName
LIMIT $limit
`;

/** Incoming relationships of a node. */
export const FIND_INCOMING_RELATIONSHIPS = `
MATCH (source)-[r]->(n {id: $id})
RETURN type(r) AS relType, properties(r) AS relProps,
       source.id AS sourceId, labels(source)[0] AS sourceType, source.name AS sourceName
ORDER BY relType, sourceName
LIMIT $limit
`;
