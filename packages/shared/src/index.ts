/**
 * @tracegraph/shared — shared contracts between the Next.js frontend and the
 * NestJS backend.
 *
 * This package intentionally contains **types only** (no runtime code), so both
 * applications can consume it with zero build overhead. If runtime helpers are
 * ever needed here, add a build step (tsc → dist) before shipping them.
 */

// ── Graph model (Phase 1 §10) ─────────────────────────────────────────────────
// The label/type lists below MUST match the schema implemented by the Phase 4
// seed (scripts/seed/types.ts + dataset). Verified against the live graph.

export type NodeType =
  | 'Repository'
  | 'Directory'
  | 'File'
  | 'Function'
  | 'Class'
  | 'Test'
  | 'Commit'
  | 'PullRequest'
  | 'Issue'
  | 'Developer';

export type RelationshipType =
  | 'CONTAINS'
  | 'IMPORTS'
  | 'CALLS'
  | 'EXTENDS'
  | 'TESTS'
  | 'MODIFIES'
  | 'AUTHORED_BY'
  | 'RELATED_TO';

// ── Health ────────────────────────────────────────────────────────────────────

/** `GET /api/health` */
export interface AppHealth {
  status: 'ok';
  service: string;
  timestamp: string;
  version: string;
}

/** `GET /api/health/database` */
export interface DatabaseHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  /** Sanitized, human-readable reason. Never contains credentials or URIs. */
  error?: string;
}

// ── Graph API (Phase 5 §7–§23) ────────────────────────────────────────────────
// Response DTOs shared by the backend and the future React Flow frontend.
// The frontend must never see Neo4j-specific structures (Records, Integers).

/** A node as returned by the API. `properties` is the node's raw property map. */
export interface GraphNode {
  id: string;
  type: NodeType;
  /** Human-readable name (name / title / path basename / sha / username). */
  label: string;
  properties: Record<string, unknown>;
}

/** A lightweight reference to a node (used inside relationships, paths, …). */
export interface GraphNodeRef {
  id: string;
  type: NodeType;
  label: string;
}

/** A normalized edge between two node ids. Edge ids are response-scoped. */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  properties: Record<string, unknown>;
}

/** One relationship with full endpoint references. */
export interface NodeRelationship {
  id: string;
  type: RelationshipType;
  source: GraphNodeRef;
  target: GraphNodeRef;
  properties: Record<string, unknown>;
}

/** `GET /api/nodes/:id/relationships` */
export interface NodeRelationships {
  node: GraphNode;
  incoming: NodeRelationship[];
  outgoing: NodeRelationship[];
}

/** One dependency/dependent target (`GET /api/nodes/:id/dependencies|dependents`). */
export interface DependencyTarget {
  id: string;
  type: NodeType;
  label: string;
  relationshipType: RelationshipType;
  /** The concrete function through which a class-level dependency flows. */
  via?: GraphNodeRef;
}

/** One test covering an entity (`GET /api/nodes/:id/tests`). */
export interface TestCoverage {
  id: string;
  name: string;
  framework: string;
  filePath: string;
  target: GraphNodeRef;
}

/**
 * `GET /api/nodes/:id/relationship-summary` — one lightweight request with
 * the counts behind every Dependency Explorer category. Lets the UI render
 * counts without fetching each relationship list up front.
 */
export interface RelationshipSummary {
  /** Total incoming + outgoing relationships for the node. */
  relationships: number;
  dependencies: number;
  dependents: number;
  callers: number;
  callees: number;
  tests: number;
  commits: number;
  pullRequests: number;
  issues: number;
}

/** `GET /api/repository` — label-scoped statistics for the TraceGraph dataset. */
export interface RepositoryStats {
  directories: number;
  files: number;
  functions: number;
  classes: number;
  tests: number;
  commits: number;
  pullRequests: number;
  issues: number;
  developers: number;
}

export interface RepositoryOverview {
  id: string;
  name: string;
  fullName: string;
  description: string;
  language: string;
  defaultBranch: string;
  stats: RepositoryStats;
  relationshipCount: number;
}

/** `GET /api/nodes/:id/commits` */
export interface HistoryCommit {
  sha: string;
  message: string;
  timestamp: string;
  branch: string;
  author: { username: string; name: string } | null;
}

/** `GET /api/nodes/:id/pull-requests` */
export interface HistoryPullRequest {
  number: number;
  title: string;
  status: string;
  createdAt: string;
  mergedAt?: string;
}

/** `GET /api/nodes/:id/issues` */
export interface HistoryIssue {
  number: number;
  title: string;
  status: string;
  createdAt: string;
}

/** `GET /api/repository/activity` — repo-wide recent engineering activity. */
export interface RepositoryActivity {
  commits: HistoryCommit[];
  pullRequests: HistoryPullRequest[];
  issues: HistoryIssue[];
}

/** `GET /api/repository/components` — core components ranked by dependents. */
export interface RepositoryComponent {
  id: string;
  type: NodeType;
  label: string;
  /** Number of distinct callers (functions) that depend on this component. */
  dependents: number;
}

