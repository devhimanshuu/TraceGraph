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
