/**
 * @tracegraph/shared — shared contracts between the Next.js frontend and the
 * NestJS backend.
 *
 * This package intentionally contains **types only** (no runtime code), so both
 * applications can consume it with zero build overhead. If runtime helpers are
 * ever needed here, add a build step (tsc → dist) before shipping them.
 */

// ── Graph model ─────────────────────────────────────────────────────────────
// The label/type lists below are the graph schema contract: the write path
// (e.g. the GitHub import pipeline) must produce exactly these labels and
// relationship types.

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
  | 'IMPLEMENTS'
  | 'REFERENCES'
  | 'DEFINES'
  | 'OVERRIDES'
  | 'TESTS'
  | 'MODIFIES'
  | 'AUTHORED_BY'
  | 'RELATED_TO'
  | 'CROSS_LANGUAGE';

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

// ── Graph API ─────────────────────────────────────────────────────────────────
// Response DTOs shared by the backend and the React Flow frontend.
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
  /** Source path (files) or containing file (classes), when the graph has one. */
  path?: string;
  /** Up to 3 distinct caller names — who depends on this component. */
  topDependents?: string[];
}

/** One imported repository in the graph — for the repo switcher. */
export interface ImportedRepository {
  id: string;
  name: string;
  fullName: string;
  description: string;
  language: string;
  /** Whether this is the repository the app currently surfaces. */
  active: boolean;
}

