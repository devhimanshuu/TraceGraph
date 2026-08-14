# TraceGraph

> **Understand your codebase through relationships.**

TraceGraph is a graph-powered codebase intelligence application that helps developers
explore software relationships and understand the potential impact of changing a
file, class, function, or service. It stores a software repository as a property
graph in **CognoDB** and exposes it through a NestJS REST API and a Next.js web app.

TraceGraph provides a Cypher query layer and graph repository API (node details,
relationships, dependencies, callers/callees, tests, bounded multi-hop traversal
with evidence paths, engineering history, repository overview, and search — all
parameterized and mapped to typed DTOs) alongside a modern web interface for
graph exploration and change impact analysis. For in-depth technical documentation,
see [docs/technical-design.md](docs/technical-design.md),
[docs/graph-data-model.md](docs/graph-data-model.md), and
[docs/graph-query-strategy.md](docs/graph-query-strategy.md).

## Overview

```text
Next.js Frontend (apps/web)
       |
       | REST API (JSON over HTTP, CORS-enabled)
       v
NestJS Backend (apps/api)
       |
       | Domain services → graph repositories
       v
Official Neo4j driver (Bolt)
       |
       v
CognoDB (openCypher)
```

The frontend never talks to CognoDB directly — all graph access goes through the
NestJS API.

## Tech Stack

| Layer     | Technology                                                               |
| --------- | ------------------------------------------------------------------------ |
| Frontend  | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui                |
| Backend   | NestJS, TypeScript, class-validator, class-transformer, `@nestjs/config` |
| Database  | CognoDB (openCypher, Bolt protocol) via the official `neo4j-driver`      |
| Workspace | npm workspaces (single repo, two apps + one shared package)              |
| Quality   | TypeScript strict mode, ESLint, Prettier, Jest                           |

## Repository Structure

```text
tracegraph/
├── apps/
│   ├── web/                     # Next.js frontend (dashboard, explorer, impact analysis)
│   │   ├── app/                 # App Router pages
│   │   ├── components/          # UI components (shadcn/ui primitives, graph canvas, impact)
│   │   ├── hooks/               # Client hooks (e.g. use-health, use-session)
│   │   └── lib/                 # Central API client & utilities
│   └── api/                     # NestJS backend
│       └── src/
│           ├── config/          # Env validation (Joi) + typed config
│           ├── common/          # Global exception filter
│           ├── database/        # Neo4j driver wrapper (DatabaseService)
│           ├── health/          # /api/health + /api/health/database
│           ├── repository/      # Repository metadata & overview
│           ├── graph/           # Graph queries, traversals, nodes & dependencies
│           ├── impact/          # Blast radius & change impact engine
│           ├── impact-history/  # Stored impact snapshot ledger
│           ├── intelligence/    # Graph-derived architectural intelligence & smells
│           └── history/         # Git / PR / Issue engineering context
├── packages/
│   └── shared/                  # Shared contracts (types only): NodeType,
│                                # RelationshipType, AppHealth, DatabaseHealth, ApiError
├── docs/                        # Technical design specification & query strategy
├── .env.example                 # Reference for all environment variables
└── package.json                 # Workspace + root scripts
```

## Prerequisites

- **Node.js ≥ 20** (developed against Node 24)
- **npm ≥ 10** (npm workspaces)
- A reachable **CognoDB** instance (hosted or local) with Bolt access

## Environment Variables

Create the per-app env files from the templates (never commit real credentials):

```bash
# Backend
cp apps/api/.env.example apps/api/.env      # then fill in COGNODB_* values
# Frontend
cp apps/web/.env.example apps/web/.env.local
```

