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
- **Multi-Language Parser Platform:** Tree-sitter-powered analysis for 8 languages: TypeScript, JavaScript, Python, Go, Java, Rust, PHP, C# — all normalized into a single graph schema.

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
| `npm run ci:check` (in `apps/api`) | PR blast-radius CLI — changed files → dependents, tests, risk score |

---

## 🛡️ CI Check Mode — PR Blast Radius

Every pull request changes a few files — but what else does it touch? The
`ci:check` CLI runs the deterministic impact engine over a PR's changed files
and answers that question in one command: affected dependents (direct +
indirect), the tests to run, and a LOW / MEDIUM / HIGH risk summary.

It is graph-driven and deterministic — the same Phase 9 impact engine the web
app uses, no AI, no network calls beyond CognoDB.

```bash
# From apps/api
npm run ci:check -- apps/api/src/impact/impact.service.ts apps/api/src/impact/impact.repository.ts
```

Example output:

```text
tracegraph check — 2 files changed
  dependents:   5 direct, 2 indirect
  tests to run: 3 potentially affected
  risk:         MEDIUM
    • 3 direct dependents (>= 3) → medium impact
  top tests:
    • impact.service.spec.ts (apps/api/src/impact/impact.service.spec.ts) — covers 2 affected, risk HIGH
```

### Gate CI on risk

Use `--fail-on` to fail the pipeline when the change is risky enough — the exit
code becomes `1` when the risk meets the threshold:

```bash
# Fail the pipeline on HIGH-risk changes
npm run ci:check -- --fail-on high $(git diff --name-only origin/main...HEAD)

# Tighter traversal + fail on MEDIUM or HIGH
npm run ci:check -- --depth 3 --fail-on medium -- apps/api/src/services/payment.service.ts
```

### Work with a PR diff

```bash
# Changed files from the current branch, one per line
git diff --name-only origin/main...HEAD | npm run ci:check -- --stdin
```

### Scriptable output

```bash
npm run ci:check -- --json -- apps/api/src/impact/impact.service.ts
```

### Options

| Flag | Description |
| --- | --- |
| `--depth <1-4>` | Traversal depth (default 2, bounded by the API maximum) |
| `--fail-on medium\|high` | Exit code `1` when risk meets the threshold |
| `--stdin` | Read changed file paths from stdin, one per line |
| `--json` | Emit JSON (`{ blast, tests }`) instead of the human summary |
| `--` | Everything after this is a changed file path |

Exit codes: `0` pass · `1` risk met `--fail-on` (or engine error) · `2` no
files provided. Paths not found in the graph (new/ignored files) are reported
as `unresolved` and don't fail the check.

---


| Method & Route | Description |
| --- | --- |
| `GET /api/health` | Application liveness and status |
| `GET /api/health/database` | CognoDB connection health |
| `GET /api/repository` | Repository overview, stats, and activity |
| `GET /api/nodes?id=` | Entity node details |
| `GET /api/nodes/dependencies?id=` | Outgoing dependencies (IMPORTS, CALLS, EXTENDS) |
| `GET /api/nodes/dependents?id=` | Inbound dependents (reverse traversal) |
| `GET /api/traversal?id=` | Bounded multi-hop traversal with path evidence |
| `GET /api/impact?id=` | Impact / blast radius analysis for an entity |

> Entity ids embed file paths (`fn:src/modules/tools/errors.ts:ToolError`), so they
> travel as **query parameters** — the AWS HTTP API decodes `%2F` inside path
> segments before the Lambda sees them, which would shatter `:id` route matching.
| `GET /api/impact-history` | Stored impact analysis snapshots |
| `GET /api/intelligence` | Graph-derived smells, orphans, and test gaps |
| `GET /api/search?q=` | Entity search by name/symbol |

---

## 📚 Documentation

- [Technical Design](docs/technical-design.md) — Architecture, data flows, and design principles.
- [Graph Data Model](docs/graph-data-model.md) — Node labels, relationship schemas, and properties.
- [Query Strategy](docs/graph-query-strategy.md) — Parameterized Cypher query catalog and traversal strategies.
