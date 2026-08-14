# TraceGraph

> **Understand your codebase through relationships.**

TraceGraph is a graph-powered code intelligence platform that models software repositories as property graphs in **CognoDB**. It enables developers to explore dependencies, detect architectural smells, trace engineering history, and analyze the blast radius of changes before pushing code.

---

## ✨ Features

- **Interactive Graph Visualization:** Explore files, classes, functions, and tests with an interactive canvas powered by React Flow.
- **Change Impact & Blast Radius:** Deterministically analyze what breaks when modifying a file or function across multiple dependency hops.
- **Code Intelligence & Smells:** Automatically detect circular dependencies, god modules, orphaned code, and test coverage gaps.
- **Engineering Context:** Trace the full lineage of any code entity: `File → Commit → Pull Request → Issue`.
- **GitHub Integration:** Sign in with GitHub and import repositories directly into graph structures.

---

## 🛠️ Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS, shadcn/ui, React Flow |
| **Backend** | NestJS 11, TypeScript, `@nestjs/config`, `class-validator` |
| **Database** | CognoDB (openCypher) via the official Neo4j driver (Bolt) |
| **Monorepo** | npm workspaces (`apps/web`, `apps/api`, `packages/shared`) |

---

## 📁 Project Structure

```text
TraceGraph/
├── apps/
│   ├── web/           # Next.js frontend application
│   └── api/           # NestJS backend REST API
├── packages/
│   └── shared/        # Shared TypeScript types and contracts
├── docs/              # Technical specifications and data model docs
└── package.json       # Workspace scripts and root configuration
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js ≥ 20**
- **npm ≥ 10**
- A **CognoDB** instance with Bolt access

### 2. Installation

```bash
# Clone repository and install dependencies
git clone https://github.com/devhimanshuu/TraceGraph.git
cd TraceGraph
npm install
```

### 3. Configure Environment Variables

```bash
# Copy example env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Fill in the required values in `apps/api/.env` and `apps/web/.env.local`:

#### `apps/api/.env`
```env
COGNODB_URI=bolt+s://<host>.databases.cognodb.com:7687
COGNODB_USERNAME=<username>
COGNODB_PASSWORD=<password>
CORS_ORIGIN=http://localhost:3000
PORT=4000
SESSION_SECRET=<random-32-byte-hex>
GITHUB_CLIENT_ID=<optional-github-client-id>
GITHUB_CLIENT_SECRET=<optional-github-client-secret>
```

#### `apps/web/.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
SESSION_SECRET=<must-match-api-session-secret>
```

### 4. Run Development Servers

```bash
# Start both Backend (port 4000) and Frontend (port 3000)
npm run dev
```

- **Web App:** [http://localhost:3000](http://localhost:3000)
- **API Health:** [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

## 📜 Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start both API and Web in development mode |
| `npm run dev:api` | Start only the NestJS API |
| `npm run dev:web` | Start only the Next.js frontend |
| `npm run build` | Build all apps and packages for production |
| `npm run typecheck` | Run TypeScript typechecking across all workspaces |
| `npm run lint` | Run ESLint across all workspaces |
| `npm run test` | Run backend tests |
| `npm run db:check` | Verify CognoDB database connectivity |

---

## 🔌 API Overview

| Method & Route | Description |
| --- | --- |
| `GET /api/health` | Application liveness and status |
| `GET /api/health/database` | CognoDB connection health |
| `GET /api/repository` | Repository overview, stats, and activity |
| `GET /api/nodes/:id` | Entity node details |
| `GET /api/nodes/:id/dependencies` | Outgoing dependencies (IMPORTS, CALLS, EXTENDS) |
| `GET /api/nodes/:id/dependents` | Inbound dependents (reverse traversal) |
| `GET /api/traversal/:id` | Bounded multi-hop traversal with path evidence |
| `GET /api/impact/:id` | Impact / blast radius analysis for an entity |
| `GET /api/impact-history` | Stored impact analysis snapshots |
| `GET /api/intelligence` | Graph-derived smells, orphans, and test gaps |
| `GET /api/search?q=` | Entity search by name/symbol |

---

## 📚 Documentation

- [Technical Design](docs/technical-design.md) — Architecture, data flows, and design principles.
- [Graph Data Model](docs/graph-data-model.md) — Node labels, relationship schemas, and properties.
- [Query Strategy](docs/graph-query-strategy.md) — Parameterized Cypher query catalog and traversal strategies.
