# Ingestion Architecture

## Overview

TraceGraph's ingestion pipeline transforms real repositories into a living code-intelligence graph. The architecture separates source acquisition, file discovery, parsing, normalization, and graph persistence into independently testable stages.

```
Repository Source (GitHub / Local)
        │
        ▼
Source Workspace (temporary directory)
        │
        ▼
File Discovery + Ignore Rules
        │
        ▼
Language Detection (Phase 13)
        │
        ▼
Parser Registry → Tree-sitter → Language Adapter
        │
        ▼
Normalized Code Intelligence IR
        │
        ▼
Relationship Resolver + Cross-Language Resolver
        │
        ▼
Graph Writer → CognoDB
```

## Key Principles

1. **Source agnostic** — The pipeline never cares whether files came from GitHub, a local directory, or a future S3 bucket.
2. **Parser-agnostic** — The indexing layer selects parsers via the ParserRegistry (Phase 13) but never touches AST nodes.
3. **Deterministic** — Same repository → same graph. No LLM calls during indexing.
4. **Fault-tolerant** — One malformed file does not crash the entire repository index.
5. **Asynchronous** — Indexing runs as a background job; the API returns immediately.

## Components

### RepositorySource (`repository-source.ts`)

Abstracts where files come from:

- **GitHubPublicSource** — Shallow clones public repos via `git clone --depth 1`
- **LocalRepositorySource** — Reads from a local filesystem path

Both return a `SourceWorkspace` with a root path, cleanup function, and metadata.

### File Discovery (`discoverFiles`)

Recursively walks the workspace, applying:

- **Ignore rules** — `.git`, `node_modules`, `dist`, `vendor`, `__pycache__`, etc.
- **Binary detection** — Skips images, archives, executables, fonts, lock files
- **Size limits** — Max 5,000 files, 5MB per file

### IndexingWorker (`indexing-worker.ts`)

Orchestrates the full lifecycle:

1. Creates repository record + IndexRun (PENDING)
2. Prepares source workspace
3. Discovers files
4. Calls `ParsingPipeline.parseFromDirectory()`
5. Persists via `GraphWriter`
6. Updates IndexRun to COMPLETED/FAILED

**Concurrency**: Max 3 concurrent jobs. Duplicate runs for the same repo are prevented.

### IndexRun State Machine

```
PENDING → RUNNING → COMPLETED
                  → FAILED
                  → CANCELLED
```

No invalid transitions allowed. A retry creates a new IndexRun.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/repositories` | Create repository + start first index |
| GET | `/api/repositories` | List all repositories |
| GET | `/api/repositories/:id` | Repository detail + latest run |
| POST | `/api/repositories/:id/index` | Start new index run |
| GET | `/api/repositories/:id/index-runs` | List index runs |
| GET | `/api/index-runs/:id` | Index run details |
| GET | `/api/index-runs/:id/progress` | Lightweight progress poll |
| GET | `/api/index-runs/:id/diagnostics` | Parse diagnostics |
| POST | `/api/index-runs/:id/cancel` | Cancel running index |
| POST | `/api/repositories/:id/retry` | Retry failed index |

## Security Controls

- No arbitrary shell execution (git commands use argument arrays)
- URL validation for GitHub URLs
- Path traversal prevention (normalized paths)
- No source code logging
- No LLM calls during indexing
- Temporary workspace cleanup after completion/failure

## Resource Limits

| Limit | Default |
|-------|---------|
| Max files | 10,000 |
| Max file size | 5MB |
| Max parse size | 500KB |
| Max indexing time | 5 minutes |
| Max concurrent jobs | 3 |