/** `POST /api/repository/active` — switch the active repository. */
export interface SetActiveRepositoryResult {
  active: ImportedRepository;
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
 * Deterministic, explainable severity indicator. Computed
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
 * One recorded impact analysis (CognoDB-backed history). Snapshot
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

/** One piece of grounded evidence with a stable local id the LLM can cite. */
export interface AiEvidenceItem {
  /** Stable local id (E1, E2, …) that the explanation can reference. */
  id: string;
  kind: 'path' | 'test' | 'commit' | 'pullRequest' | 'issue';
  /** Human-readable description, e.g. "CheckoutService → CALLS → PaymentService". */
  description: string;
  /** Ordered entity ids affected → … → root (path evidence only). */
  nodes?: string[];
  /** Relationship types between consecutive nodes (path evidence only). */
  relTypes?: RelationshipType[];
  /** Direct (distance 1) vs indirect path evidence. */
  direction?: 'direct' | 'indirect';
  /** Short label for chips, e.g. "PR #421" or the test file path. */
  label: string;
}

/** Qualitative confidence — never a fabricated percentage. */
export type AiConfidence = 'high' | 'medium' | 'insufficient';

/**
 * The validated AI explanation response. `evidence` is the bounded payload the
 * explanation is grounded on; `evidenceReferences` are the ids the model cited.
 */
export interface ImpactExplanation {
  summary: string;
  keyFindings: string[];
  directImpact: string[];
  indirectImpact: string[];
  /** Evidence ids the explanation cites (always a subset of `evidence`). */
  evidenceReferences: string[];
  confidence: AiConfidence;
  /** The bounded evidence payload the explanation is grounded on. */
  evidence: AiEvidenceItem[];
  generatedAt: string;
  /** The model that produced the explanation (provider-reported). */
  model: string;
  grounding: {
    source: 'cognodb-impact-analysis';
  };
}

/** One repository the signed-in user can import. */
export interface GithubRepo {
  id: number;
  fullName: string;
  name: string;
  description: string;
  language: string;
  defaultBranch: string;
  private: boolean;
  /** ISO timestamp of the last push. */
  updatedAt: string;
}

/** Result of a completed import (server-computed counts). */
export interface GithubImportResult {
  fullName: string;
  repositoryId: string;
  nodesCreated: number;
  relationshipsCreated: number;
  files: number;
  functions: number;
  classes: number;
  tests: number;
  commits: number;
  pullRequests: number;
  issues: number;
  durationMs: number;
}

/** Stage of an in-flight import — mirrors the import pipeline order. */
export type GithubImportStage =
  | 'fetching'
  | 'parsing'
  | 'building'
  | 'history'
  | 'persisting';

/** Live status of a background import job. */
export interface GithubImportJob {
  jobId: string;
  fullName: string;
  status: 'running' | 'done' | 'error';
  /** Current pipeline stage while running. */
  stage: GithubImportStage | 'none';
  stageLabel: string;
  /** Optional stage detail, e.g. the file count fetched so far. */
  detail?: string;
  result?: GithubImportResult;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

/** `POST /api/github/import` — starts the background job and returns its id. */
export interface GithubImportJobStart {
  jobId: string;
  fullName: string;
}

/** One dead-code / orphan candidate: an entity nothing depends on. */
export interface OrphanEntity {
  id: string;
  type: NodeType;
  label: string;
  /** Inbound dependency relationships — always 0 for an orphan by definition. */
  incomingDependencies: number;
  /** Whether any test covers this entity (context: covered orphans are safer). */
  hasTests: boolean;
  /** Commits touching the entity — recently-changed orphans are the risky kind. */
  commits: number;
}

/** `GET /api/intelligence/orphans` */
export interface OrphanListResponse {
  repo: GraphNodeRef;
  orphans: OrphanEntity[];
}

/** The three architecture-smell categories. */
export type SmellKind = 'cycle' | 'god-module' | 'fragile';

/** One detected architecture smell with its explainable graph facts. */
export interface ArchitectureSmell {
  kind: SmellKind;
  /** Human title, e.g. "Circular import cycle". */
  title: string;
  /** One-sentence explanation of why this is a smell, from graph facts. */
  reason: string;
  /** Entities involved: cycle members, or the single offending module. */
  entities: GraphNodeRef[];
  /** Supporting metrics (cycleLength / fanIn / fanOut / commits / dependents). */
  metrics: Record<string, number>;
}

/** `GET /api/intelligence/smells` */
export interface SmellResponse {
  repo: GraphNodeRef;
  cycles: ArchitectureSmell[];
  godModules: ArchitectureSmell[];
  fragile: ArchitectureSmell[];
}

/** One entity with no test coverage (a test-blast-radius gap). */
export interface TestGapEntity {
  id: string;
  type: NodeType;
  label: string;
  /** Functions in the file with no TESTS coverage (files only; 0 for classes). */
  untestedFunctions: number;
  /** Inbound dependents (severity context: widely-used untested code is riskier). */
  dependents: number;
  /** Commits touching the entity (change-frequency context). */
  commits: number;
}

/** `GET /api/intelligence/test-gaps` */
export interface TestGapResponse {
  repo: GraphNodeRef;
  gaps: TestGapEntity[];
}

/** One test to run for a change, ranked server-side by coverage weight. */
export interface TestToRun {
  id: string;
  name: string;
  framework: string;
  filePath: string;
  /** Distinct affected entities this test covers. */
  covers: number;
  /** Of those, how many are changed files directly. */
  directlyCovers: number;
  /** Server-computed rank = directlyCovers * 2 + indirect covers. */
  risk: number;
}

/** `POST /api/intelligence/tests-for-change` */
export interface TestsForChangeResponse {
  /** Entities resolved from the requested ids (changed surface). */
  changed: GraphNodeRef[];
  /** Requested ids that don't exist in the graph. */
  unresolved: string[];
  /** Tests to run, ordered by risk (desc). */
  tests: TestToRun[];
}

/** `POST /api/intelligence/blast-radius` — PR/diff blast radius. */
export interface BlastRadiusResponse {
  repo: GraphNodeRef;
  depth: number;
  /** Changed files resolved in the graph. */
  changed: GraphNodeRef[];
  /** Changed paths that don't exist in the graph (new files, ignored paths). */
  unresolved: string[];
  /** Dependents one hop from any changed file. */
  directImpact: ImpactedEntity[];
  /** Dependents reached transitively beyond one hop. */
  indirectImpact: ImpactedEntity[];
  /** Potentially affected tests across the changed surface. */
  tests: TestCoverage[];
  summary: {
    changed: number;
    direct: number;
    indirect: number;
    tests: number;
    score: ImpactScore;
    scoreReasons: string[];
  };
}

/** One developer ranked by commit authorship on an entity or repo. */
export interface KnowledgeOwner {
  developer: GraphNodeRef;
  commits: number;
  lastCommit: string | null;
}

/** `GET /api/intelligence/knowledge?entityId=` */
export interface KnowledgeResponse {
  repo: GraphNodeRef;
  /** The entity the map is scoped to, when requested. */
  entity: GraphNodeRef | null;
  owners: KnowledgeOwner[];
}

/** Language distribution item for sync status. */
export interface LanguageDistribution {
  language: string;
  fileCount: number;
  functionCount: number;
  classCount: number;
}

/** `GET /api/repository/sync-status` — current graph sync health. */
export interface SyncStatus {
  /** ISO timestamp of the last import or re-sync. */
  lastSyncAt: string | null;
  /** ISO timestamp of the repository's last GitHub push. */
  lastPushAt: string | null;
  /** The full name of the active repository (owner/repo). */
  repository: string;
  /** Total entities in the graph. */
  totalNodes: number;
  /** Total relationships in the graph. */
  totalRelationships: number;
  /** Per-language breakdown. */
  languages: LanguageDistribution[];
  /** Graph entity counts. */
  stats: {
    files: number;
    functions: number;
    classes: number;
    tests: number;
    directories: number;
    commits: number;
    pullRequests: number;
    issues: number;
    developers: number;
  };
}

/** `POST /api/repository/resync` — result of an incremental re-sync. */
export interface SyncDelta {
  /** Whether any changes were detected. */
  hasChanges: boolean;
  /** Number of new files added. */
  filesAdded: number;
  /** Number of existing files modified. */
  filesChanged: number;
  /** Number of files removed. */
  filesRemoved: number;
  /** Number of unchanged files (skipped). */
  filesUnchanged: number;
  /** Total entities parsed from the changed files. */
  entitiesParsed: number;
  /** Total relationships resolved from the changed files. */
  relationshipsResolved: number;
  /** Duration of the full re-sync in milliseconds. */
  durationMs: number;
}

export * from './ingestion';
export * from './sync';
export * from './history';
export * from './test-intelligence';

/** Standard error body returned by the API. */
export interface ApiError {
  statusCode: number;
  message: string | string[];
  code: string;
  timestamp: string;
  path?: string;
  details?: unknown;
}
