# TraceGraph Graph Query Strategy

This document explains the Phase 5 query catalog: where the Cypher lives, the
three canonical queries, and why at least one of them is naturally a graph
query and awkward in a relational schema.

## Where queries live

All application Cypher is confined to `apps/api/src/graph/queries/*.ts`, named
and documented:

| File | Queries |
| --- | --- |
| `node.queries.ts` | `FIND_NODE_BY_ID`, `FIND_OUTGOING_RELATIONSHIPS`, `FIND_INCOMING_RELATIONSHIPS` |
| `dependency.queries.ts` | `FIND_FUNCTION_CALLEES/CALLERS`, `FIND_FILE_IMPORTS/IMPORTED_BY`, `FIND_CLASS_EXTENDS`, `FIND_CLASS_DEPENDENCIES/DEPENDENTS`, `FIND_TESTS_FOR_FUNCTION/FILE/CLASS/CONTAINER` |
| `traversal.queries.ts` | `buildTraversalQuery(depth, types, pathLimit)` |
| `history.queries.ts` | `FIND_COMMITS_FOR_ENTITY`, `FIND_PULL_REQUESTS_FOR_ENTITY`, `FIND_ISSUES_FOR_ENTITY` |
| `graph.queries.ts` | `FIND_DEFAULT_REPOSITORY`, `countNodesByLabel`, `COUNT_TRACEGRAPH_RELATIONSHIPS`, `SEARCH_NODES` |

Only `GraphRepository` executes them (through `DatabaseService`). Controllers
are thin; services own use-case logic; the database layer owns the driver.

## Parameterization policy

- **Every value is a parameter**: `$id`, `$limit`, `$q`, `$labels`. No Cypher
  is ever built from user or data values.
- **One sanctioned structural exception**: openCypher requires *literal* bounds
  for variable-length patterns (`*1..2`), so the validated traversal `depth`
  (integer, DTO-clamped to 1..4) is interpolated into the query text. Labels
  and relationship types are interpolated only from fixed whitelists
  (`graph.constants.ts`). Both are structural, never data — and always
  validated before interpolation.

## Query 1 — direct relationship lookup (1 hop)

Question: *"Which functions call this function?"*

```cypher
MATCH (caller:Function)-[r:CALLS]->(fn:Function {id: $id})
RETURN caller, labels(caller)[0] AS nodeType, type(r) AS relType
ORDER BY caller.name
LIMIT $limit
```

Trivial in any database. It is included here because it is the base case the
multi-hop version generalizes.

## Query 2 — multi-hop dependency traversal (the graph-value query)

Question: *"What is reachable from this component within 1–3 hops, and via
which path?"*

```cypher
MATCH p = (start {id: $rootId})-[:CALLS|IMPORTS|EXTENDS*1..3]->(target)
RETURN target, labels(target)[0] AS nodeType, length(p) AS hops,
       [x IN nodes(p) | x.id] AS nodeIds,
       [x IN relationships(p) | type(x)] AS relTypes
ORDER BY hops
LIMIT 250
```

Exposed as `GET /api/traversal/:id?depth=2&types=CALLS,IMPORTS`. The response
keeps **evidence paths**, not just a reachable set: the impact-analysis phase
can explain *why* `CheckoutService` is affected by a `PaymentService` change —
because `processCheckout -[:CALLS]-> processPayment`.

`GET /api/graph` uses the same walker but expands **in both directions** and
merges the result (min-hop distances, deduplicated edges). Bidirectional on
purpose: containment points UP from classes/functions (`File -[:CONTAINS]->
Class`), so selecting a class must show its file, directory, and neighbors —
not an empty graph. The traversal endpoint stays one-directional because its
semantic is dependency reachability, not neighborhood context.

**Why this is naturally a graph query:**

- **Dynamic depth, no schema change.** `*1..N` expresses "any number of hops"
  directly. Depth is a query parameter, bounded by validation — not a fixed
  join count in the schema.
- **Paths fall out of the traversal.** The query returns the actual path
  (`nodeIds`, `relTypes`). Explaining *why* something is affected requires the
  path, and in a graph the path is a first-class result.
- **The relational equivalent is a recursive CTE.** Modeling the same
  reachability relationally means either a fixed-depth series of self-joins
  (hard-coded, brittle — every new depth is a schema change) or a recursive
  CTE that must track depth itself, deduplicate visited nodes to avoid cycles,
  and reconstruct paths from node-id bookkeeping. It is *possible* — but the
  graph expresses the question directly, which is the honest argument.

## Query 3 — history/context traversal (multi-hop, mixed types)

Question: *"Which commits, PRs, and issues touched this component?"*

```cypher
MATCH (f:File)-[:CONTAINS*0..3]->(n {id: $id})
MATCH (c:Commit)-[:MODIFIES]->(f)
MATCH (pr:PullRequest)-[:CONTAINS]->(c)
MATCH (i:Issue)-[:RELATED_TO]->(pr)
RETURN DISTINCT i
ORDER BY i.number DESC
LIMIT $limit
```

This walks *four different relationship types* through four hops — File →
Commit → PullRequest → Issue. Relationally this is four join tables plus a
recursive containment climb; here it is a single pattern. It is also the
"related engineering context" query that makes the impact analysis demo
meaningful: changing `payment.service.ts` surfaces Issue #912, PR #421, and
Commit `8f21ac7` with one traversal.

## Bounds policy (protecting the small free-tier instance)

| Bound | Value | Enforced at |
| --- | --- | --- |
| Traversal depth | 1..4 (default 2) | DTO `@Min(1) @Max(4)` |
| Traversal evidence paths | ≤ 250 (default 100) | DTO + query `LIMIT` |
| Graph neighborhood nodes | ≤ 500 (default 200) | DTO + response slice |
| Relationships / dependencies | ≤ 200 (default 100) | DTO + query `LIMIT` |
| History results | ≤ 100 (default 50) | DTO + query `LIMIT` |
| Search results | ≤ 50 (default 20) | DTO + query `LIMIT` |

Every bound exists because unbounded expansion on a small hosted instance is
the one way this API could be misused; the values are constants in
`graph.constants.ts` so they stay easy to tune.
