# Synchronization Architecture (Phase 15)

## Overview

Phase 15 transforms TraceGraph from a snapshot analyzer into a **living context graph**. Instead of re-indexing the entire repository on every change, the system:

1. Detects the current git revision
2. Computes a diff against the graph's stored revision
3. Identifies exactly which files changed (added/modified/deleted/renamed)
4. Re-parses only changed files
5. Builds a GraphDelta (entity + relationship additions/removals)
6. Applies the delta to CognoDB transactionally
7. Promotes the revision only after full success

```
Repository HEAD (abc123)
        │
        ▼
Revision Detector (git rev-parse)
        │
        ▼
Git Diff Engine (git diff --name-status)
        │
        ▼
ChangeSet { added, modified, deleted, renamed }
        │
        ▼
Incremental Parser (only changed files)
        │
        ▼
GraphDeltaBuilder (diff old vs new entities/relationships)
        │
        ▼
GraphDeltaApplier (transactional CognoDB writes)
        │
        ▼
Revision Promotion (only on success)
```

## Key Invariants

### Invariant 1: Revision Promotion
The graph revision ONLY advances after the entire delta is applied successfully. A failed sync NEVER promotes the revision.

### Invariant 2: Graph Preservation
A failed sync never destroys the previous valid graph. The old graph remains fully usable.

### Invariant 3: Immutability
A SyncRun is immutable after completion. Retry creates a new SyncRun.

### Invariant 4: Historical Preservation
When removing a deleted file's code entities, historical Commit→MODIFIES relationships are preserved.

## Components

### GitDiffEngine (`git-diff-engine.ts`)

Safe git command execution with argument arrays (no shell interpolation):

- `getCurrentRevision(root)` → SHA
- `getRevisionDetails(root, sha)` → Revision
- `computeChangeSet(root, from, to)` → ChangeSet
- `getCommitsBehind(root, from, to)` → number

### GraphDeltaBuilder (`graph-delta-builder.ts`)

Pure computation — compares old file graph state with fresh parse results:

- Entity diffing: ADDED, UPDATED, REMOVED, UNCHANGED
- Relationship diffing: ADDED, REMOVED
- Deduplication of entity deltas
- Handles renamed files as delete+create

### GraphDeltaApplier (`graph-delta-applier.ts`)

Transactional CognoDB writes in strict order:

1. Remove stale relationships (before entities, avoid dangling refs)
2. Remove stale entities (preserve Commit nodes)
3. Upsert changed entities (MERGE)
4. Add new relationships
5. Update repository graph revision (only after all succeed)

### SyncWorker (`sync-worker.ts`)

Background job orchestrator:

```
CHECKING_REVISION → COMPUTING_DIFF → PARSING_CHANGES
→ RESOLVING_RELATIONSHIPS → APPLYING_GRAPH_DELTA → FINALIZING
```

Max 3 concurrent syncs. Duplicate syncs for the same repo are prevented.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/repositories/:id/sync` | Start incremental sync |
| GET | `/api/repositories/:id/sync-runs` | List sync runs |
| GET | `/api/repositories/:id/revision` | Revision status |
| GET | `/api/sync-runs/:id` | Sync run details |
| GET | `/api/sync-runs/:id/progress` | Progress poll |
| POST | `/api/sync-runs/:id/cancel` | Cancel running sync |
| POST | `/api/sync-runs/:id/retry` | Retry failed sync |

## ChangeSet Model

```typescript
ChangeSet {
  fromRevision: string;
  toRevision: string;
  addedFiles: FileChange[];
  modifiedFiles: FileChange[];
  deletedFiles: FileChange[];
  renamedFiles: FileChange[];
  totalChanges: number;
}
```

Each FileChange includes: path, status, oldPath (for renames), linesAdded, linesDeleted.

## GraphDelta Model

```typescript
GraphDelta {
  entities: EntityDelta[];      // ADDED | UPDATED | REMOVED
  relationships: RelationshipDelta[];  // ADDED | REMOVED
  summary: { entitiesAdded, entitiesUpdated, entitiesRemoved,
             relationshipsAdded, relationshipsRemoved };
}
```

## Deleted File Behavior

When a source file is deleted:
- **Removed**: File node, Function/Class/Interface/etc. nodes, CONTAINS/IMPORTS/CALLS/EXTENDS edges
- **Preserved**: Commit→MODIFIES edges (historical engineering context)

## Performance Comparison

| Operation | Full Index (1,800 files) | Incremental Sync (18 changed) |
|-----------|--------------------------|-------------------------------|
| Files parsed | 1,800 | 18 |
| Entities processed | ~8,000 | ~100 |
| Relationships processed | ~12,000 | ~150 |
| Typical duration | 30-60s | 2-5s |
