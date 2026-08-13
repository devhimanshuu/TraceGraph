# TraceGraph

> **Understand your codebase through relationships.**

TraceGraph is a graph-powered codebase intelligence application that helps developers
explore software relationships and understand the potential impact of changing a
file, class, function, or service. It stores a software repository as a property
graph in **CognoDB** and exposes it through a NestJS REST API and a Next.js web app.

**Current phase:** Phase 2 — project foundation (monorepo, both apps running,
frontend↔backend↔CognoDB connectivity verified). Graph schema, seed data, and
product features arrive in Phases 3+ (see [docs/PHASE-1-TECHNICAL-DESIGN.md](docs/PHASE-1-TECHNICAL-DESIGN.md)).

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

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS, TypeScript, class-validator, class-transformer, `@nestjs/config` |
| Database | CognoDB (openCypher, Bolt protocol) via the official `neo4j-driver` |
| Workspace | npm workspaces (single repo, two apps + one shared package) |
| Quality | TypeScript strict mode, ESLint, Prettier, Jest |

## Repository Structure

```text
tracegraph/
├── apps/
│   ├── web/                     # Next.js frontend (dashboard, explorer — Phase 3+)
│   │   ├── app/                 # App Router pages
│   │   ├── components/          # UI components (shadcn/ui primitives)
│   │   ├── hooks/               # Client hooks (e.g. use-health)
│   │   └── lib/                 # Central API client
│   └── api/                     # NestJS backend
│       └── src/
│           ├── config/          # Env validation (Joi) + typed config
│           ├── common/          # Global exception filter
│           ├── database/        # Neo4j driver wrapper (DatabaseService)
│           ├── health/          # /api/health + /api/health/database
│           ├── repository/      # Placeholder module (Phase 3+)
│           ├── graph/           # Placeholder module (Phase 4+)
│           ├── dependency/      # Placeholder module (Phase 5+)
│           ├── impact/          # Placeholder module (Phase 6+)
│           └── history/         # Placeholder module (Phase 5+)
├── packages/
│   └── shared/                  # Shared contracts (types only): NodeType,
│                                # RelationshipType, AppHealth, DatabaseHealth, ApiError
├── docs/                        # Phase 1 technical design specification
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

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `COGNODB_URI` | apps/api | ✅ | Bolt URI, e.g. `bolt+s://<host>.databases.cognodb.com:7687` |
| `COGNODB_USERNAME` | apps/api | ✅ | CognoDB username |
| `COGNODB_PASSWORD` | apps/api | ✅ | CognoDB password (never committed) |
| `CORS_ORIGIN` | apps/api | ✅ | Comma-separated allowed browser origins (no wildcards) |
| `PORT` | apps/api | no | API port (default `4000`) |
| `NODE_ENV` | apps/api | no | `development` \| `test` \| `production` |
| `NEXT_PUBLIC_API_URL` | apps/web | ✅ | Backend base URL, e.g. `http://localhost:4000/api` |

Missing or invalid required values cause the API to **fail fast at boot** with a
readable message (Joi validation). The backend never logs credentials.

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
http://localhost:3000/dashboard                 → foundation status UI
```

If CognoDB is unreachable the API **starts in degraded mode**: `/api/health/database`
reports `down`, the frontend shows a disconnected state, and the app keeps
running — no crash, no leaked connection details.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` / `dev:api` / `dev:web` | Run both apps / API only / web only |
| `npm run build` / `build:api` / `build:web` | Production builds |
| `npm run lint` | ESLint (api + web) |
| `npm run typecheck` | `tsc --noEmit` (api + web + shared) |
| `npm run test` | Jest (api: unit + e2e) |
| `npm run format` / `format:check` | Prettier write / verify |

## API Conventions

- Global prefix: `/api`
- Responses are **direct DTO JSON** (no envelope), documented per endpoint in
  the Phase 1 spec (§15).
- Errors follow one shape:
  `{ "statusCode": 400, "message": "…", "code": "VALIDATION_ERROR", "timestamp": "…", "path": "/api/…" }`
  — credentials, connection strings, and stack traces are never exposed.
- All future Cypher is parameterized and confined to the repository layer.

## Current Development Phase

**Phase 2 (this milestone) — Foundation.** Established the monorepo, both
applications, environment/configuration management, global validation, error
handling, CORS, health endpoints, the CognoDB database abstraction, shared
types, tooling, and tests. Verified end-to-end:

- `GET /api/health` → `{"status":"ok","service":"tracegraph-api",…}`
- `GET /api/health/database` → `{"status":"up","latencyMs":…}` against a live
  CognoDB instance
- `/dashboard` renders Frontend / API / CognoDB statuses from the API

**Next (Phase 3+):** CognoDB schema, deterministic seed script, graph queries,
and the first product features — per [docs/PHASE-1-TECHNICAL-DESIGN.md](docs/PHASE-1-TECHNICAL-DESIGN.md).