/** One evidence path in a traversal result: root → … → target. */
export interface TraversalPath {
  /** Ordered node ids from root to target (inclusive). */
  nodes: string[];
  /** Relationship types between consecutive nodes (length = nodes.length - 1). */
  relTypes: RelationshipType[];
}

/** `GET /api/traversal/:id` — bounded multi-hop reachability. */
export interface TraversalResult {
  root: GraphNodeRef;
  depth: number;
  /** Reachable nodes, deduplicated, each with the minimum hop distance. */
  nodes: Array<GraphNodeRef & { hops: number }>;
  /** Deduplicated edges (min-hop distance). */
  edges: GraphEdge[];
  /** Up to the requested path limit of evidence paths. */
  paths: TraversalPath[];
}

/** `GET /api/graph` — neighborhood for graph visualization. */
export interface GraphResponse {
  root: GraphNodeRef;
  depth: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** `GET /api/search?q=` */
export interface SearchResultItem extends GraphNodeRef {}

// ── Impact Analysis (Phase 9) ─────────────────────────────────────────────────
// `GET /api/impact/:id` — deterministic, graph-driven change impact. See
// apps/api/src/impact for the engine.

export type ImpactType = 'DIRECT' | 'INDIRECT';

/** One entity reached by the impact traversal, with its explanation. */
export interface ImpactedEntity {
  id: string;
  type: NodeType;
  label: string;
  impactType: ImpactType;
  /** Hop distance from the root (1 = direct). */
  distance: number;
  /** The first-hop relationship type connecting this entity to the chain. */
  relationship: RelationshipType;
  /** Deterministic explanation built from graph facts (never an LLM). */
  reason: string;
  /** The concrete function through which CALLS impact flows, when known. */
  via?: GraphNodeRef;
  /** Evidence chain ordered from this affected entity back to the root. */
  path: ImpactPath;
}

/** An evidence path in the impact response: affected → … → root. */
export interface ImpactPath {
  /** Ordered entity refs from the affected entity to the root (inclusive). */
  nodes: GraphNodeRef[];
  /** Relationship types between consecutive nodes (length = nodes.length - 1). */
  relTypes: RelationshipType[];
}

/**
 * Deterministic, explainable severity indicator (Phase 9 §19). Computed
 * server-side from graph facts (dependents, depth coverage, test exposure) —
 * never a machine-learning risk prediction.
 */
export type ImpactScore = 'LOW' | 'MEDIUM' | 'HIGH';

/** Server-computed impact counts — the frontend never derives these itself. */
export interface ImpactSummary {
  direct: number;
  indirect: number;
  tests: number;
  commits: number;
  pullRequests: number;
  issues: number;
  /** The traversal depth the analysis ran at. */
  maxDepth: number;
  /** Deterministic severity indicator derived from graph facts. */
  score: ImpactScore;
  /** Human-readable graph-fact explanations behind the score. */
  scoreReasons: string[];
}

export interface ImpactHistory {
  commits: HistoryCommit[];
  pullRequests: HistoryPullRequest[];
  issues: HistoryIssue[];
}

/**
 * One recorded impact analysis (Phase 10 — CognoDB-backed history). Snapshot
 * nodes live in the graph labeled `ImpactSnapshot`, tied to the repository via
 * a `BELONGS_TO` relationship, so analyses are shared across devices/users.
 * The `type` field is the analyzed ENTITY's type (Class/File/…), not the
 * snapshot node's label.
 */
export interface ImpactSnapshot {
  /** CognoDB node id of the snapshot itself. */
  id: string;
  nodeId: string;
  label: string;
  type: NodeType;
  depth: number;
  score: ImpactScore;
  direct: number;
  indirect: number;
  tests: number;
  /** Epoch milliseconds when the analysis completed. */
  timestamp: number;
  /** Repository this snapshot belongs to. */
  repoId: string;
  repoName: string;
  /** The user who ran the analysis, when known from the session. */
  analyzedBy: { username: string; name: string } | null;
}

/** `GET/POST /api/impact-history` — snapshot list newest first. */
export interface ImpactHistoryListResponse {
  repo: GraphNodeRef;
  snapshots: ImpactSnapshot[];
}

/** `GET /api/impact/:id?depth=&limit=` */
export interface ImpactResponse {
  root: GraphNodeRef;
  depth: number;
  summary: ImpactSummary;
  directImpact: ImpactedEntity[];
  indirectImpact: ImpactedEntity[];
  /** Potentially affected tests (root + impacted entities, deduplicated). */
  tests: TestCoverage[];
  /** Engineering history context for the selected entity. */
  history: ImpactHistory;
  /** Deduplicated entity-level evidence paths (affected → … → root). */
  paths: ImpactPath[];
}

// ── Errors ────────────────────────────────────────────────────────────────────

/** Standard error body returned by the API (see Phase 1 §18). */
export interface ApiError {
  statusCode: number;
  message: string | string[];
  code: string;
  timestamp: string;
  path?: string;
  details?: unknown;
}
