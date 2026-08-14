/**
 * Multi-hop traversal.
 *
 * This provides bounded, path-preserving
 * reachability across 1..N relationship hops.
 *
 * Structural interpolation policy (the ONE sanctioned exception to
 * parameterization): openCypher requires literal bounds for variable-length
 * patterns (`*1..2`), so `depth` is interpolated — but ONLY after the DTO has
 * validated it as an integer in [1, MAX_TRAVERSAL_DEPTH], and `types` come
 * from the fixed TRAVERSAL_TYPES whitelist. Every value (the root id, limits)
 * is still a parameter.
 */

export function buildTraversalQuery(
  depth: number,
  types: readonly string[],
  pathLimit: number,
  direction: 'out' | 'in' = 'out',
): string {
  const pattern =
    direction === 'out'
      ? `(start {id: $rootId})-[:${types.join('|')}*1..${depth}]->(target)`
      : `(target)-[:${types.join('|')}*1..${depth}]->(start {id: $rootId})`;
  return `
MATCH p = ${pattern}
RETURN properties(target) AS target, labels(target)[0] AS nodeType, length(p) AS hops,
       [x IN nodes(p) | x.id] AS nodeIds,
       [x IN relationships(p) | type(x)] AS relTypes,
       [x IN relationships(p) | properties(x)] AS relProps
ORDER BY hops
LIMIT ${pathLimit}
`;
}
