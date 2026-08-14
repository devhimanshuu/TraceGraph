/**
 * Dependency queries (Phase 5 §10–§14).
 *
 * Semantics follow the Phase 4 schema — there is no synthetic `DEPENDS_ON`
 * edge; dependencies ARE the real edges:
 *   - Function: CALLS (callees) / reverse CALLS (callers)
 *   - File:     IMPORTS (imported files) / reverse IMPORTS (importers)
 *   - Class:    EXTENDS parents + owners of the functions its methods call
 *               (resolved through the class's containing file — classes do not
 *               contain functions in this schema)
 *   - Test:     TESTS → Function
 *
 * Nodes are returned as `properties(...)` maps (never raw driver Node objects)
 * so the mapper receives exactly the property data.
 */

/** Direct dependencies of a Function: the functions it calls. */
export const FIND_FUNCTION_CALLEES = `
MATCH (fn:Function {id: $id})-[r:CALLS]->(callee:Function)
RETURN properties(callee) AS n, labels(callee)[0] AS nodeType, type(r) AS relType
ORDER BY callee.name
LIMIT $limit
`;

/** Direct dependents of a Function: the functions that call it. */
export const FIND_FUNCTION_CALLERS = `
MATCH (caller:Function)-[r:CALLS]->(fn:Function {id: $id})
RETURN properties(caller) AS n, labels(caller)[0] AS nodeType, type(r) AS relType
ORDER BY caller.name
LIMIT $limit
`;

/** Direct dependencies of a File: files it imports. */
export const FIND_FILE_IMPORTS = `
MATCH (f:File {id: $id})-[r:IMPORTS]->(target:File)
RETURN properties(target) AS n, labels(target)[0] AS nodeType, type(r) AS relType, properties(r) AS relProps
ORDER BY target.name
LIMIT $limit
`;

/** Direct dependents of a File: files that import it. */
export const FIND_FILE_IMPORTED_BY = `
MATCH (importer:File)-[r:IMPORTS]->(f:File {id: $id})
RETURN properties(importer) AS n, labels(importer)[0] AS nodeType, type(r) AS relType, properties(r) AS relProps
ORDER BY importer.name
LIMIT $limit
`;

/** Direct dependencies of a Class: classes it extends. */
export const FIND_CLASS_EXTENDS = `
MATCH (c:Class {id: $id})-[r:EXTENDS]->(parent:Class)
RETURN properties(parent) AS n, labels(parent)[0] AS nodeType, type(r) AS relType
ORDER BY parent.name
LIMIT $limit
`;

/**
 * Class dependencies through CALLS. Resolves the class's containing file,
 * then the owners (class preferred, file fallback) of everything the class's
 * methods call. `collect(DISTINCT properties(ownerClass))` per callee lets
 * the mapper pick a single deterministic owner (the class for single-class
 * files).
 */
export const FIND_CLASS_DEPENDENCIES = `
MATCH (f:File)-[:CONTAINS]->(c:Class {id: $id})
MATCH (f)-[:CONTAINS]->(fn:Function)-[r:CALLS]->(callee:Function)
MATCH (calleeFile:File)-[:CONTAINS]->(callee)
OPTIONAL MATCH (calleeFile)-[:CONTAINS]->(ownerClass:Class)
RETURN DISTINCT properties(callee) AS callee, properties(calleeFile) AS calleeFile,
       collect(DISTINCT properties(ownerClass)) AS owners, type(r) AS relType
LIMIT $limit
`;

/** Class dependents: owners of the functions that call this class's methods. */
export const FIND_CLASS_DEPENDENTS = `
MATCH (f:File)-[:CONTAINS]->(c:Class {id: $id})
MATCH (f)-[:CONTAINS]->(fn:Function)<-[r:CALLS]-(caller:Function)
MATCH (callerFile:File)-[:CONTAINS]->(caller)
OPTIONAL MATCH (callerFile)-[:CONTAINS]->(ownerClass:Class)
RETURN DISTINCT properties(caller) AS caller, properties(callerFile) AS callerFile,
       collect(DISTINCT properties(ownerClass)) AS owners, type(r) AS relType
LIMIT $limit
`;

// ── Test coverage (Phase 5 §14) ────────────────────────────────────────────────
// `(:Test)-[:TESTS]->(:Function)`. The entity → function resolution differs by
// node type (functions are contained by files, not classes, in this schema).

/** Tests covering a Function directly. */
export const FIND_TESTS_FOR_FUNCTION = `
MATCH (t:Test)-[:TESTS]->(fn:Function {id: $id})
RETURN properties(t) AS t, properties(fn) AS fn
ORDER BY t.name
LIMIT $limit
`;

/** Tests covering the functions inside a File. */
export const FIND_TESTS_FOR_FILE = `
MATCH (f:File {id: $id})-[:CONTAINS]->(fn:Function)<-[:TESTS]-(t:Test)
RETURN DISTINCT properties(t) AS t, properties(fn) AS fn
ORDER BY t.name
LIMIT $limit
`;