| Variable                            | Where               | Required | Purpose                                                     |
| ----------------------------------- | ------------------- | -------- | ----------------------------------------------------------- |
| `COGNODB_URI`                       | apps/api            | ✅       | Bolt URI, e.g. `bolt+s://<host>.databases.cognodb.com:7687` |
| `COGNODB_USERNAME`                  | apps/api            | ✅       | CognoDB username                                            |
| `COGNODB_PASSWORD`                  | apps/api            | ✅       | CognoDB password (never committed)                          |
| `CORS_ORIGIN`                       | apps/api            | ✅       | Comma-separated allowed browser origins (no wildcards)      |
| `PORT`                              | apps/api            | no       | API port (default `4000`)                                   |
| `NODE_ENV`                          | apps/api            | no       | `development` \| `test` \| `production`                     |
| `NEXT_PUBLIC_API_URL`               | apps/web            | ✅       | Backend base URL, e.g. `http://localhost:4000/api`          |
| `GITHUB_CLIENT_ID`                  | apps/api            | no       | GitHub OAuth App client id (absent → auth entry degrades)   |
| `GITHUB_CLIENT_SECRET`              | apps/api            | no       | GitHub OAuth App secret (server-only, never committed)      |
| `SESSION_SECRET`                    | apps/api + apps/web | no       | HMAC secret signing TraceGraph's own session tokens         |
| `WEB_APP_URL`                       | apps/api            | no       | Where the OAuth callback bounces the browser (default :3000) |

Missing or invalid required values cause the API to **fail fast at boot** with a
readable message (Joi validation). The backend never logs credentials.

## Authentication (GitHub)

TraceGraph uses **GitHub-only authentication** — the identity provider is also
the resource provider:

1. **Sign-in** — `GET /api/auth/github/login` server-side redirects to a
   GitHub OAuth App (read-only `read:user public_repo` scopes — no intrusive
   private-repo prompt).
2. **Callback** — `GET /api/auth/github/callback` exchanges the code, fetches
   your profile, and issues **TraceGraph's own signed session** (HS256 JWT
   keyed by `SESSION_SECRET`) as an httpOnly `tg_session` cookie, then
   redirects straight to `/dashboard?auth=success`.
3. **Bootstrap** — the web app reads the session back through
   `GET /api/auth/session`, stores the bearer token, and strips the query
   parameter; every data hook uses `useGitHubSession().getToken()`.
4. **Guard** — a global `GitHubAuthGuard` verifies the bearer token or session
   cookie on every route except `@Public()` (health + auth). Fail-closed: a
   missing header, invalid token, or unconfigured `SESSION_SECRET` returns
   `401`.

The GitHub access token never reaches the browser — it stays in a server-side
session store keyed by the session id. Sessions are short-lived (7 days) and
revoked on sign-out.

Create a GitHub OAuth App (github.com/settings/developers → **New OAuth App**)
with **Homepage URL** `http://localhost:3000` and **Authorization callback URL**
`http://localhost:4000/api/auth/github/callback`, then copy the keys into the
env files:

```bash
# Backend (apps/api/.env)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
# Frontend (apps/web/.env.local) — must match the backend
SESSION_SECRET=...
```

> `SESSION_SECRET` is shared by both apps so the `proxy.ts` middleware can
> verify route access with the same key the API uses. It is never shipped to
> the browser.

## CognoDB Development Setup

1. **Create a CognoDB instance** (hosted at cognodb.com, or run locally).
2. **Retrieve the connection URI** — a Bolt endpoint such as
   `bolt+s://<host>.databases.cognodb.com:7687`.
3. **Save the password securely.** The CognoDB password is shown **once** at
   creation time — store it in a password manager immediately. It belongs only
   in your local `apps/api/.env` (gitignored) or your hosting platform's secret
   store; it must never be committed to the repository.
4. **Set the required environment variables** in `apps/api/.env`:
   `COGNODB_URI`, `COGNODB_USERNAME`, `COGNODB_PASSWORD` (see the table above
   and `.env.example`).
5. **Verify connectivity** with the bundled check (no data is created):

   ```bash
   npm run db:check
   # → { "status": "up", "latencyMs": … }
   ```

   Or browse to `http://localhost:4000/api/health/database` while the API runs.

## Local Development

```bash
npm install          # installs all workspaces
npm run dev          # starts API (port 4000) and web (port 3000) together
```

Or run them separately:

```bash
npm run dev:api      # NestJS with watch mode  → http://localhost:4000/api
npm run dev:web      # Next.js dev server       → http://localhost:3000
```

Verify the stack:

```text
GET http://localhost:4000/api/health            → application liveness
GET http://localhost:4000/api/health/database   → CognoDB reachability
http://localhost:3000/dashboard                 → product dashboard
```

If CognoDB is unreachable the API **starts in degraded mode**: `/api/health/database`
reports `down`, the frontend shows a disconnected state, and the app keeps
running — no crash, no leaked connection details.

## Scripts

