/**
 * Impact analysis queries (Phase 9 §40).
 *
 * The impact engine is the dependency question in reverse: given an entity,
 * who REACHES it through dependency edges? Three bounded channels cover the
 * impact relationship policy (see impact.constants.ts):
 *
 *   1. CALLS   — function-level, resolved to owner entities (class preferred,
 *                file fallback). This is the primary channel: the flagship
 *                demo is `OrderService → CheckoutService → PaymentService`.
 *   2. IMPORTS — file-level, for File roots (and files containing a Class
 *                root): which files import this file.
 *   3. EXTENDS — class-level, for Class roots: which classes extend it.
 *
 * Every traversal is bounded (depth interpolated ONLY after DTO validation,
 * the sanctioned openCypher exception — same policy as traversal.queries.ts),
 * path-preserving, and parameterized everywhere else.
 */

/** Cap on how many entry function ids are handed to the traversal. */
export const MAX_ENTRY_FUNCTIONS = 500;

/** Functions representing a Function root: itself. */
export const ENTRY_FUNCTIONS_FOR_FUNCTION = `
MATCH (n:Function {id: $rootId})
RETURN n.id AS fnId
`;

/** Functions representing a Class root: the functions in its containing file. */
export const ENTRY_FUNCTIONS_FOR_CLASS = `
MATCH (f:File)-[:CONTAINS]->(c:Class {id: $rootId})
MATCH (f)-[:CONTAINS]->(fn:Function)
RETURN DISTINCT fn.id AS fnId
`;

/** Functions representing a File root: the functions inside the file. */
export const ENTRY_FUNCTIONS_FOR_FILE = `
MATCH (f:File {id: $rootId})-[:CONTAINS]->(fn:Function)
RETURN DISTINCT fn.id AS fnId
`;

/** Functions beneath a Repository/Directory root (containment tree). */
export const ENTRY_FUNCTIONS_FOR_CONTAINER = `
MATCH (n {id: $rootId})-[:CONTAINS*1..4]->(fn:Function)
RETURN DISTINCT fn.id AS fnId
`;

/**
 * Inbound CALLS chains reaching the entry functions. Rows carry the full
 * function path (caller → … → entryFn) and relationship types so the service
 * can resolve owners and rebuild entity-level evidence paths.
 */
export function buildImpactCallPathsQuery(depth: number, pathLimit: number): string {
  return `
MATCH (entryFn:Function)
WHERE entryFn.id IN $entryIds
MATCH p = (caller:Function)-[:CALLS*1..${depth}]->(entryFn)
RETURN [x IN nodes(p) | x.id] AS fnIds,
       [x IN relationships(p) | type(x)] AS relTypes,
       length(p) AS hops
ORDER BY hops
LIMIT ${pathLimit}
`;
}

/**
 * Owner resolution for every function touched by the call paths. A function's
 * owner entity is its containing class (single-class files) or its file
 * (multi-class files) — the same rule the Dependency Explorer uses.
 */
export const FIND_FUNCTION_OWNERS = `
MATCH (f:File)-[:CONTAINS]->(fn:Function)
WHERE fn.id IN $fnIds
OPTIONAL MATCH (f)-[:CONTAINS]->(ownerClass:Class)
RETURN fn.id AS fnId, fn.name AS fnName,
       f.id AS fileId, f.name AS fileName,
       collect(DISTINCT ownerClass.id) AS classIds,
       collect(DISTINCT ownerClass.name) AS classNames
`;

/**
 * Inbound IMPORTS chains reaching a root file: the files that import it
 * (directly or transitively). `depth` is validated before interpolation.
 */
export function buildImpactImportsPathsQuery(depth: number, pathLimit: number): string {
  return `
MATCH (rootFile:File {id: $rootId})
MATCH p = (importer:File)-[:IMPORTS*1..${depth}]->(rootFile)
RETURN [x IN nodes(p) | x.id] AS fileIds,
       [x IN relationships(p) | type(x)] AS relTypes,
       length(p) AS hops
ORDER BY hops
LIMIT ${pathLimit}
`;
}

/**
 * Inbound EXTENDS chains reaching a root class: the classes that extend it.
 * `depth` is validated before interpolation.
 */
export function buildImpactExtendsPathsQuery(depth: number, pathLimit: number): string {
  return `
MATCH (rootClass:Class {id: $rootId})
MATCH p = (sub:Class)-[:EXTENDS*1..${depth}]->(rootClass)
RETURN [x IN nodes(p) | x.id] AS classIds,
       [x IN relationships(p) | type(x)] AS relTypes,
       length(p) AS hops
ORDER BY hops
LIMIT ${pathLimit}
`;
}