/** Tests covering the functions in a Class's containing file. */
export const FIND_TESTS_FOR_CLASS = `
MATCH (f:File)-[:CONTAINS]->(c:Class {id: $id})
MATCH (f)-[:CONTAINS]->(fn:Function)<-[:TESTS]-(t:Test)
RETURN DISTINCT properties(t) AS t, properties(fn) AS fn
ORDER BY t.name
LIMIT $limit
`;

/** Tests covering the functions beneath a Repository or Directory. */
export const FIND_TESTS_FOR_CONTAINER = `
MATCH (n {id: $id})-[:CONTAINS*1..4]->(fn:Function)<-[:TESTS]-(t:Test)
RETURN DISTINCT properties(t) AS t, properties(fn) AS fn
ORDER BY t.name
LIMIT $limit
`;

// ── Relationship summary counts (Phase 8) ──────────────────────────────────────
// Count variants of the list queries above. They power `GET /api/nodes/:id/
// relationship-summary` so the UI can render category counts with ONE request
// instead of fetching every relationship list up front. Counts deliberately
// mirror the list semantics (distinct leaves, owner resolution for classes).

/** All incoming + outgoing relationships of a node. */
export const COUNT_RELATIONSHIPS = `
MATCH (n {id: $id})-[r]-()
RETURN count(r) AS count
`;

/** Callees (Function): distinct called functions. */
export const COUNT_FUNCTION_CALLEES = `
MATCH (fn:Function {id: $id})-[:CALLS]->(callee:Function)
RETURN count(DISTINCT callee) AS count
`;

/** Callers (Function): distinct calling functions. */
export const COUNT_FUNCTION_CALLERS = `
MATCH (caller:Function)-[:CALLS]->(fn:Function {id: $id})
RETURN count(DISTINCT caller) AS count
`;

/** Imports (File): distinct imported files. */
export const COUNT_FILE_IMPORTS = `
MATCH (f:File {id: $id})-[:IMPORTS]->(target:File)
RETURN count(DISTINCT target) AS count
`;

/** Importers (File): distinct files importing this one. */
export const COUNT_FILE_IMPORTED_BY = `
MATCH (importer:File)-[:IMPORTS]->(f:File {id: $id})
RETURN count(DISTINCT importer) AS count
`;

/** Parents (Class): distinct extended classes. */
export const COUNT_CLASS_EXTENDS = `
MATCH (c:Class {id: $id})-[:EXTENDS]->(parent:Class)
RETURN count(DISTINCT parent) AS count
`;

/**
 * Class dependencies: distinct dependency owners (class preferred, file
 * fallback) of the functions the class's methods call — mirrors the list
 * query's dedup rule exactly.
 */
export const COUNT_CLASS_DEPENDENCIES = `
MATCH (f:File)-[:CONTAINS]->(c:Class {id: $id})
MATCH (f)-[:CONTAINS]->(fn:Function)-[:CALLS]->(callee:Function)
MATCH (calleeFile:File)-[:CONTAINS]->(callee)
OPTIONAL MATCH (calleeFile)-[:CONTAINS]->(ownerClass:Class)
RETURN count(DISTINCT coalesce(ownerClass.id, calleeFile.id)) AS count
`;

/** Class dependents: distinct caller owners — mirrors the list query. */
export const COUNT_CLASS_DEPENDENTS = `
MATCH (f:File)-[:CONTAINS]->(c:Class {id: $id})
MATCH (f)-[:CONTAINS]->(fn:Function)<-[:CALLS]-(caller:Function)
MATCH (callerFile:File)-[:CONTAINS]->(caller)
OPTIONAL MATCH (callerFile)-[:CONTAINS]->(ownerClass:Class)
RETURN count(DISTINCT coalesce(ownerClass.id, callerFile.id)) AS count
`;

/** Tests covering a Function directly. */
export const COUNT_TESTS_FOR_FUNCTION = `
MATCH (t:Test)-[:TESTS]->(fn:Function {id: $id})
RETURN count(DISTINCT t) AS count
`;

/** Tests covering the functions inside a File. */
export const COUNT_TESTS_FOR_FILE = `
MATCH (f:File {id: $id})-[:CONTAINS]->(fn:Function)<-[:TESTS]-(t:Test)
RETURN count(DISTINCT t) AS count
`;

/** Tests covering the functions in a Class's containing file. */
export const COUNT_TESTS_FOR_CLASS = `
MATCH (f:File)-[:CONTAINS]->(c:Class {id: $id})
MATCH (f)-[:CONTAINS]->(fn:Function)<-[:TESTS]-(t:Test)
RETURN count(DISTINCT t) AS count
`;

/** Tests covering the functions beneath a Repository or Directory. */
export const COUNT_TESTS_FOR_CONTAINER = `
MATCH (n {id: $id})-[:CONTAINS*1..4]->(fn:Function)<-[:TESTS]-(t:Test)
RETURN count(DISTINCT t) AS count
`;