| Command                                     | Description                           |
| ------------------------------------------- | ------------------------------------- |
| `npm run dev` / `dev:api` / `dev:web`       | Run both apps / API only / web only   |
| `npm run build` / `build:api` / `build:web` | Production builds                     |
| `npm run lint`                              | ESLint (api + web)                    |
| `npm run typecheck`                         | `tsc --noEmit` (api + web + shared)   |
| `npm run test`                              | Jest (api: unit + e2e)                |
| `npm run format` / `format:check`           | Prettier write / verify               |
| `npm run db:check`                          | Live CognoDB connectivity check       |

## API Conventions

- Global prefix: `/api`
- Responses are **direct DTO JSON** (no envelope), typed in `@tracegraph/shared`.
- Errors follow one shape:
  `{ "statusCode": 400, "message": "…", "code": "VALIDATION_ERROR", "timestamp": "…", "path": "/api/…" }`
  — credentials, connection strings, and stack traces are never exposed.
- All Cypher is parameterized, named, and confined to `apps/api/src/graph/queries/*`
  (see [docs/graph-query-strategy.md](docs/graph-query-strategy.md)).

## API Surface

```text
GET /api/health                    application liveness
GET /api/health/database           CognoDB reachability
GET /api/repository                repository overview + label-scoped statistics
GET /api/graph                     bounded graph neighborhood (rootId, depth, types)
GET /api/nodes/:id                 node details (any of the 10 labels)
GET /api/nodes/:id/relationships   incoming + outgoing relationships
GET /api/nodes/:id/dependencies    what the entity depends on (IMPORTS/CALLS/EXTENDS)
GET /api/nodes/:id/dependents      what depends on the entity (reverse traversal)
GET /api/nodes/:id/callers         who calls this function
GET /api/nodes/:id/callees         which functions this function calls
GET /api/nodes/:id/tests           tests covering the entity
GET /api/nodes/:id/commits         commits touching the entity's file
GET /api/nodes/:id/pull-requests   PRs containing those commits
GET /api/nodes/:id/issues          issues related to those PRs
GET /api/traversal/:id             bounded multi-hop traversal with evidence paths
GET /api/search?q=                 deterministic name/substring search
GET /api/impact                    blast radius analysis & affected components
GET /api/impact-history            analysis snapshot history ledger
GET /api/intelligence              deterministic graph architectural smells & metrics
```

Node ids contain `/` and `:`, so clients must `encodeURIComponent` them in the
URL (e.g. `encodeURIComponent('class:apps/api/services/payment.service.ts:PaymentService')`).

## Architecture & Implementation Highlights

### Core Foundation
Monorepo workspace, configuration management with strict Joi validation, CORS,
unified error handling, health endpoints, and shared types in `@tracegraph/shared`.

### CognoDB Database Layer
- Official `neo4j-driver` (v6) integration with singleton connection lifecycle.
- `DatabaseService` manages read/write transactions (`executeRead`/`executeWrite`),
  explicit multi-statement transactions, and graceful connection release.
- Typed error taxonomy (`DatabaseError` kinds: configuration, connection,
  query, transaction, timeout) mapped to safe REST responses.
- Resilient degraded mode when CognoDB is temporarily unavailable.

### Graph Data Model & Schema
- 10 graph entity labels, 12 relationship types, and named unique ID constraints.
- GitHub import pipeline that clones and parses repositories into a typed graph structure.
- Schema documentation in [docs/graph-data-model.md](docs/graph-data-model.md).

### Cypher Query Engine & Graph Repository API
- Named, parameterized Cypher queries organized by domain in `src/graph/queries/*`.
- `GraphRepository` owns database interaction; `GraphService` owns business logic,
  type conversions, and data mapping.
- Bounded multi-hop traversal with path evidence for explainable relationship tracing.
- Git engineering history tracing (File → Commit → PR → Issue).

### Impact Analysis & Engineering Intelligence
- Deterministic blast radius and severity calculation for code modifications.
- Topological analysis of affected callers, callees, dependent files, and test coverage.
- Graph-derived architecture smell detection (circular dependencies, god nodes, orphaned entities).
- CognoDB-backed history ledger for impact snapshots and comparison.

### SaaS Web Application & Authentication
- Next.js App Router frontend with interactive React Flow graph explorer.
- Secure GitHub OAuth authentication with signed HTTP-only session tokens.
- Dark/Light mode theme system with zero flash of unstyled content.
- Responsive explorer panels, path inspections, and exportable impact reports.
