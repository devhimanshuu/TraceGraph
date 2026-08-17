# TraceGraph — Technical Design Specification

**Product:** TraceGraph — *Understand your codebase through relationships.*
**Project:** WEXA AI — CognoDB Take-Home Assignment (hiring assessment)
**Status:** Architecture and Technical Design Specification

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Assessment Interpretation](#2-assessment-interpretation)
3. [Product Definition](#3-product-definition)
4. [User Persona](#4-user-persona)
5. [User Journeys](#5-user-journeys)
6. [Feature Scope (P0 / P1 / P2)](#6-feature-scope-p0--p1--p2)
7. [System Architecture](#7-system-architecture)
8. [NestJS Module Architecture](#8-nestjs-module-architecture)
9. [Next.js Architecture](#9-nextjs-architecture)
10. [Graph Schema](#10-graph-schema)
11. [Node Property Definitions](#11-node-property-definitions)
12. [Seed-Data Design](#12-seed-data-design)
13. [Cypher Query Catalog](#13-cypher-query-catalog)
14. [Impact-Analysis Design](#14-impact-analysis-design)
15. [REST API Contract](#15-rest-api-contract)
16. [UI / Page Architecture](#16-ui--page-architecture)
17. [Graph UX Specification](#17-graph-ux-specification)
18. [Error-Handling Strategy](#18-error-handling-strategy)
19. [Configuration Strategy](#19-configuration-strategy)
20. [Testing Strategy](#20-testing-strategy)
21. [README Structure](#21-readme-structure)
22. [Demo Flow](#22-demo-flow)
23. [Assessment Acceptance Criteria](#23-assessment-acceptance-criteria)
24. [Implementation Architecture Map](#24-implementation-architecture-map)
25. [Risk Analysis](#25-risk-analysis)
26. [48-Hour Execution Priorities](#26-48-hour-execution-priorities)

[Assumptions Register](#assumptions-register)
[TECHNICAL DESIGN SUMMARY](#technical-design-summary)

---

## 1. Executive Summary

TraceGraph is a graph-powered codebase intelligence explorer. A developer opens the application, picks an entity (class, function, or file) in a fictional **Commerce Platform** repository, inspects its relationships, and runs **Analyze Impact** to see every component that could break — directly or indirectly — if that entity changes, along with the exact dependency path, the tests that would fail, and the PRs/issues that touched the same code.

This document is the **complete technical blueprint** for the system. It fixes:

- The exact product scope (P0/P1/P2) and the explicit non-goals of the assessment.
- A critical review of the proposed graph model, the final schema, and every node/relationship decision.
- The seed-data design for a realistic fictional repository, including deliberately engineered "interesting" dependency chains for the demo.
- The full parameterized Cypher query catalog, including the flagship **multi-hop impact traversal** and the query that is **awkward in a relational database**.
- The Impact Analysis feature specification (the centerpiece of the product and of the demo).
- The NestJS backend and Next.js frontend architecture, the REST API contract, error strategy, configuration, testing, README, demo script, acceptance criteria, architecture map, risks, and a 48-hour execution budget.

**Design posture:** small, polished, graph-native, easy to explain, and finishable in 48 hours. Every major decision below includes a **Decision → Reason** note. Where a fact about CognoDB could not be confirmed from public sources, it is explicitly marked as an **assumption** in the [Assumptions Register](#assumptions-register) and has a verification step.

### Key decisions at a glance

| # | Decision | Summary |
|---|----------|---------|
| D1 | Graph edges at **function granularity** (CALLS between functions), classes own their methods | Realistic model; enables the flagship multi-hop query and path explanations |
| D2 | **Impact analysis** = variable-length `CALLS` traversal collapsed back to classes/files | The graph-native "money shot"; awkward in SQL |
| D3 | Impact levels by hop count: HIGH (1), MEDIUM (2), LOW (3) | Simple, explainable, matches demo narrative |
| D4 | **Two frontend pages**: `/dashboard` + `/explorer` (graph + details + impact combined) | Matches the primary user story without navigation ceremony |
| D5 | **Lean NestJS**: 6 modules, Cypher confined to repository-layer files | Clean separation without enterprise bloat |
| D6 | Single **deterministic, idempotent seed script** (MERGE on stable IDs) | Repeatable demos, safe re-runs, deterministic screenshots |
| D7 | All Cypher **parameterized**; hop-count limits validated and interpolated as literals | openCypher cannot parameterize variable-length bounds |
| D8 | Backend **starts degraded** if CognoDB is down; health + banner, never crash | Deliberately demonstrates graceful failure handling (P0) |
| D9 | Dark developer-tool theme, neighborhood-focused graph (never "everything at once") | Sharper screenshots; matches React Flow + shadcn idiom |
| D10 | History entities (Commit/PR/Issue/Developer) kept **out of the canvas**, surfaced in panels | Canvas stays readable; keeps graph UX tractable in 48h |

---

## 2. Assessment Interpretation

### 2.1 What is being evaluated

From the assignment brief, the evaluators are looking for the following, each of which this design satisfies explicitly:

| Assessment criterion | Where this design satisfies it |
|---|---|
| Thoughtful graph data modeling | §10, §11 — critical review of the proposed model, typed relationships, property design, redundant-relationship avoidance |
| Labeled nodes | §10 — 10 node labels |
| Typed relationships | §10 — 12 relationship types |
| Properties | §11 — minimal property schemas per node |
| Realistic seed data | §12 — Commerce Platform with realistic structure |
| Cypher queries | §13 — 14-query catalog, all parameterized |
| ≥1 multi-hop traversal | §13 (Q12/Q13) and §14 — variable-length `CALLS*1..3` |
| ≥1 query awkward in a relational DB | §13 (Q12/Q13), §2.3 — variable-depth path traversal with path capture |
| Parameterized queries | §13 — every query uses parameters; no string interpolation of values |
| Official Neo4j driver | §8 — `neo4j-driver` (official JS/TS driver) over Bolt |
| Functional web application | §9, §15–§17 |
| Clean, intentional UX | §16, §17 — loading/empty/error states, neighborhood-first graph |
| Env-based credentials | §19 — `COGNODB_URI`/`USERNAME`/`PASSWORD`, validated at boot |
| Clear project structure | §7.2, §8, §9 |
| Graceful DB failure handling | §18 — degraded startup, health endpoint, 503 mapping, no credential leaks |
| README (use case, why-graph, data model diagram, setup, query explanations, screenshots) | §21 |
| Hosted app + screen recording | §22, §23 (deployment checklist) |

### 2.2 Scope rule (binding)

This is the **assessment version only**. Explicitly **not** in scope (future milestones, listed for traceability):

GitHub OAuth · real repository ingestion · cloning pipeline · AST parsing · embeddings/vector DB · RAG · Redis · BullMQ · multi-agent systems · Slack/Jira integrations · GitHub write actions · multi-tenancy · billing · complex auth · autonomous coding agents.

> **Decision → Reason** — A realistic scope boundary is itself part of the evaluation. Building a "production platform" in 48 hours produces a broad, shallow result; the assessment rewards one deep, polished, graph-native vertical slice (impact analysis over a realistic seed). The architecture (§7) leaves clean seams for future extensions without implementing them.

### 2.3 Why a graph database? (canonical answer, reused in README and demo)

The central product question is: **"What could be affected if I change `PaymentService`?"**

- The answer requires following **relationships of unknown depth** — `PaymentService` calls `CheckoutService`, which calls `OrderService`, which is tested by `OrderServiceTest`, whose PR is linked to an issue. In a graph, this is one variable-length pattern. In a relational DB it is a recursive CTE of fixed shape, a closure table that must be maintained on every write, and the *paths* (needed for the "why") are lost or expensive to reconstruct.
- The domain is **heterogeneous but uniformly queryable**: code containment, calls, tests, commits, PRs, and issues share one traversal language. A relational model needs a different join shape for each pair of tables.
- **Path capture is first-class**: the explanation "`OrderService` is affected because `PaymentService.charge() → CheckoutService.completeCheckout() → OrderService.createOrder()`" is returned directly by the traversal, not reconstructed from join tables.
- **Schema evolution is free**: adding `Class -[:IMPLEMENTS]-> Interface` tomorrow costs no migration.

This is the honest, demonstrable core of the assignment: CognoDB is not decorative; it is the reason the impact query exists.

---

## 3. Product Definition

> **TraceGraph** is a graph-powered codebase intelligence explorer that helps developers understand repository relationships, explore dependencies, and analyze potential change impact.

**Tagline:** *Understand your codebase through relationships.*

### 3.1 Primary user story

```
Developer opens repository dashboard
        ↓
Explores codebase graph
        ↓
Selects an entity
        ↓
Inspects its relationships
        ↓
Runs "Analyze Impact"
        ↓
Sees direct and indirect affected components
        ↓
Understands why they are affected
```

### 3.2 Primary example (the demo's north star)

```
PaymentService
      |
      +----> CheckoutService
      |          |
      |          +----> OrderService
      |
      +----> RefundService
      |
      +----> PaymentController
      |
      +----> PaymentServiceTest
```

The central question: **"What could be affected if I change PaymentService?"**

### 3.3 Non-goals (assessment version)

No OAuth, no ingestion, no AI-dependent features required for the core experience. AI explanation (§6, P1) is explicitly optional and secondary to deterministic graph functionality.

---

## 4. User Persona

### Primary persona — "Onboarding Alex"

- Mid-level backend developer, 3–6 years experience, recently assigned to the Commerce Platform team.
- The codebase is large and unfamiliar; colleagues are busy; docs are sparse.
- **Goals:** (1) find where a service is used before changing it; (2) estimate blast radius of a change; (3) know which tests to run; (4) know which PRs/issues are related.
- **Frustrations:** reading call graphs in an IDE one file at a time; grepping for callers; missing *indirect* dependencies; breaking unrelated tests in CI.
- **Definition of success:** "I changed `PaymentService` confidently because I saw exactly what depends on it, how, and what tests cover it."

> **Decision → Reason** — A single, sharply drawn primary persona. A hiring assessment should demonstrate depth for one user, not breadth for many. (Secondary persona — a tech lead doing pre-refactor risk review — is served by the same flows with zero extra work.)

---

## 5. User Journeys

### Journey A — Repository overview
```
Open application
→ View repository (Commerce Platform)
→ See repository statistics (files, classes, functions, tests, commits, PRs, issues)
→ See recent activity (recent commits, open PRs/issues)
→ Navigate to graph
```
- **Happy path:** stats load, dashboard renders.
- **Edge:** database empty → EmptyState with "seed the database" guidance.
- **Edge:** database down → ErrorState banner + retry; app stays navigable (§18).

### Journey B — Graph exploration
```
Open graph
→ See the codebase graph (containment + call structure, services emphasized)
→ Select an entity (click node or search — search is P1; click is P0)
→ View the entity's neighborhood highlighted
→ Open node details panel (properties, description, contained functions)
```
- **Edge:** entity has no relationships → panel shows explicit "no relationships" empty state.
- **Edge:** node deleted between queries → 404 with graceful inline message.

### Journey C — Dependency exploration
```
Select entity
→ View dependencies (what it calls / imports)
→ View dependents (what calls / imports it)
→ View callers (aggregated to owning classes)
→ View tests (direct tests; transitive coverage surfaced in Impact)
→ View related engineering history (commits, PRs, issues touching it)
```
- Implemented as tabs in the node details panel; each tab is its own query and its own loading/empty/error state (§16).

### Journey D — Impact analysis
```
Select entity
→ "Analyze Impact"
→ Execute graph traversal (variable-length CALLS, max depth 3)
→ Group affected entities by impact level (HIGH/MEDIUM/LOW)
→ Show the explanation path for each affected entity
→ Show affected tests, related PRs, related issues
→ Visualize on the graph (color-coded by level, source pulsed)
```
- **Edge:** no affected entities → explicit "no impact detected within depth 3" empty state (a valid, honest result).
- **Edge:** depth limit exceeded → hint "try depth 1".

### Journey E — Error handling
| Failure | Expected behavior |
|---|---|
| CognoDB unavailable | Backend health flips to `degraded`; API returns 503; UI shows banner "Database unavailable — data may be stale" with Retry; app shell still renders. No crash, no stack traces. |
| Entity doesn't exist | 404 `NOT_FOUND`; UI shows inline "Entity not found" with a link back to the graph. |
| Repository has no data | 200 with zeroed stats; UI shows EmptyState with seed instructions. |
| Query fails (bad syntax, timeout) | 500 `QUERY_FAILED` (sanitized); UI shows retryable error state; full detail logged server-side only. |
| Network request fails (frontend → backend) | Frontend ErrorState with Retry; TanStack Query marks the query `error` and keeps the previous cache. |

---

## 6. Feature Scope (P0 / P1 / P2)

Legend: **Req** = which assessment requirement it satisfies. **Complexity** = S/M/L (relative to the 48h budget). **Cuttable** = can it be dropped if time runs out.

### P0 — Mandatory for submission

| Feature | Why it exists | Required? | Requirement satisfied | Complexity | Cuttable? |
|---|---|---|---|---|---|
| Repository dashboard | Entry point; shows the app is data-backed | Yes | Functional app; loading/empty/error states | S | **No** — the home screen |
| Graph explorer | Core visualization of the graph | Yes | Functional app; intentional UX | M | No — it *is* the product |
| Node details | Properties + relationships of a selected entity | Yes | Functional app | S | No |
| Dependency explorer (deps/dependents/callers/tests) | Journey C; demonstrates typed relationships | Yes | Graph queries; typed relationships | S | Partially — can merge tabs if short |
| Multi-hop graph traversal | The headline graph capability | Yes | ≥1 multi-hop traversal | M | No |
| Impact analysis | Flagship feature; the central question | Yes | Multi-hop; relational-awkwardness | M | No |
| CognoDB integration | The database is the point of the assignment | Yes | CognoDB + official driver | S | No |
| Deterministic seed script | Realistic, repeatable data; safe re-runs | Yes | Realistic seed data | M | No |
| Parameterized Cypher | Hard requirement of the brief | Yes | Parameterized queries | S | No |
| Loading states | Explicit UX requirement | Yes | Loading states | S | No |
| Empty states | Explicit UX requirement | Yes | Empty states | S | No |
| Error states | Explicit UX requirement | Yes | Error states | S | No |
| Graceful DB failure handling | Evaluated explicitly | Yes | Graceful failure handling | M | No |
| Hosted application | Explicit requirement | Yes | Hosted demo | M | No |
| README + data model diagram + screenshots | Explicit requirement | Yes | Documentation | M | No |
| Demo recording | Explicit requirement | Yes | Screen recording | S | No |

### P1 — Only if P0 is stable

| Feature | Why it exists | Required? | Requirement satisfied | Complexity | Cuttable? |
|---|---|---|---|---|---|
| Search/command palette (entity search) | Faster navigation; makes graph exploration feel complete | No | UX polish | M | Yes — click-to-select suffices for the demo |
| Git history view | Richer Journey C | No | Depth of demo | S | Yes |
| Related PRs/issues | Richer impact results | No | Depth of demo | S | Yes — counts can be shown without lists |
| Evidence-backed AI explanation (optional) | "Wow" final demo step; explicitly optional | No | Differentiation | L | Yes — deterministic feature is complete without it |

### P2 — Explicitly deferred (outside assessment scope)

GitHub OAuth · real repo ingestion · cloning · AST parsing · embeddings/vector DB · RAG · Redis/BullMQ · multi-agent systems · Slack/Jira · GitHub write actions · multi-tenancy · billing · complex auth · autonomous agent.

> **Decision → Reason** — P1 items are deliberately *enhancements of the same graph data*, not new subsystems: search queries existing nodes, history reuses `Commit/PR/Issue` edges, and AI explanation just consumes the deterministic impact result. This keeps P1 trivially addable without architectural change.

---

## 7. System Architecture

### 7.1 Topology

```text
Next.js Frontend (apps/web)
       |
       | REST API (JSON over HTTP, CORS-enabled)
       v
NestJS Backend (apps/api)
       |
       | Domain services
       v
Graph / data-access layer (repositories — the ONLY files that contain Cypher)
       |
       v
Neo4j JS Driver (official) — Bolt protocol
       |
       v
CognoDB (openCypher)
```

**Hard rules:**
1. The frontend never communicates directly with CognoDB.
2. Controllers contain **no** Cypher. Services contain **no** Cypher. All Cypher lives in repository-layer files (§8.3).
3. Every Cypher query is parameterized (§13).

### 7.2 Repository layout (single repo, npm workspaces)

```text
tracegraph/
├── apps/
│   ├── web/                      # Next.js frontend
│   │   ├── app/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── explorer/page.tsx
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   ├── lib/                  # api client, query hooks, graph helpers
│   │   └── ...
│   └── api/                      # NestJS backend
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── config/
│       │   ├── common/
│       │   ├── database/
│       │   ├── health/
│       │   ├── repository/
│       │   ├── graph/
│       │   ├── impact/
│       │   └── history/
│       ├── seed/                 # deterministic seed script
│       └── ...
├── package.json                  # workspaces + root scripts (dev, seed, build)
└── README.md
```

> **Decision → Reason** — One monorepo with two workspaces. A separate shared-types package was considered and **rejected**: for a 48h assessment the few duplicated type declarations between NestJS DTOs and the frontend API client are cheaper than workspace/tsconfig ceremony. (Noted as a P1 improvement.)

### 7.3 Request flow

```text
HTTP Request
→ Controller (route, param validation via DTO)
→ DTO validation (class-validator, global ValidationPipe)
→ Domain Service (business logic, composition)
→ Graph Repository (parameterized Cypher)
→ Database Service (driver session, error taxonomy mapping)
→ CognoDB
→ Response DTO (shape contract)
→ HTTP Response
```

---

## 8. NestJS Module Architecture

### 8.1 Module review

The brief proposed: `main, app.module, config, common, database, health, repository, graph, dependency, impact, history`.

> **Decision → Reason** — **`dependency/` is merged into `graph/`.** Dependencies, dependents, callers, and tests are all "relationships of a node" sharing the same node/edge primitives and data-access patterns; a separate module adds ceremony without benefit at this scale. `impact/` and `history/` stay separate because they are distinct product features with their own query sets. Final module count: **6 feature modules + bootstrap**.

### 8.2 Final module map

```text
apps/api/src/
├── main.ts                       # bootstrap: ValidationPipe, CORS, /api prefix, global filters
├── app.module.ts                 # root module wiring
├── config/
│   └── config.module.ts          # @nestjs/config + Joi validation schema (fail fast)
├── common/
│   ├── exceptions/
│   │   ├── http-exception.filter.ts      # standardizes error shape
│   │   └── database-exception.filter.ts  # driver errors → 503/500 (sanitized)
│   ├── dto/                             # base DTO helpers (id param, depth param)
│   └── types/                           # entity shape types
├── database/
│   ├── database.module.ts        # global module, provider for the driver
│   └── database.service.ts       # driver lifecycle, sessions, verifyConnectivity, error taxonomy
├── health/
│   ├── health.controller.ts      # GET /health, GET /health/database
│   └── health.service.ts
├── repository/
│   ├── repository.controller.ts  # GET /repository
│   ├── repository.service.ts
│   └── repository.repository.ts  # Cypher: overview + stats
├── graph/
│   ├── graph.controller.ts       # nodes, neighborhood, dependencies, dependents, callers, tests
│   ├── graph.service.ts
│   ├── graph.repository.ts       # Cypher for node queries + graph fetch
│   └── relationship.repository.ts# Cypher for dependency/dependent/caller/test queries
├── impact/
│   ├── impact.controller.ts      # GET /impact?id=
│   ├── impact.service.ts         # orchestration + grouping/ranking logic
│   └── impact.repository.ts      # Cypher: traversal, tests, PRs, issues
└── history/
    ├── history.controller.ts     # GET /node-history/commits|pull-requests|issues?id=
    ├── history.service.ts
    └── history.repository.ts     # Cypher: commits, PRs, issues
```

### 8.3 Responsibility contract

| Layer | Owns | Must not |
|---|---|---|
| Controllers | Routing, DTO binding, HTTP semantics | Contain Cypher or business logic |
| Services | Orchestration, grouping/ranking, mapping query results to response DTOs | Contain Cypher |
| Repositories | **All** Cypher, result normalization to typed records | Know about HTTP |
| DatabaseService | Driver lifecycle, session management, connectivity check, driver-error → exception mapping | Know about routes |
| Config | Env validation, typed config object | — |
| Filters | Standardized error responses, sanitization | — |
| DTOs | Validation rules (class-validator), response shapes | — |

### 8.4 Database service behavior

- Lazy driver creation on first use; `verifyConnectivity()` on startup with **3 retries / exponential backoff**.
- **Startup policy:** if the database is unreachable, the backend **starts degraded** (logs a warning, health reports `degraded`) rather than crashing. Every endpoint still responds — with a 503 that the frontend renders as a banner. This is the deliberate "graceful failure" demonstration.
- Query execution wrapped with a sane timeout (e.g., 10s) to avoid hung sessions.
- Driver error taxonomy: `ServiceUnavailable` (connection refused/timeouts) → `503 DATABASE_UNAVAILABLE`; syntax/constraint errors → `500 QUERY_FAILED`; never expose raw driver messages to clients (§18).
- Graceful shutdown: `app.enableShutdownHooks()` closes the driver on SIGTERM.

### 8.5 Configuration

`@nestjs/config` + a Joi validation schema at bootstrap. Missing/invalid env vars fail fast with a readable message (§19).

---

## 9. Next.js Architecture

### 9.1 Pages/routes

| Route | Purpose | Notes |
|---|---|---|
| `/` | Redirect → `/dashboard` | Tiny landing-free redirect keeps the app focused |
| `/dashboard` | Repository overview (Journey A) | Stats cards, recent commits, open PRs/issues, CTA "Open Graph" |
| `/explorer` | **Combined** graph + details + dependencies + impact (Journeys B/C/D) | `?node=<id>` deep-link support for the demo |

> **Decision → Reason** — The brief's four routes (`/dashboard`, `/graph`, `/dependencies`, `/impact`) are **combined into two**. The primary user story is a single continuous flow (select → inspect → analyze); splitting it across pages adds navigation that hurts the demo. Impact results live in a slide-over panel on the explorer rather than a separate page. A standalone shareable impact report page is a P1 candidate.

### 9.2 Key libraries

- **Next.js (App Router, TypeScript)** — assumption: latest stable (15.x) at build time.
- **Tailwind CSS + shadcn/ui** — component primitives (Card, Tabs, Button, Badge, Dialog, Skeleton, Tooltip, ScrollArea).
- **React Flow** (`@xyflow/react`, v12+) — graph canvas.
- **TanStack Query** (v5) — server state: caching, loading/error states, retries, stale-while-revalidate.

> **Decision → Reason** — TanStack Query is worth one dependency: it delivers the required loading/empty/error states and dedupes requests (e.g., graph + impact refetch) with ~30 lines of hooks. No global store (zustand/redux) — the only cross-cutting UI state is the selected node, which lives in the explorer page's React state.

### 9.3 Major components

```text
app/layout.tsx                    # shell, theme, fonts
app/dashboard/page.tsx            # server component that fetches once + client children
  ├── DashboardHeader
  ├── RepositoryStats             # stats cards (files, classes, functions, tests, commits, PRs, issues)
  ├── RecentChangesList           # latest commits + open PRs/issues
  └── QuickActions                # "Open Graph", "View Impact" (deep link)
app/explorer/page.tsx             # client page — owns selection state
  ├── ExplorerHeader              # entity breadcrumb, search (P1), theme
  ├── GraphCanvas                 # React Flow wrapper
  │   ├── GraphNode               # custom node (label, type badge, impact styling)
  │   ├── GraphControls           # zoom/fit/reset/expand/collapse/legend
  │   └── GraphLegend             # impact color legend
  ├── NodeDetailsPanel            # right panel: properties + relationship tabs
  │   ├── RelationshipList        # deps/dependents/callers lists
  │   ├── TestsTab
  │   └── HistoryTab
  └── ImpactPanel                 # slide-over: Analyze Impact
      ├── ImpactSummary           # HIGH/MEDIUM/LOW groups + counts
      ├── ImpactPathList          # per-node explanation paths
      └── ImpactTestCoverage      # affected tests
common/
  ├── LoadingState                # skeletons (Skeleton primitives)
  ├── EmptyState                  # icon + message + action
  └── ErrorState                  # icon + message + Retry
lib/
  ├── api.ts                      # typed fetch wrapper, error normalization
  ├── queries.ts                  # TanStack Query hooks per endpoint
  ├── toReactFlow.ts              # node/edge → React Flow layout + styling
  └── types.ts                    # response DTO mirrors
```

### 9.4 State ownership

| State | Owner | Persistence |
|---|---|---|
| Server data (stats, graph, relationships, impact) | TanStack Query cache | Query-keyed, invalidated on demand |
| Selected node id | Explorer page state (`useState`) | URL `?node=` (deep link, demo-friendly) |
| Graph viewport (zoom/pan) | React Flow internal + `fitView` on demand | Session only |
| Expanded neighborhoods | Explorer page state (set of node ids) | Session only |
| Impact results | TanStack Query (keyed by node + depth) | Cache |

**API interaction strategy:** all data flows through `lib/api.ts` → `GET /api/*`. No direct CognoDB access, no server components fetching the backend at build time (avoids SSR/build-time DB dependencies). Data fetching is client-side only.

---

## 10. Graph Schema

### 10.1 Critical review of the proposed model

The proposed model is a good starting point. Changes made and why:

| Proposed element | Verdict | Change |
|---|---|---|
| `Function -[:CALLS]-> Function` | **Keep, elevate to primary edge** | All code-level impact traverses this edge (D1) |
| `File -[:CONTAINS]-> Function` and `File -[:CONTAINS]-> Class` | **Refine** | Methods belong to classes: `Class -[:CONTAINS]-> Function`; `File -[:CONTAINS]-> Function` only for top-level functions (e.g., `main.ts`) |
| `Test -[:TESTS]-> Function` | **Keep** | Tests always target a *function* (the tested method). Class-level test classes test their methods' functions — no separate `TESTS -> Class` edge needed (avoids mixed-target queries) |
| `File -[:IMPORTS]-> File` | **Keep, optional** | File-level with `importedSymbols` property. Realistic `Import` nodes with `RESOLVES_TO` are the production refinement — **out of scope** |
| `Issue -[:RELATED_TO]-> PullRequest` | **Replace** | `RELATED_TO` is directionless and vague. Use `Issue -[:RESOLVED_BY]-> PullRequest` (directed: the PR fixes the issue). A PR can also have `RELATES_TO` if needed — not needed for P0 |
| `Commit -[:AUTHORED_BY]-> Developer` | **Keep** | Direction chosen for natural "who authored this commit" reads. Consistent direction matters more than the choice |
| `Commit -[:MODIFIES]-> File` | **Keep** | With `changeType: added\|modified\|deleted` property on the relationship |
| `PullRequest -[:CONTAINS]-> Commit` | **Keep** | |
| `Repository -[:CONTAINS]-> Directory` and `Directory -[:CONTAINS]-> File` | **Keep** | Nested containment gives a natural 1–2 hop hierarchy and demonstrates labeled traversal |
| `Class -[:EXTENDS]-> Class` | **Keep, small** | 1–2 seed instances to show inheritance |

### 10.2 Redundant relationships to avoid (explicit)

- ❌ `Class -[:DEPENDS_ON]-> Class` — derivable by aggregating function-level `CALLS`.
- ❌ `File -[:DEPENDS_ON]-> File` — derivable from `CALLS` (via contained functions) + `IMPORTS`.
- ❌ `Issue -[:RELATED_TO]-> PR` **and** `Issue -[:RESOLVED_BY]-> PR` — one canonical edge only.
- ❌ Stored "impact"/"affectedBy" edges — impact is **computed at query time**, never materialized (staleness is the failure mode of closure tables in SQL; the graph avoids it by design).
- ❌ `Commit -[:MODIFIES]-> Function` — file granularity is sufficient; function-level diffing is a P2 refinement.
- ❌ `Test -[:TESTS]-> File` — redundant with containment + `TESTS -> Function`.
- ❌ `Developer -[:AUTHORED]-> PR` — derivable via commits.

### 10.3 Final graph model (mermaid — reused verbatim in the README)

```mermaid
erDiagram
    Repository ||--o{ Directory : CONTAINS
    Directory  ||--o{ File      : CONTAINS
    File       ||--o{ Class     : CONTAINS
    File       ||--o{ Function  : CONTAINS
    Class      ||--o{ Function  : CONTAINS
    File       o{--o{ File      : IMPORTS
    Function   o{--o{ Function  : CALLS
    Class      o|--o| Class     : EXTENDS
    Test       o{--o{ Function  : TESTS
    Commit     o{--o{ File      : MODIFIES
    PullRequest ||--o{ Commit   : CONTAINS
    Issue      o|--o| PullRequest : RESOLVED_BY
    Commit     o{--|| Developer : AUTHORED_BY
```

### 10.4 Node labels (10) and relationship types (12)

**Labels (PascalCase):** `Repository`, `Directory`, `File`, `Function`, `Class`, `Test`, `Commit`, `PullRequest`, `Issue`, `Developer`

**Relationship types (UPPER_SNAKE_CASE):** `CONTAINS`, `IMPORTS`, `CALLS`, `EXTENDS`, `TESTS`, `MODIFIES`, `AUTHORED_BY`, `RESOLVED_BY`

(`CONTAINS` is reused across all containment levels; direction is always owner → member.)

### 10.5 Per-relationship specification

| Relationship | Direction | Purpose | Key properties | Why it belongs in a graph | Required? |
|---|---|---|---|---|---|
| `Repository -[:CONTAINS]-> Directory` | owner→member | Root of containment hierarchy | — | Anchor for "everything in this repo" traversals | Yes (1 root) |
| `Directory -[:CONTAINS]-> File` | owner→member | File organization | — | Enables path-based hierarchy traversal | Yes |
| `File -[:CONTAINS]-> Class` | owner→member | Class→file membership | — | Climb from class to file for history joins | Yes |
| `File -[:CONTAINS]-> Function` | owner→member | Top-level functions only | — | Uniform "functions belong somewhere" for CALLS endpoints | Yes (few nodes) |
| `Class -[:CONTAINS]-> Function` | owner→member | Method membership | `visibility` | Enables class-level impact via contained methods (D1) | Yes |
| `File -[:IMPORTS]-> File` | importer→imported | Module dependency | `importedSymbols: [String]`, `external: Boolean` | Direct file-level dependency view; one hop | Optional (cuttable) |
| `Function -[:CALLS]-> Function` | caller→callee | **Primary code edge** | `callCount: Int` (static occurrences) | Powers all impact traversal | **Yes — core** |
| `Class -[:EXTENDS]-> Class` | subclass→superclass | Inheritance | — | Shows inheritance; extends impact semantics (subclass changes affect parents' callers) | Optional (small) |
| `Test -[:TESTS]-> Function` | test→tested fn | Coverage | `testType: unit\|integration\|e2e`, `status: passing\|failing` | Instant "which tests break if this changes" | Yes |
| `Commit -[:MODIFIES]-> File` | commit→file | Change history | `changeType: added\|modified\|deleted` | Bridges code↔history in one query | Yes |
| `PullRequest -[:CONTAINS]-> Commit` | pr→commit | PR composition | — | PR ↔ code linkage for related-changes | Yes |
| `Issue -[:RESOLVED_BY]-> PullRequest` | issue→pr | Issue resolution | — | Related-changes story (Jira/GitHub) | Yes |
| `Commit -[:AUTHORED_BY]-> Developer` | commit→dev | Authorship | — | Developer attribution | Yes |

### 10.6 Naming conventions (binding)

| Concern | Convention | Example |
|---|---|---|
| Labels | PascalCase | `Class`, `PullRequest` |
| Relationship types | UPPER_SNAKE_CASE | `RESOLVED_BY` |
| Properties | camelCase | `linesOfCode`, `committedAt` |
| IDs | Stable, human-readable, namespaced: `<label>:<unique>` | `class:PaymentService`, `file:src/payments/payment.service.ts`, `function:PaymentService.charge`, `test:PaymentServiceTest.charge_returns_intent`, `commit:a1b2c3`, `pr:42`, `issue:12`, `developer:alice` |
| Timestamps | ISO-8601 UTC strings | `2026-06-14T09:30:00Z` |
| Names | Human-readable display names | `PaymentService`, `charge()` |
| Constraint | Unique `id` per node (if CognoDB supports it) | Verify against CognoDB (see Assumptions) |

> **Decision → Reason** — Stable, namespaced, human-readable IDs make the seed script idempotent (MERGE on `id`), make deep links beautiful (`/explorer?node=class:PaymentService`), and make every query readable in logs. Random UUIDs were rejected: they add zero value here and destroy debuggability.

---

## 11. Node Property Definitions

Minimal by design. **Rule:** a property must be displayed, used in a query, or used for grouping. Everything else is cut. (Assessment dataset stays small — well under CognoDB free-tier limits.)

| Node | Properties (minimal schema) | Notes |
|---|---|---|
| `Repository` | `id`, `name`, `description`, `defaultBranch` | Single instance in the assessment |
| `Directory` | `id`, `name`, `path`, `depth` | `path` = full repo-relative path |
| `File` | `id`, `name`, `path`, `language`, `linesOfCode` | `path` used for history joins |
| `Class` | `id`, `name`, `visibility` (`public`/`internal`), `kind` (`service`/`controller`/`client`/`repository`/`strategy`/`model`) | `kind` drives grouping + node badge styling |
| `Function` | `id`, `name`, `signature` (readable e.g. `charge(cardToken: string, amountCents: number): PaymentIntent`), `visibility`, `linesOfCode` | `name` may include class prefix for display: `charge()` |
| `Test` | `id`, `name`, `testType` (`unit`/`integration`/`e2e`), `status` (`passing`/`failing`) | One node per test method |
| `Commit` | `id`, `hash` (short), `message`, `committedAt` | |
| `PullRequest` | `id`, `number`, `title`, `status` (`open`/`merged`/`closed`), `createdAt`, `mergedAt?` | |
| `Issue` | `id`, `number`, `title`, `status` (`open`/`resolved`/`closed`), `priority` (`low`/`medium`/`high`/`critical`), `createdAt` | |
| `Developer` | `id`, `name`, `email`, `role` (`backend`/`fullstack`/`frontend`) | `avatarUrl` is P1 polish, not needed |

**Optional properties on relationships:** `CALLS.callCount`, `IMPORTS.importedSymbols`, `IMPORTS.external`, `MODIFIES.changeType`, `TESTS.testType/status` (kept on the test node instead of the edge — decision: test metadata lives with the test, the edge stays minimal).

---

## 12. Seed-Data Design

### 12.1 Domain

A fictional **Commerce Platform** monorepo (`commerce-platform`, ~2 years old, 3 developers, 7 PRs, 6 issues, 24 commits). The domain is realistic enough that a developer immediately recognizes service boundaries, controllers, clients, and repositories.

### 12.2 Node inventory (approximate)

| Label | Count | Examples |
|---|---|---|
| Repository | 1 | `commerce-platform` |
| Directory | 8 | `src/payments`, `src/orders`, `src/auth`, `src/users`, `src/notifications`, `src/database`, `src/ledger`, `src/config` |
| File | 28 | `payment.service.ts`, `stripe.client.ts`, `checkout.service.ts`, `main.ts` |
| Class | 17 | `PaymentService`, `CheckoutService`, `OrderService`, `RefundService`, `NotificationService`, `StripeClient`, `DatabaseService`, `LedgerService`, `AuthService`, `UserService`, `EmailTemplateService`, `OrderRepository`, `UserRepository`, `PaymentController`, `OrderController`, `AuthController`, `StripeWebhookController` |
| Function | ~48 | `PaymentService.charge()`, `PaymentService.refund()`, `CheckoutService.completeCheckout()`, `OrderService.createOrder()`, `RefundService.processRefund()`, `LedgerService.recordRefund()`, `StripeWebhookController.handleStripeEvent()`, `bootstrap()` |
| Test | ~18 | `PaymentServiceTest.charge_returns_intent`, `PaymentServiceTest.refund_records_ledger_entry`, `CheckoutServiceTest.complete_checkout_creates_order_and_sends_receipt` (integration), `OrderServiceTest.create_order_persists_order`, `LedgerServiceTest.record_refund_writes_entry`, `StripeClientTest.create_payment_intent_calls_stripe` (integration) |
| Commit | 24 | `feat: sync refunds to ledger`, `fix: dedupe stripe idempotency keys`, `refactor: extract payment state machine` |
| PullRequest | 7 | #42 "feat: sync refunds to ledger", #38 "feat: email receipts on checkout", #35 "fix: stripe idempotency keys", #31 "refactor: unify user session handling", #29 "feat: order status webhooks", #26 "chore: structured logging", #24 "fix: retry database connections" |
| Issue | 6 | #12 "Refunds not recorded in ledger" (high), #8 "Duplicate stripe charges on retry" (critical), #6 "Orders stuck in pending when webhook missed" (high), #9 "Customers don't get email receipts" (medium), #5 "Intermittent DB connection failures" (medium), #3 "Checkout times out under load" (low) |
| Developer | 3 | `alice` (Alice Chen, senior backend), `bob` (Bob Rivera, fullstack), `priya` (Priya Patel, frontend) |
| **Total** | **~153 nodes** | |

### 12.3 Relationship inventory (approximate)

| Relationship | Count | Notes |
|---|---|---|
| CONTAINS (repo→dir, dir→file, file→class, file→fn, class→fn) | ~115 | |
| IMPORTS | ~30 | |
| CALLS | ~42 | |
| EXTENDS | 2 | e.g., `UserRepository extends BaseRepository` |
| TESTS | ~18 | |
| MODIFIES | ~35 | 24 commits × ~1.5 files avg |
| PR CONTAINS Commit | 7 | |
| Issue RESOLVED_BY PR | 5 | 5 of 6 issues resolved |
| Commit AUTHORED_BY Developer | 24 | |
| **Total** | **~280 relationships** | |

> **Decision → Reason** — ~150 nodes / ~280 edges is small enough for CognoDB's free tier, big enough to make 3-hop traversals non-trivial, and hand-authored so every relationship is intentional and explainable in the demo. No synthetic/random generation — determinism and realism beat scale here (D6).

### 12.4 Important dependency chains

**Chain 1 — The flagship (PaymentService blast radius):**
```text
PaymentService.charge()
   ├─→ CheckoutService.completeCheckout()          (1 hop)
   │      ├─→ OrderService.createOrder()           (2 hops)
   │      │      └─→ OrderRepository.save()        (3 hops)
   │      └─→ NotificationService.sendOrderConfirmation()  (2 hops)
   │             └─→ EmailTemplateService.renderReceiptEmail() (3 hops)
   ├─→ RefundService.processRefund()               (1 hop)
   │      └─→ LedgerService.recordRefund()         (2 hops)
   ├─→ StripeClient.createPaymentIntent()          (1 hop)
   └─→ DiscountService.apply()                     (1 hop)
```
Direct callers into `PaymentService.charge()`: `PaymentController.postCharge()`, `CheckoutService.completeCheckout()`.
Test coverage of the blast radius: `PaymentServiceTest` (direct), `CheckoutServiceTest` (integration, transitive), `OrderServiceTest` (transitive), `NotificationServiceTest` (transitive).

**Chain 2 — The deliberately "hidden coupling" (demo's surprise beat):**
```text
StripeWebhookController.handleStripeEvent()        (the webhook entry point)
   └─→ PaymentService.refund()
          └─→ RefundService.processRefund()
                 └─→ LedgerService.recordRefund()
                        └─→ DatabaseService.upsert()
```
**Demo narrative:** a developer who only greps "who calls `PaymentService`" sees `PaymentController` and `RefundService`. The graph reveals that changing `LedgerService.recordRefund()` breaks a **webhook path** three hops away — and, via `PaymentServiceTest.refund_records_ledger_entry`, a **payment test** — a coupling invisible to a file-by-file IDE inspection. This chain is the "relational-awkwardness" story made visceral.

**Chain 3 — Fan-out / diamond (ranking demo):**
`CheckoutService.completeCheckout()` calls `OrderService.createOrder()`, `PaymentService.charge()`, `NotificationService.sendOrderConfirmation()`, and `OrderRepository.save()` — a diamond through which a change to `OrderService.createOrder()` fans out to tests, notifications, and payments. Nodes reachable via multiple distinct paths rank higher in impact (fan-in weighting, §14).

### 12.5 Demo scenarios the seed must support

| Scenario | Seed requirement |
|---|---|
| 1-hop impact | `PaymentService` → `CheckoutService`, `RefundService`, `PaymentController`, `StripeClient` |
| 2-hop impact | `PaymentService` → `OrderService`, `NotificationService`, `LedgerService` |
| 3-hop impact | `PaymentService` → `OrderRepository`, `EmailTemplateService`, `DatabaseService` |
| Hidden coupling | `LedgerService` change → `StripeWebhookController` path + payment test (Chain 2) |
| Test coverage | Changing `PaymentService.charge` surfaces direct + transitive tests |
| Related changes | `PaymentService` → PR #42, #35, #29 → issues #12, #8, #6 |
| Hierarchy | `Repository → Directory → File → Class → Function` drill-down |
| Inheritance | `UserRepository extends BaseRepository` |

### 12.6 Seed script contract

- **Location:** `apps/api/seed/` — a standalone TS script run via `npm run seed` (root workspace script).
- **Idempotent:** every node/edge uses `MERGE` on the stable `id` (+ `MERGE ... ON CREATE SET` / `ON MATCH SET` for properties) → running twice yields identical state.
- **Deterministic:** fixed fixture data, fixed timestamps. No randomness. Identical screenshots across runs.
- **Transactional-ish:** wrapped in a single session; on failure, clear error message and nonzero exit.
- **Verification pass:** after seeding, the script runs a few count assertions (e.g., `PaymentService` impact at depth 3 returns expected HIGH/MEDIUM/LOW counts) and prints a summary table — this doubles as the database smoke test.
- **Optional `--reset`:** `MATCH (n) DETACH DELETE n` before seeding (guarded, explicit flag only).

---

## 13. Cypher Query Catalog

**Binding rules**
1. Every query is **parameterized** — values always via `$param`.
2. Labels, relationship types, and **variable-length hop bounds cannot be parameterized** in openCypher. Hop counts are therefore validated server-side against a whitelist (`1..5`) and interpolated as literal integers. This is the one sanctioned exception; it is implemented in the repository layer only.
3. Queries target **openCypher-safe constructs** — no `CALL {}` subqueries, no `EXISTS{}`/`COUNT{}` subqueries (Neo4j-specific). Where aggregation needs multiple patterns, use `OPTIONAL MATCH` + `count(DISTINCT …)` or compose queries in the service. Verify remaining dialect gaps during integration (Assumptions A5/A6).
4. Draft Cypher below is **reference design**, not final application code. It is intentionally close to runnable so implementation has a starting point; final tuning happens against CognoDB.

> **Decision → Reason** — Writing reference Cypher in the spec accelerates implementation from "design queries" to "verify and wire queries," which is the fastest safe path inside 48 hours. The "reference, not final" label preserves the architect's obligation to validate against the real engine.

### Q1 `getRepositoryOverview` — repository stats
- **Purpose:** dashboard numbers (Journey A).
- **Inputs:** `$repositoryId`
- **Involved:** `Repository`, `Directory`, `File`, `Class`, `Function`, `Test`, `Commit`, `PullRequest`, `Issue`
- **Hops:** 1–3 (containment chain); **why graph:** one query over a hierarchy that in SQL is a recursive CTE or three joined tables.
- **Shape:** `{ repository, directoryCount, fileCount, classCount, functionCount, testCount, commitCount, prCount, issueCount }`

```cypher
MATCH (repo:Repository {id: $repositoryId})
OPTIONAL MATCH (repo)-[:CONTAINS]->(dir:Directory)
OPTIONAL MATCH (dir)-[:CONTAINS]->(file:File)
OPTIONAL MATCH (file)-[:CONTAINS]->(class:Class)
OPTIONAL MATCH (file)-[:CONTAINS]->(topFn:Function)
OPTIONAL MATCH (class)-[:CONTAINS]->(method:Function)
OPTIONAL MATCH (t:Test)-[:TESTS]->(:Function)
OPTIONAL MATCH (c:Commit)-[:MODIFIES]->(:File)
OPTIONAL MATCH (pr:PullRequest)
OPTIONAL MATCH (i:Issue)
RETURN repo,
       count(DISTINCT dir)  AS directoryCount,
       count(DISTINCT file) AS fileCount,
       count(DISTINCT class) AS classCount,
       count(DISTINCT topFn) + count(DISTINCT method) AS functionCount,
       count(DISTINCT t)   AS testCount,
       count(DISTINCT c)   AS commitCount,
       count(DISTINCT pr)  AS prCount,
       count(DISTINCT i)   AS issueCount
```

### Q2 `getRepositoryGraph` — code graph for canvas + dashboard thumbnail
- **Purpose:** initial explorer view and dashboard thumbnail (Journeys A/B).
- **Inputs:** `$repositoryId`
- **Involved:** `Repository`, `Directory`, `File`, `Class`, `Function` + `CONTAINS`, `CALLS`, `IMPORTS`, `EXTENDS`
- **Hops:** 1–3; **why graph:** returns the subgraph in one traversal.
- **Shape:** `{ nodes: [{id, label, properties}], edges: [{from, to, type, properties}] }` (History entities intentionally excluded — canvas shows code only; see §17.)
- **Reference sketch** (edge collection normalized in the repository layer):

```cypher
MATCH (repo:Repository {id: $repositoryId})-[:CONTAINS*1..2]->(d:Directory)-[:CONTAINS]->(file:File)
OPTIONAL MATCH (file)-[:CONTAINS]->(class:Class)
OPTIONAL MATCH (file)-[:CONTAINS]->(topFn:Function)
OPTIONAL MATCH (class)-[:CONTAINS]->(method:Function)
OPTIONAL MATCH (file)-[imp:IMPORTS]->(target:File)
OPTIONAL MATCH (class)-[:EXTENDS]->(parent:Class)
OPTIONAL MATCH (topFn)-[call:CALLS]->(callee:Function)
OPTIONAL MATCH (method)-[call2:CALLS]->(callee2:Function)
RETURN collect(DISTINCT d) AS directories,
       collect(DISTINCT file) AS files,
       collect(DISTINCT class) AS classes,
       collect(DISTINCT topFn) AS topFunctions,
       collect(DISTINCT method) AS methods,
       collect(DISTINCT {from: startNode(imp).id, to: endNode(imp).id, type: 'IMPORTS', props: properties(imp)}) AS imports,
       collect(DISTINCT {from: startNode(call).id, to: endNode(call).id, type: 'CALLS'}) AS calls,
       collect(DISTINCT {from: startNode(call2).id, to: endNode(call2).id, type: 'CALLS'}) AS methodCalls,
       collect(DISTINCT {from: class.id, to: parent.id, type: 'EXTENDS'}) AS extendsEdges
```

### Q3 `getNodeById` — entity details
- **Purpose:** details panel header + properties (Journeys B/C).
- **Inputs:** `$id`
- **Involved:** any label; **hops:** 0 (single node); **why graph:** uniform lookup over heterogeneous types.
- **Shape:** `{ id, labels, properties }`
- **Errors:** empty result → 404 in service.

```cypher
MATCH (n {id: $id})
RETURN n, labels(n) AS labels
LIMIT 1
```

### Q4 `getNodeRelationships` — neighborhood (depth 1, mixed)
- **Purpose:** expand a node's neighborhood on the canvas; details panel "all relationships" (Journeys B/C).
- **Inputs:** `$id`
- **Involved:** all relationship types; **hops:** 1; **why graph:** in/out edges of heterogeneous types in one query.
- **Shape:** `{ relationships: [{ type, direction, node: {id, labels, properties}, relProps }] }`

```cypher
MATCH (n {id: $id})
OPTIONAL MATCH (n)-[r]->(m)
OPTIONAL MATCH (m2)-[r2]->(n)
RETURN collect(DISTINCT {type: type(r), direction: 'OUT', node: m, relProps: properties(r)}) +
       collect(DISTINCT {type: type(r2), direction: 'IN', node: m2, relProps: properties(r2)}) AS relationships
```

### Q5 `getDependencies` — what the entity calls/imports
- **Purpose:** Journey C "Dependencies" tab.
- **Inputs:** `$id`
- **Involved:** `CALLS` (+ `IMPORTS` for files), collapsed to owning `Class`/`File`.
- **Hops:** 1–2 (fn → callee → owner); **why graph:** aggregation by containment is a pattern-match, not a join.
- **Shape:** `{ dependencies: [{ target: {id, name, kind}, via: [functionIds], callCount }] }`

```cypher
MATCH (n {id: $id})
OPTIONAL MATCH (n)-[:CONTAINS*1..2]->(srcFn:Function)-[c:CALLS]->(callee:Function)
OPTIONAL MATCH (callee)<-[:CONTAINS]-(owner:Class)
OPTIONAL MATCH (callee)<-[:CONTAINS]-(ownerFile:File)
OPTIONAL MATCH (n)-[imp:IMPORTS]->(imported:File)
RETURN collect(DISTINCT {targetId: coalesce(owner.id, ownerFile.id), targetName: coalesce(owner.name, ownerFile.name),
                         targetKind: coalesce(owner.kind, 'file'), via: [srcFn.id], callCount: c.callCount}) AS dependencies
       -- (dedupe/aggregate by target in the service layer)
```

### Q6 `getDependents` — who depends on the entity (CALLS + IMPORTS incoming)
- **Purpose:** Journey C "Dependents" tab.
- **Inputs:** `$id`; **hops:** 1–2 (caller → owner). Symmetric to Q5 with reversed arrow.

### Q7 `getCallers` — who calls the entity's functions, aggregated to classes
- **Purpose:** Journey C "Callers" tab — the classic "who uses this" question.
- **Inputs:** `$id`; **hops:** 1–2; **why graph:** direct answer to "who references me" that in SQL requires a reverse FK scan per function.
- **Shape:** `{ callers: [{ caller: {id, name, kind}, via: [fnIds] }] }`

```cypher
MATCH (n {id: $id})
OPTIONAL MATCH (n)-[:CONTAINS*1..2]->(fn:Function)<-[c:CALLS]-(callerFn:Function)
OPTIONAL MATCH (callerFn)<-[:CONTAINS]-(caller:Class)
OPTIONAL MATCH (callerFn)<-[:CONTAINS]-(callerFile:File)
RETURN collect(DISTINCT {callerId: coalesce(caller.id, callerFile.id),
                         callerName: coalesce(caller.name, callerFile.name),
                         callerKind: coalesce(caller.kind, 'file'),
                         via: [callerFn.id]}) AS callers
```

### Q8 `getTestsForEntity` — tests that directly exercise the entity
- **Purpose:** Journey C "Tests" tab.
- **Inputs:** `$id`; **hops:** 1–2 (`Test -[:TESTS]-> Function` under the entity); **why graph:** coverage as an edge.
- **Shape:** `{ tests: [{ id, name, testType, status }] }`

```cypher
MATCH (n {id: $id})
OPTIONAL MATCH (n)-[:CONTAINS*1..2]->(fn:Function)<-[:TESTS]-(test:Test)
RETURN collect(DISTINCT test {.id, .name, .testType, .status}) AS tests
```

### Q9 `getRecentChanges` — commits touching the entity (or repo-wide)
- **Purpose:** Journey C "History" tab.
- **Inputs:** `$id` (or `$repositoryId` for repo-wide); **hops:** 1–3 (`Commit -[:MODIFIES]-> File` containing entity); **why graph:** code↔history bridge.
- **Shape:** `{ commits: [{ id, hash, message, committedAt, author: {id, name} }] }` ordered desc.

```cypher
MATCH (n {id: $id})
OPTIONAL MATCH (n)-[:CONTAINS*1..3]->(file:File)<-[:MODIFIES]-(commit:Commit)
OPTIONAL MATCH (commit)-[:AUTHORED_BY]->(dev:Developer)
RETURN collect(DISTINCT {id: commit.id, hash: commit.hash, message: commit.message,
                         committedAt: commit.committedAt, author: {id: dev.id, name: dev.name}}) AS commits
```

### Q10 `getRelatedPullRequests` — PRs whose commits touched the entity
- **Purpose:** Journey C "History" / impact "Related changes".
- **Inputs:** `$id`; **hops:** 1–4 (`PR -[:CONTAINS]-> Commit -[:MODIFIES]-> File ← CONTAINS entity`); **why graph:** 4-hop join chain in SQL; one pattern here.
- **Shape:** `{ pullRequests: [{ id, number, title, status }] }`

```cypher
MATCH (n {id: $id})
OPTIONAL MATCH (n)-[:CONTAINS*1..3]->(file:File)<-[:MODIFIES]-(commit:Commit)<-[:CONTAINS]-(pr:PullRequest)
RETURN collect(DISTINCT pr {.id, .number, .title, .status}) AS pullRequests
```

### Q11 `getRelatedIssues` — issues tied to the entity's PRs/commits
- **Purpose:** Journey C "History" / impact "Related issues".
- **Inputs:** `$id`; **hops:** 1–5 (`Issue -[:RESOLVED_BY]-> PR -[:CONTAINS]-> Commit -[:MODIFIES]-> File ← CONTAINS entity`); **why graph:** heterogeneous 5-hop pattern in one query.
- **Shape:** `{ issues: [{ id, number, title, status, priority }] }`

```cypher
MATCH (n {id: $id})
OPTIONAL MATCH (n)-[:CONTAINS*1..3]->(file:File)<-[:MODIFIES]-(commit:Commit)<-[:CONTAINS]-(pr:PullRequest)<-[:RESOLVED_BY]-(issue:Issue)
RETURN collect(DISTINCT issue {.id, .number, .title, .status, .priority}) AS issues
```

### Q12 `getImpactAnalysis` — **the flagship multi-hop traversal**
- **Purpose:** find all functions affected by changing the entity, collapsed to owners, ranked by level (§14).
- **Inputs:** `$id`, `$depth` (whitelisted literal, default 3)
- **Involved:** `CONTAINS`, `CALLS*1..depth`, `CONTAINS` (collapse); **hops:** variable 1..depth — **multi-hop by design**.
- **Why graph:** variable-length traversal **with captured paths** — the relational-awkwardness showcase. In SQL: recursive CTE plus a path-accumulation column; in a graph: one pattern.
- **Shape:** rows `{ functionId, functionName, classId, className, fileId, filePath, minHops, pathCount, samplePaths }`

```cypher
MATCH (source {id: $id})
OPTIONAL MATCH (source)-[:CONTAINS*1..2]->(srcFn:Function)
WITH source, collect(DISTINCT srcFn) AS srcFns
UNWIND (CASE WHEN size(srcFns) = 0 THEN [null] ELSE srcFns END) AS srcFn
OPTIONAL MATCH path = (srcFn)-[:CALLS*1..3]->(affectedFn:Function)
WHERE NOT affectedFn IN srcFns
WITH source, affectedFn,
     min(length(path)) AS minHops,
     collect(DISTINCT [n IN nodes(path) | n.id]) AS paths
WHERE affectedFn IS NOT NULL
OPTIONAL MATCH (affectedFn)<-[:CONTAINS]-(class:Class)
OPTIONAL MATCH (affectedFn)<-[:CONTAINS]-(file:File)
RETURN source.id AS sourceId,
       affectedFn.id AS functionId,
       affectedFn.name AS functionName,
       class.id AS classId, class.name AS className, class.kind AS classKind,
       file.id AS fileId, file.path AS filePath,
       minHops, size(paths) AS pathCount,
       [p IN paths[0..5] | p] AS samplePaths
ORDER BY minHops, pathCount DESC
```

### Q13 `getImpactTests` — tests affected by the impact set
- **Purpose:** "which tests break" — direct and transitive.
- **Inputs:** `$id`, `$depth`
- **Involved:** `TESTS` + the impact call graph; **hops:** 1 + depth; **why graph:** `(test)-[:TESTS]->(fn)-[:CALLS*..]->(srcFn)` is one pattern; in SQL this is the recursive closure again.
- **Shape:** `{ tests: [{ id, name, testType, status, indirect: boolean }] }`

```cypher
MATCH (source {id: $id})
OPTIONAL MATCH (source)-[:CONTAINS*1..2]->(srcFn:Function)
WITH source, collect(DISTINCT srcFn) AS srcFns
MATCH (test:Test)-[:TESTS]->(targetFn:Function)
WHERE targetFn IN srcFns
      OR EXISTS((targetFn)-[:CALLS*1..3]->(srcFn2:Function) WHERE srcFn2 IN srcFns)  -- see note
RETURN test {.id, .name, .testType, .status},
       targetFn.id IN srcFns AS direct
```

> **Dialect note:** the `EXISTS { … WHERE … }` subquery form is Neo4j-specific. Integration must verify the CognoDB-equivalent (e.g., `EXISTS((targetFn)-[:CALLS*1..3]->(:Function))` restricted via a second MATCH, or composing with the Q12 result set in the service). This is a documented verification item, not a blocker — the service can join Q12's affected functions with Q8's tests in-memory as a fallback.

### Q14 `getImpactHistory` — PRs/issues touching affected files
- **Purpose:** "related changes" section of impact.
- **Inputs:** `$id`, `$depth`
- **Involved:** Q12 result set → `CONTAINS` → `File` → `MODIFIES`/`CONTAINS`/`RESOLVED_BY`; **hops:** variable.
- **Implementation note:** reuse Q10/Q11 patterns with `File.id IN $affectedFileIds` (passed from the service after Q12). Composing in the service keeps each query small and openCypher-safe.

### Explicit requirement: multi-hop traversal

**Q12** is the designated multi-hop traversal: `CALLS*1..3` from the source entity's functions, returning hop counts and captured paths. **Q13** (tests through the call graph) is a second multi-hop proof point. Both appear in the demo and README.

### Explicit requirement: relational awkwardness

- **Q12**: variable-depth traversal **with path capture**. SQL needs a recursive CTE (fixed-depth SQL shape changes when depth changes) or a maintained closure table (write-time cost + staleness); paths require string concatenation tricks. The graph returns paths natively.
- **Q11**: a 5-hop heterogeneous join (`Issue → PR → Commit → File ← Class`) that in SQL is five junction tables and a query shape that changes whenever you add a hop.
- **Q13**: transitive test coverage — "which tests fail if this changes, two levels down" — a recursive problem in SQL, a one-pattern match here.

---

## 14. Impact-Analysis Design

### 14.1 Specification

| # | Question | Decision |
|---|---|---|
| 1 | What entities can be analyzed? | Any `Class` (primary), `Function`, or `File`. The analysis is generic: resolve the entity → its contained functions → traverse. Classes are the demo focus because the seed's services are classes. |
| 2 | What relationships are traversed? | `CONTAINS` (source → its functions, and collapse affected functions → owner `Class`/`File`) and **`CALLS`** (the impact edge). `TESTS`, `MODIFIES`, `CONTAINS` (PR/commit/issue) are consulted for the tests/history sections. |
| 3 | Maximum traversal depth? | **Default 3, max 5**, server-enforced via whitelist (openCypher can't parameterize hop bounds). Depth 3 yields HIGH/MEDIUM/LOW tiers and demonstrates 1/2/3-hop results in one click. |
| 4 | Direct vs indirect? | `minHops == 1` → **direct**; `minHops >= 2` → **indirect**. Hop count comes from the captured path length in Q12. |
| 5 | Ranking / grouping? | Group by level: **HIGH** (1 hop), **MEDIUM** (2), **LOW** (3). Within a level, sort by `pathCount` (fan-in) desc, then by number of affected methods in the owner class (`changeSurface`) desc. Fan-in is a proxy for "more independent code paths reach this — higher breakage probability." |
| 6 | How are tests included? | Q13: direct tests (`TESTS` → the entity's own functions) plus transitive tests (tests whose target is reachable from the source through `CALLS`). Each test labeled `direct` / `indirect`. Count + list. |
| 7 | How are PRs/issues included? | Q14: distinct PRs/issues whose commits modified any **affected file** (files containing affected functions/classes). Count + list with status/priority. |
| 8 | What is displayed? | Source summary; HIGH/MEDIUM/LOW groups (each entity with name, kind, hop count, path count, one-line explanation); tests section (count + list, direct/indirect badges); related PRs and issues (counts + lists); all overlaid on the graph with color coding. |
| 9 | Graph visualization? | Source node: **pulsing blue ring**. Direct affected: **red fill**. Indirect: **amber** (2 hops) / **muted amber** (3). Unaffected: desaturated gray. `CALLS` edges on a shortest path from source to an affected node: **solid red** (direct) / **dashed amber** (indirect). Clicking an affected node highlights its shortest path and shows the explanation tooltip. Legend always visible (§17.7). |

### 14.2 Example result (PaymentService, depth 3)

```text
PaymentService

HIGH IMPACT (1 hop)
- CheckoutService        (via PaymentService.charge)          · 1 path · 1 method
- RefundService          (via PaymentService.charge, refund)  · 2 paths · 2 methods
- PaymentController      (via PaymentService.charge)          · 1 path · 1 method
- StripeClient           (via PaymentService.charge, refund)  · 2 paths · 2 methods

MEDIUM IMPACT (2 hops)
- OrderService           (via CheckoutService.completeCheckout) · 1 path · 1 method
- NotificationService    (via CheckoutService.completeCheckout) · 1 path · 1 method
- LedgerService          (via RefundService.processRefund)      · 1 path · 1 method

LOW IMPACT (3 hops)
- OrderRepository        · 1 path
- EmailTemplateService   · 1 path
- DatabaseService        · 1 path

TEST COVERAGE
- 8 tests affected (3 direct, 5 indirect)

RELATED CHANGES
- 3 pull requests (#42, #35, #29)

RELATED ISSUES
- 2 issues (#12 high, #8 critical)
```

### 14.3 Explanation format (per affected node)

**Rule — one sentence, path-first, hop count last:**

> `OrderService` is affected because `PaymentService.charge()` → `CheckoutService.completeCheckout()` → `OrderService.createOrder()` (2 hops, 1 path).

Format template: **"{OwnerName} is affected because {path string} ({hops} hop(s), {n} path(s))."** For fan-in > 1, show the two most distinct paths and "…and {k} more paths". The path string is `fn1 → fn2 → … → fnN` rendered from Q12's `samplePaths` (function display names with owning class when ambiguous). This is the "understand **why** they are affected" requirement — path capture is why a graph DB wins here.

### 14.4 Impact endpoint behavior

- `GET /api/impact?id=&depth=3` — idempotent, cacheable.
- Service orchestration: Q12 (traversal) → Q13 (tests) → Q14 (history) → group/rank in JS → response DTO. Two DB round-trips max (Q12+Q13 can share one, then Q14).
- Guardrails: unknown id → 404 before traversal; empty result → `impact: []` (not an error — honest "no impact within depth N").
- Complexity cap: depth 5 + `LIMIT` guards in Q12 (e.g., return top 200 affected functions) to protect CognoDB free tier.

---

## 15. REST API Contract

**Conventions:** global prefix `/api`; JSON; all GET; error shape defined in §18. `:id` values are the stable node IDs (`class:PaymentService`), URL-encoded.

| Method | Route | Purpose | Params | Request body | Response (200) | Errors |
|---|---|---|---|---|---|---|
| GET | `/api/health` | Liveness | — | — | `{ status: "ok" }` | — |
| GET | `/api/health/database` | CognoDB connectivity | — | — | `{ status: "ok"\|"degraded", latencyMs }` | 503 when degraded |
| GET | `/api/repository` | Repo overview + stats | — | — | `{ repository: {...}, stats: { directoryCount, fileCount, classCount, functionCount, testCount, commitCount, prCount, issueCount } }` | 503 DB down |
| GET | `/api/graph` | Code subgraph for canvas/thumbnail | `?scope=code` | — | `{ nodes: [...], edges: [...] }` | 503 |
| GET | `/api/nodes?id=` | Entity details | — | — | `{ id, labels, properties }` | 404, 400 (bad id) |
| GET | `/api/nodes/relationships?id=` | 1-hop in/out relationships | `?limit=` | — | `{ relationships: [...] }` (Q4) | 404, 503 |
| GET | `/api/nodes/dependencies?id=` | Outgoing CALLS/IMPORTS, collapsed | — | — | `{ dependencies: [...] }` (Q5) | 404, 503 |
| GET | `/api/nodes/dependents?id=` | Incoming CALLS/IMPORTS, collapsed | — | — | `{ dependents: [...] }` (Q6) | 404, 503 |
| GET | `/api/nodes/callers?id=` | Incoming CALLS aggregated to classes | — | — | `{ callers: [...] }` (Q7) | 404, 503 |
| GET | `/api/nodes/tests?id=` | Direct tests | — | — | `{ tests: [...] }` (Q8) | 404, 503 |
| GET | `/api/node-history/commits?id=` | Commits, PRs, issues touching entity | — | — | `{ commits: [...], pullRequests: [...], issues: [...] }` (Q9–Q11) | 404, 503 |
| GET | `/api/impact?id=` | **Analyze Impact** | `?depth=3` (1–5) | — | `{ source: {...}, impact: { high: [...], medium: [...], low: [...] }, tests: [...], pullRequests: [...], issues: [...] }` (§14.2) | 404, 400 (depth), 503 |

> **Decision → Reason** — REST with explicit resource endpoints (vs. a single generic `/graph` RPC). The explicit set maps 1:1 to UI tabs, is trivially demonstrable in the demo, and keeps DTO validation per-endpoint. `GET /impact?id=` is idempotent — no POST needed (no state mutation). Entity ids embed file paths with slashes, so they travel as **query params** (the AWS HTTP API decodes `%2F` out of path segments before the Lambda sees them). Search is deliberately **not** in the P0 contract (P1: `GET /api/search?q=`).

---

## 16. UI / Page Architecture

### 16.1 Page inventory (recap)

- `/dashboard` — Journey A: stats cards, recent commits, open PRs/issues, CTA cards ("Open Graph", "Analyze PaymentService" deep link).
- `/explorer?node=…` — Journeys B/C/D: canvas left (70%), details panel right (30%), impact slide-over.

### 16.2 Layout sketch

```text
┌─────────────────────────────────────────────────────────────────┐
│ ExplorerHeader  [PaymentService ▾]  [Search… (P1)]  [Theme]     │
├──────────────────────────────────────┬──────────────────────────┤
│ GraphCanvas (React Flow)             │ NodeDetailsPanel         │
│  • source node pulsing               │  • Properties            │
│  • affected: red/amber/gray          │  • Tabs: Dependencies ·  │
│  • edges colored by hop              │    Dependents · Callers ·│
│  • controls: zoom/fit/reset/expand   │    Tests · History       │
│  • legend (bottom-left)              ├──────────────────────────┤
│                                      │ [Analyze Impact ▸]  →    │
│                                      │ ImpactPanel (slide-over) │
└──────────────────────────────────────┴──────────────────────────┘
```

### 16.3 Component responsibilities

| Component | Responsibility |
|---|---|
| `GraphCanvas` | React Flow wrapper; builds nodes/edges via `toReactFlow`; handles fit/reset; forwards node click/expand events |
| `GraphNode` | Custom node: type badge (`service`, `controller`, `test`, …), name, impact styling (fill/border by level), pulse for source |
| `GraphControls` / `GraphLegend` | Zoom, fit, reset, expand/collapse, legend toggle |
| `NodeDetailsPanel` | Selected entity properties + relationship tabs (each tab = one query + own loading/empty/error) |
| `ImpactPanel` | "Analyze Impact" trigger, depth selector (1/3/5), result summary, path list, tests, PRs/issues |
| `LoadingState` / `EmptyState` / `ErrorState` | Reusable skeletons, empty messages with actions, error with Retry |
| `lib/toReactFlow.ts` | Pure function: API nodes/edges → React Flow nodes/edges (positioning, colors, selection state) |

### 16.4 Responsiveness & a11y

- Minimum viable responsiveness: desktop-first (dev tool), stack panels below 1024px.
- Keyboard: tab order through graph + panels; `Esc` closes slide-over; semantic labels on all state components. (Cheap and reads as "intentional UX".)

---

## 17. Graph UX Specification

### 17.1 Default state

- On open, the explorer shows the **code subgraph** (classes + files + top-level functions, `CALLS`/`IMPORTS`/`EXTENDS` edges) laid out with a deterministic layered layout (React Flow `layout` via dagre-style placement — manual x/y from `toReactFlow` for determinism).
- Services (`kind: service`) render as larger, labeled nodes; controllers/clients/repositories smaller. No history entities on canvas.
- Fit-to-view on first load; **never** "everything at once" beyond the code graph (the seed's ~70 drawn nodes is manageable; the design still caps display at ~150 nodes, §17.8).

> **Decision → Reason** — Default = whole code graph (small seed, useful overview), selection = neighborhood focus. The "everything at once" trap is avoided by (a) excluding history entities from the canvas and (b) entering **focus mode** on selection (§17.2).

### 17.2 Selected-node behavior

- Clicking a node selects it → details panel populates; canvas dims non-neighbors (1-hop in/out), the node gets a pulsing ring, and its neighborhood is emphasized.
- **Focus mode** (toggle, default on after selection): canvas shows the selected node + its 1-hop neighborhood; "Expand" adds the next hop of a chosen neighbor (re-query `neighborhood`).
- Selection updates the URL (`?node=…`) for deep links and back-button support.

### 17.3 Node details panel

- Right panel: properties (name, kind, signature/LOC, path), relationship tabs (§16.3), and the "Analyze Impact" entry.
- Panel is dismissible; selection cleared → panel hidden.

### 17.4 Zoom / pan / fit / reset

- Standard React Flow pan/zoom; **Fit** (fit-view on current node set), **Reset** (restore default code-graph view + fit). Both are buttons, not just gestures.

### 17.5 Expand / collapse neighborhood

- Expand: re-query `neighborhood` for a chosen node, add 1 hop to canvas, re-layout locally, keep current viewport.
- Collapse: remove a node's subtree from canvas (or "Collapse all" → return to default view). Expanded-node set is tracked in explorer state.

### 17.6 Highlighting

- Selection: ring + dimmed neighbors.
- Impact: color by level (§14.1 #9); hover on an affected node → highlight its **shortest path** from source + explanation tooltip; hover on source → highlight all first-hop edges.

### 17.7 Direct vs indirect impact visualization

- Source: pulsing blue ring. Direct (1 hop): solid red fill. Indirect 2 hops: amber; 3 hops: muted amber. Unaffected: desaturated.
- Edges: shortest-path edges red (direct) / dashed amber (indirect). Non-path edges stay gray.
- Legend (bottom-left, always available): blue pulse = analyzed entity; red = direct; amber = indirect; gray = unaffected; red/dashed = path edges.

### 17.8 Handling large graphs

- Display cap ~150 nodes; beyond that, default to **focus mode** and require explicit expansion (never auto-render the full set).
- Canvas shows code entities only; history entity *counts* appear as badges on files (e.g., "7 commits · 3 PRs") — clickable into the History tab. This keeps the canvas readable while preserving the graph-native data.
- Long path explanations are truncated in-list with a tooltip expansion.

---

## 18. Error-Handling Strategy

### 18.1 Error taxonomy (backend)

| Class | Trigger | HTTP | `code` | Response shape |
|---|---|---|---|---|
| Validation | DTO/param invalid (e.g., bad `depth`, malformed id) | 400 | `VALIDATION_ERROR` | `{ statusCode, message, code, details }` |
| Not found | Unknown node id | 404 | `NOT_FOUND` | `{ statusCode, message, code }` |
| DB unavailable | Driver connection refused / timeout | 503 | `DATABASE_UNAVAILABLE` | `{ statusCode, message, code, retryable: true }` |
| Query failure | Cypher syntax/execution error | 500 | `QUERY_FAILED` | `{ statusCode, message: "Query failed", code, retryable: true }` |
| Unexpected | Unhandled exception | 500 | `INTERNAL_ERROR` | `{ statusCode, message: "Internal server error", code }` |

**Sanitization rules (binding):**
- Clients **never** receive raw driver messages, connection strings, or credentials.
- Server-side: full error + stack + requestId logged; requestId included in the response for correlation.
- The `DatabaseService` owns the driver→exception mapping so no controller/service ever touches driver error types.

### 18.2 Frontend behavior

| Case | UX |
|---|---|
| 400 validation | Inline field message (e.g., depth selector hint) |
| 404 | Inline "Entity not found" in panel + "Back to graph" action; URL cleaned |
| 503 DB down | Persistent banner: "Database unavailable — showing cached data. Retry." App shell remains usable; every query shows retryable error state |
| 500 query/network | ErrorState component with Retry button; TanStack Query auto-retry (2x, small backoff) and keeps previous cache |
| Empty (valid) | EmptyState: "No dependencies found", "No tests cover this entity", "No impact detected within depth 3" — distinct from errors |

### 18.3 Degraded-mode product decision

> **Decision → Reason** — The backend starts degraded rather than failing hard when CognoDB is unreachable (§8.4). The assignment explicitly evaluates graceful failure handling; a live "database down" banner + healthy app shell demonstrates it far better than a crash. Health endpoint (`/api/health/database`) drives the banner; the frontend polls it on an interval while errors persist.

---

## 19. Configuration Strategy

### 19.1 Required environment variables

| Variable | Required | Dev default | Description |
|---|---|---|---|
| `COGNODB_URI` | ✅ | `bolt://localhost:7687` (verify — see Assumptions) | Bolt endpoint |
| `COGNODB_USERNAME` | ✅ | — | Credential |
| `COGNODB_PASSWORD` | ✅ | — | Credential — never logged |
| `PORT` | no | `3001` | Backend port |
| `CORS_ORIGIN` | ✅ | `http://localhost:3000` | Allowed frontend origin(s), comma-separated |
| `NEXT_PUBLIC_API_BASE_URL` | ✅ (web) | `http://localhost:3001/api` | Frontend → backend base URL |
| `LOG_LEVEL` | no | `info` | Pino/nest logger level |
| `IMPACT_MAX_DEPTH` | no | `3` | Server-side depth cap (validated to 1–5) |
| `COGNODB_DATABASE` | no | — | Only if CognoDB supports multiple DBs (verify) |

### 19.2 `.env.example` (checked into the repo)

```dotenv
# Backend (apps/api)
COGNODB_URI=bolt://localhost:7687
COGNODB_USERNAME=cognodb
COGNODB_PASSWORD=change-me
PORT=3001
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
IMPACT_MAX_DEPTH=3

# Frontend (apps/web)
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
```

### 19.3 Behavior & validation

- **Validation:** Joi schema at bootstrap; missing/invalid vars → process exits with a readable message naming the variable. Secrets never logged.
- **Development:** local CognoDB (or Cloud dev instance); CORS allows localhost:3000; relaxed logging; seed script freely re-runnable.
- **Production (hosted demo):** `CORS_ORIGIN` = deployed frontend origin; `NEXT_PUBLIC_API_BASE_URL` = deployed backend URL; credentials from the hosting platform's env store, never committed.

> **Decision → Reason** — Explicit env contract + fail-fast validation is cheap (one Joi schema) and directly satisfies the "environment-based credentials" + "never hardcode secrets" requirements.

---

## 20. Testing Strategy

### 20.1 Minimum valuable coverage (assessment-appropriate)

| Area | What | Tooling | Priority |
|---|---|---|---|
| DB connectivity | Health endpoint returns ok; degraded path returns 503 when driver is down | Jest e2e against real CognoDB (+ a forced-down test) | Must |
| Seed integrity | Run seed twice → identical counts; idempotency assertion | Seed script self-check | Must |
| Graph repository | `getNodeById`, `getDependencies`, `getCallers`, `getTestsForEntity` return expected fixtures | Jest + real DB | Must |
| Dependency traversal | `PaymentService` callers/dependents match fixture assertions | Jest + real DB | Must |
| Impact analysis | `PaymentService` @depth 3 → HIGH contains CheckoutService/RefundService; MEDIUM contains OrderService; test count + PR/issue counts match; path explanation present | Jest + real DB | Must |
| Critical endpoints | `GET /api/repository`, `GET /api/nodes?id=`, `GET /api/impact?id=` (status + shape) | Nest e2e (supertest) | Must |
| Validation & errors | Bad depth → 400; unknown id → 404; DB down → 503 sanitized (no credentials in body) | Jest e2e | Must |
| Config | Missing env var → boot failure with message | Unit | Should |
| Frontend | One smoke: explorer renders ErrorState on 503; LoadingState renders skeletons (Testing Library) | Vitest + Testing Library | If time |
| Impact grouping logic | Pure-function tests for ranking/sorting (if extracted) | Jest unit | If time |

### 20.2 Explicitly manual (acceptable for the assessment)

- Graph canvas interactions (pan/zoom/expand/collapse/hover paths) — visual QA checklist.
- Responsive layouts and the empty/error visual states — eyeballed + screenshotted.
- Demo recording and screenshot capture.
- CognoDB Cloud provisioning and the hosted deployment itself.

> **Decision → Reason** — Integration tests against the real seeded database are the highest-value tests here because all real logic is Cypher; mocking the driver would test nothing. Unit-testing everything else is explicitly out of scope for 48 hours.

---

## 21. README Structure

```markdown
1. TraceGraph                      # name, tagline, one-paragraph positioning
2. Problem                         # the central question; unfamiliar codebases; hidden couplings
3. Solution                        # graph explorer + impact analysis; the PaymentService example
4. Features                        # P0 feature list (dashboard, explorer, details, deps, impact, history, states)
5. Why a Graph Database?           # §2.3 narrative + the relational-awkwardness query
6. Architecture                    # topology diagram + request flow
7. Graph Data Model                # mermaid diagram (§10.3) + label/relationship table + naming conventions
8. Seed Data                       # Commerce Platform description, node counts, key chains
9. Main Cypher Queries             # Q1, Q8, Q10, Q12, Q13 with purpose + "why graph" notes (README ≠ full catalog; link to this doc)
10. Technology Stack               # Next.js, NestJS, Tailwind, shadcn/ui, React Flow, TanStack Query, Neo4j driver, CognoDB
11. Local Setup                    # prerequisites, clone, install (npm workspaces)
12. CognoDB Setup                  # provision + credentials → .env
13. Environment Variables          # table + .env.example
14. Running the Project            # seed → api → web; npm scripts table
15. Screenshots                    # dashboard, explorer, node details, impact result
16. Hosted Demo                    # links to deployed web + API health
17. Design/Engineering Tradeoffs   # function-level edges, two-page UX, degraded startup, openCypher constraints, manual seed
18. Future Improvements            # P1/P2: search, ingestion, AST parsing, embeddings/RAG, AI explanations, multi-tenancy
```

---

## 22. Demo Flow

**Total: ~2.5 minutes.** Story: *"A developer wants to understand what might break if `PaymentService` changes."*

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:15 | **Hook** | Dashboard: "Commerce Platform — 28 files, 17 classes, 48 functions, 18 tests, 24 commits, 7 PRs, 6 issues." Narrate the question: "What breaks if I change `PaymentService`?" |
| 0:15–0:30 | **Graph explorer** | Click "Open Graph" → code graph renders → hover over `PaymentService` → click it → neighborhood emphasized, details panel opens. |
| 0:30–0:45 | **Inspect relationships** | Tabs: Dependencies (CheckoutService, RefundService, StripeClient, DiscountService…), Callers (PaymentController, CheckoutService), Tests (PaymentServiceTest…), History (PR #42, #35, #29; issue #12). |
| 0:45–1:05 | **Analyze Impact** | Click "Analyze Impact" (depth 3) → loading skeleton → result: HIGH (CheckoutService, RefundService, PaymentController, StripeClient), MEDIUM (OrderService, NotificationService, LedgerService), LOW (OrderRepository, EmailTemplateService, DatabaseService). Graph recolors. |
| 1:05–1:25 | **Why / paths** | Hover `OrderService` → path tooltip: "PaymentService.charge() → CheckoutService.completeCheckout() → OrderService.createOrder() (2 hops)." Hover `LedgerService` similarly. |
| 1:25–1:40 | **The surprise** | Select `LedgerService` → Analyze Impact → **StripeWebhookController** at 2 hops and `PaymentServiceTest.refund_records_ledger_entry` indirectly affected. Narrate: "A grep for 'PaymentService' would never show this — the graph does." |
| 1:40–1:55 | **Tests + history** | Switch back to `PaymentService` impact → "8 tests affected (3 direct, 5 indirect)" + related PRs/issues with counts. |
| 1:55–2:15 | **Why a graph DB** | Freeze on the impact query (Q12) in the README or a code view; explain: variable-depth path traversal; in SQL: recursive CTEs + lost paths. |
| 2:15–2:30 | **Wrap** | Optional AI explanation (P1, final beat if implemented): "PaymentService is a transaction boundary — 8 tests cover this blast radius." Close with hosted link. |

---

## 23. Assessment Acceptance Criteria

Every item is objective — **done** means verifiable by the stated check.

### Graph requirements
- [ ] 10 labeled node types and 8 typed relationships implemented — verify: seed script output.
- [ ] Properties on all node types per §11 — verify: `GET /api/nodes?id=` returns them.
- [ ] Multi-hop traversal: `GET /api/impact/class:PaymentService?depth=3` returns ≥1 node at 2 hops and ≥1 at 3 hops.
- [ ] Relational-awkwardness query exists and is documented: Q12 in the catalog + §2.3 in the README.
- [ ] Every Cypher query parameterized — verify: code review of repository layer (no string-built values; only whitelisted depth literal).
- [ ] Graph is non-decorative: impact analysis *requires* variable-length traversal — verify: README + demo.

### Backend requirements
- [ ] NestJS app boots from env config only; missing var → clear boot error.
- [ ] Controllers/services contain zero Cypher; all Cypher in `*.repository.ts` — verify: grep.
- [ ] `GET /api/health/database` reflects DB state; DB down → 503 with `DATABASE_UNAVAILABLE`.
- [ ] All 14 API routes respond with documented shapes — verify: e2e tests.
- [ ] Errors never leak credentials/connection strings — verify: e2e "DB down" assertion on response body.

### Frontend requirements
- [ ] `/dashboard` renders stats from `GET /api/repository`.
- [ ] `/explorer` renders the graph, supports select + neighborhood + expand.
- [ ] Node details panel renders properties + 5 relationship tabs.
- [ ] Impact panel renders grouped results + path explanations + tests + PRs/issues.
- [ ] Deep link `/explorer?node=class:PaymentService` works on load.

### UX requirements
- [ ] Loading skeletons on every async surface (query-level, not page-level).
- [ ] Empty states: repository with no data; node with no dependencies; impact with no results.
- [ ] Error states: 404 inline; 503 banner + retryable; network error with Retry.
- [ ] Graph color legend present and accurate during impact display.

### Security / configuration
- [ ] Credentials only via env; `.env.example` committed; `.env` gitignored.
- [ ] No secrets in client bundle; backend sanitizes all errors.
- [ ] CORS restricted to configured origins.

### Testing
- [ ] e2e suite covers health, overview, node, deps/callers, impact (payment fixture assertions), 400/404/503.
- [ ] Seed script idempotency verified (run twice, identical counts).

### Documentation
- [ ] README complete with all sections, mermaid data-model diagram, main queries, setup, screenshots.
- [ ] This technical design spec exists in-repo and is linked from the README.

### Deployment
- [ ] Web and API hosted; `GET /api/health` reachable from the hosted web origin.
- [ ] CORS works from the hosted frontend (verified by loading the demo).
- [ ] Screenshots captured from the hosted app.

### Demo
- [ ] 2–3 minute recording follows §22 beats; includes impact analysis of `PaymentService` and the `LedgerService` surprise.
- [ ] Recording is watchable (audio optional, captions acceptable) and hosted/linked in README.

---

## 24. Implementation Architecture Map

```text
Scope + Architecture (this specification)
   ↓
Foundation (monorepo, workspaces, Next + Nest scaffolds,
Tailwind/shadcn, TanStack Query, lint/format)
   ↓
CognoDB Layer (driver wrapper, DatabaseService, health, config, Joi)
   ↓
Graph & Ingestion (schema, import pipeline, constraints, idempotency)
   ↓
Queries + Backend (catalog wiring, DTOs, filters, e2e tests)
   ↓
Dashboard (stats, recent changes, states)
   ↓
Graph Explorer (React Flow canvas, nodes/edges, select, expand, panels)
   ↓
Dependency Explorer (tabs: deps/dependents/callers/tests/history)
   ↓
Impact Analysis Engine (traversal, grouping, paths, visualization, legend)
   ↓
AI Explanation & Intelligence (findings, architectural smells, summaries)
   ↓
Hardening (error states, degraded mode, a11y, responsiveness)
   ↓
Polish & Deployment (README, documentation, screenshots, recording, hosting)
```

**Architecture Flow:** Database services and configuration form the core foundation; query modules and domain repositories power the REST API; domain explorers, graph canvas, and impact analysis assemble the frontend interface.

---

## 25. Risk Analysis

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | openCypher dialect gaps in CognoDB (subqueries, path functions, constraint syntax) | M | H | Queries drafted openCypher-safe (§13); Q13 has an in-memory fallback; early spike validates dialect before queries are finalized |
| R2 | Neo4j JS driver version incompatibility with CognoDB's Bolt implementation | M | H | Connectivity spike on day 1; pin driver version after verification; fall back to documented `bolt://` semantics |
| R3 | CognoDB free-tier limits (dataset size, request rate) | L | M | Dataset bounded; impact depth capped at 5; LIMIT guards on Q12 |
| R4 | React Flow v12 API unfamiliarity | M | M | Explorer module is isolated; custom node is minimal; `toReactFlow` keeps layout logic pure/testable |
| R5 | Next.js SSR/build accidentally hitting the backend | M | M | Client-side data fetching only; no server components call the API; `NEXT_PUBLIC_*` only |
| R6 | Time overrun on polish (canvas, states) | M | M | Strict MVP gating; §6 cuttable table; two-day plan with hourly budget (§26) |
| R7 | Data realism drift (looks fake, undercuts demo) | L | M | Hand-authored fixtures with a consistent commit/PR/issue narrative; demo rehearsed against real data |
| R8 | CORS/production deployment friction late | M | M | CORS from env; deploy web+api with a buffer; health endpoint as the canary |
| R9 | Screenshot/recording tooling issues | L | L | Capture screenshots incrementally (not at the end); recording buffer |
| R10 | Scope creep (OAuth, AI, ingestion) | M | H | §2.2 scope rule is binding; P2 items explicitly deferred |

---

## 26. 48-Hour Execution Priorities

**Strategy:** fail-fast on the two unknowns (CognoDB connectivity + openCypher dialect) in the first 6 hours; then build in demo-able increments; hold polish for the end with a real buffer.

| Window | Work | Gate |
|---|---|---|
| H0–6 | Core foundation + **Driver ↔ CognoDB verified, dialect probe query runs** | `RETURN 1` over Bolt + sample variable-length query |
| H6–12 | Graph schema + data script — validate Q12's core traversal by hand | Schema idempotent; PaymentService 3-hop result correct |
| H12–18 | Backend API (all queries, DTOs, filters, e2e) | e2e green incl. 400/404/503 |
| H18–24 | Dashboard + Graph explorer (first canvas) | Dashboard live; canvas renders + select works |
| H24–33 | Finish Graph Explorer (expand/panels) + Dependency explorer | All 5 tabs functional |
| H33–40 | Impact analysis + visualization | Full impact flow demo-able |
| H40–43 | AI explanation (if P0 stable) | Verified summary responses |
| H43–46 | Hardening (states, degraded mode, a11y) | Error/empty/loading QA checklist |
| H46–52 | README, screenshots, recording, deploy | All §23 checkboxes done |
| H52–55 | Buffer / fix-ups / verification | — |

> **Decision → Reason** — The critical-path unknown (CognoDB + dialect) is attacked in the first 6 hours so any fallback (e.g., adjusting query shape or driver version) lands early, not at hour 40. Every module produces something demo-able, so schedule slips degrade gracefully.

---

## Assumptions Register

Explicitly **assumptions** (to verify during integration), not requirements:

| # | Assumption | Verification step |
|---|---|---|
| A1 | CognoDB exposes a Bolt endpoint reachable via the official `neo4j-driver` JS package with URI scheme `bolt://` | Driver connectivity spike |
| A2 | CognoDB free tier comfortably holds ~150 nodes / ~280 edges with acceptable query latency | Benchmark probe |
| A3 | CognoDB supports unique constraints / `MERGE` semantics as in openCypher | Idempotent constraint and MERGE tests |
| A4 | Variable-length path matching (`*1..3`), `collect(DISTINCT …)`, and `startNode()/endNode()` are supported | Dialect probe; fallbacks documented for Q13 |
| A5 | No `CALL {}` subqueries or `EXISTS{}`/`COUNT{}` subqueries (openCypher-safe assumption) | Dialect probe; service-level composition is the fallback |
| A6 | Node/rel identity, labels, and properties behave per Neo4j 5.x semantics | Query probe |
| A7 | Hosting: web on Vercel, API on Render/Fly.io, CognoDB Cloud — any equivalent combo acceptable | Deployment smoke test |
| A8 | Next.js 15.x stable, Tailwind v4, React Flow `@xyflow/react` v12, TanStack Query v5, NestJS 10/11 | Monorepo scaffold |
| A9 | A single default database / no multi-database routing needed | Database probe (`COGNODB_DATABASE` optional var) |
| A10 | Dark theme is an acceptable (preferred) aesthetic for the demo | Cosmetic evaluation |

---

## TECHNICAL DESIGN SUMMARY

This document establishes the architecture contract for the TraceGraph application:

1. **Product scope** — the exact P0/P1/P2 boundary and the binding non-goals (§2.2, §6).
2. **Data model** — final labels, relationship types, directions, properties, naming conventions, and the redundant relationships to avoid (§10, §11).
3. **Seed & Ingestion contract** — domain, node/edge inventory, dependency chains, demo scenarios, and the deterministic script contract (§12).
4. **Query contract** — 14 parameterized queries with inputs, shapes, hop counts, and reference Cypher; the two explicit showcase queries identified (§13).
5. **Feature contract** — Impact Analysis is fully specified: inputs, traversal, depth, grouping, ranking, tests/history inclusion, display, and explanation format (§14).
6. **API contract** — 14 routes with params, shapes, and error cases (§15).
7. **Architecture contract** — module boundaries, responsibility rules (no Cypher outside repositories), request flow, error taxonomy, config schema (§7–§9, §18, §19).
8. **UX contract** — pages, components, state ownership, graph behaviors, loading/empty/error patterns (§16, §17).
9. **Execution contract** — testing scope, README outline, demo script, acceptance checklist, architecture map, risk register, and the 48-hour budget (§20–§26).
