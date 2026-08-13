# TraceGraph Graph Data Model

The TraceGraph dataset models a single fictional repository — **commerce-platform** — as a labeled property graph in CognoDB. Everything below is deterministic demo data; it does not map to real GitHub history.

## Node labels

| Label | Represents | Key properties |
| --- | --- | --- |
| `Repository` | The repository itself | `id`, `name`, `fullName`, `description`, `language`, `defaultBranch`, `createdAt`, `updatedAt` |
| `Directory` | A directory | `id`, `name`, `path` |
| `File` | A source file | `id`, `name`, `path`, `extension`, `language`, `linesOfCode`, `category` (`controller`/`service`/`repository`/`test`/`page`/`utility`/`model`) |
| `Function` | A function or method | `id`, `name`, `signature`, `lineStart`, `lineEnd`, `visibility` |
| `Class` | A class | `id`, `name`, `filePath`, `lineStart`, `lineEnd` |
| `Test` | A test case | `id`, `name`, `framework`, `filePath` |
| `Commit` | A commit | `id`, `sha`, `message`, `timestamp`, `branch` |
| `PullRequest` | A pull request | `id`, `number`, `title`, `status`, `createdAt`, `mergedAt` |
| `Issue` | An issue | `id`, `number`, `title`, `status`, `createdAt` |
| `Developer` | A fictional developer | `id`, `username`, `name`, `email`, `role` |

## Relationship types

| Relationship | Direction | Meaning |
| --- | --- | --- |
| `(:Repository)-[:CONTAINS]->(:Directory)` | container → child | repo contains directory |
| `(:Directory)-[:CONTAINS]->(:File)` | container → child | directory contains file |
| `(:File)-[:CONTAINS]->(:Class)` | container → symbol | file defines class |
| `(:File)-[:CONTAINS]->(:Function)` | container → symbol | file defines function |
| `(:File)-[:IMPORTS {line}]->(:File)` | importer → imported | file imports file (line = import statement) |
| `(:Function)-[:CALLS {count}]->(:Function)` | caller → callee | function calls function (count = call sites) |
| `(:Class)-[:EXTENDS]->(:Class)` | subclass → superclass | class extends class |
| `(:Test)-[:TESTS]->(:Function)` | test → target | test covers function |
| `(:Commit)-[:MODIFIES]->(:File)` | commit → file | commit changed file |
| `(:Commit)-[:AUTHORED_BY]->(:Developer)` | commit → author | commit authored by developer |
| `(:PullRequest)-[:CONTAINS]->(:Commit)` | PR → commit | PR includes commit |
| `(:Issue)-[:RELATED_TO]->(:PullRequest)` | issue → PR | issue relates to PR |

Direction is semantic and fixed. Traversals that need the opposite direction use Cypher's reverse-traversal syntax (`<-[:CALLS]-`), never duplicate edges.

## Stable IDs

Every node has a deterministic, unique, MERGE-friendly `id`:

```text
Repository  repo:commerce-platform
Directory   dir:apps/api/services
File        file:apps/api/services/payment.service.ts
Function    fn:apps/api/services/payment.service.ts:processPayment
Class       class:apps/api/services/payment.service.ts:PaymentService
Test        test:apps/api/services/payment.service.spec.ts:processPayment.retries
Commit      commit:8f21ac7
PullRequest pr:421
Issue       issue:912
Developer   dev:alex
```

Uniqueness is enforced at the database level with named constraints (`tg_<label>_id`, created with `CREATE CONSTRAINT ... IF NOT EXISTS ... REQUIRE n.id IS UNIQUE`, dropped by name in `db:clear`).

## Example subgraphs

### Containment

```text
Repository
   |
 CONTAINS
   ↓
Directory
   |
 CONTAINS
   ↓
File
   |
 CONTAINS
   ↓
Function
```

### Engineering history — the demo-critical chain

```text
Issue #912  "Checkout occasionally times out"
   |
 RELATED_TO
   ↓
PR #421  "Add payment retry handling"
   |
 CONTAINS
   ↓
Commit 8f21ac7  "Add retry handling to payment flow"
   |
 MODIFIES
   ↓
payment.service.ts
   |
 CONTAINS
   ↓
PaymentService.processPayment()
```

### Call chain — multi-hop traversal

```text
OrderService.retryPendingCheckout()
   |
 CALLS
   ↓
CheckoutService.processCheckout()
   |
 CALLS
   ↓
PaymentService.processPayment()
   |
 CALLS
   ↓
PaymentRepository.createTransaction()
   |
 CALLS
   ↓
DatabaseService.query()
```

Traversing `<-[:CALLS]-` from `PaymentService.processPayment()` answers the product's central question: *"what could be affected if I change PaymentService?"* — `CheckoutService` directly, `OrderService` two hops up, and their tests.

## Dataset size

| Node type | Count | Relationship type | Count |
| --- | --- | --- | --- |
| Repository | 1 | CONTAINS | 157 |
| Directory | 11 | IMPORTS | 59 |
| File | 37 | CALLS | 50 |
| Class | 21 | EXTENDS | 2 |
| Function | 64 | TESTS | 19 |
| Test | 19 | MODIFIES | 28 |
| Commit | 24 | AUTHORED_BY | 24 |
| PullRequest | 11 | RELATED_TO | 9 |
| Issue | 9 | | |
| Developer | 5 | | |
| **Total** | **202** | **Total** | **348** |

## Seed scripts

| Command | What it does |
| --- | --- |
| `npm run db:seed` | Creates constraints and loads the full dataset. Idempotent — re-running never duplicates (`MERGE` on stable ids). |
| `npm run db:clear` | Removes ONLY TraceGraph data: the 10 labels above + the `tg_*` constraints. Label-scoped on purpose — the hosted instance may be shared with other domains, and this script never touches them. |
| `npm run db:verify` | Compares live node/relationship counts to the dataset definition, checks the critical entities and multi-hop paths, and runs integrity checks (no orphaned Files/Functions/Classes/Tests/Commits/PRs/Issues). |
| `npm run db:check` | Connectivity check only (`RETURN 1` through the full stack). |

The seed scripts reuse the application's own `DatabaseService` (via `scripts/bootstrap.ts`) — there is exactly one database connection strategy, and all Cypher is parameterized.

## Why a graph database?

The core question — *"what breaks if I change PaymentService?"* — is a **multi-hop traversal over typed relationships**: callers of callers, tests that cover the changed function, and the PRs/issues that touched the file. In a relational schema you would model this with join tables plus recursive CTEs (depth-limited, path-losing, and stale whenever the code changes); here it is one parameterized `MATCH ... -[:CALLS*1..3]-> ...` query, and the returned paths themselves explain *why* a node is affected. The graph is the query, not an approximation of it.
