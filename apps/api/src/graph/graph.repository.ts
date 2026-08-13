/**
 * GraphRepository — the ONLY place in the API that executes application
 * Cypher (Phase 5 §2, §26).
 *
 * Responsibilities:
 * - execute catalogued queries against DatabaseService (parameterized only)
 * - translate normalized records into the shared DTO contracts
 *
 * It knows nothing about HTTP, controllers, or validation. Domain decisions
 * (which query fits which node type, dedup rules) live in GraphService.
 */
import { Injectable } from '@nestjs/common';
import type {
  GraphEdge,
  GraphNode,
  GraphNodeRef,
  GraphResponse,
  NodeRelationships,
  NodeType,
  RelationshipType,
  RepositoryActivity,
  RepositoryComponent,
  SearchResultItem,
  TestCoverage,
  TraversalPath,
  TraversalResult,
} from '@tracegraph/shared';
import { DatabaseService } from '../database/database.service';
import { DEFAULT_RELATIONSHIP_LIMIT, GRAPH_NODE_TYPES } from './graph.constants';
import {
  asProperties,
  humanLabel,
  toGraphNode,
  toHistoryCommit,
  toHistoryIssue,
  toHistoryPullRequest,
  toNodeRef,
  toNodeRelationship,
  toNumber,
  toTestCoverage,
  type NodeRow,
  type RelationshipRow,
} from './mappers';
import {
  FIND_NODE_BY_ID,
  FIND_OUTGOING_RELATIONSHIPS,
  FIND_INCOMING_RELATIONSHIPS,
} from './queries/node.queries';
import {
  FIND_CLASS_DEPENDENCIES,
  FIND_CLASS_DEPENDENTS,
  FIND_CLASS_EXTENDS,
  FIND_FILE_IMPORTED_BY,
  FIND_FILE_IMPORTS,
  FIND_FUNCTION_CALLEES,
  FIND_FUNCTION_CALLERS,
  FIND_TESTS_FOR_CLASS,
  FIND_TESTS_FOR_CONTAINER,
  FIND_TESTS_FOR_FILE,
  FIND_TESTS_FOR_FUNCTION,
} from './queries/dependency.queries';
import { buildTraversalQuery } from './queries/traversal.queries';
import {
  FIND_COMMITS_FOR_ENTITY,
  FIND_ISSUES_FOR_ENTITY,
  FIND_PULL_REQUESTS_FOR_ENTITY,
} from './queries/history.queries';
import {
  COUNT_TRACEGRAPH_RELATIONSHIPS,
  FIND_DEFAULT_REPOSITORY,
  SEARCH_NODES,
  countNodesByLabel,
} from './queries/graph.queries';
import {
  FIND_REPOSITORY_ACTIVITY_COMMITS,
  FIND_REPOSITORY_ACTIVITY_ISSUES,
  FIND_REPOSITORY_ACTIVITY_PULL_REQUESTS,
  FIND_REPOSITORY_COMPONENTS,
} from './queries/repository.queries';

/** Row shapes produced by the catalogued queries. */
type RelRow = RelationshipRow;
interface DependencyRow extends NodeRow {
  relType?: string;
  relProps?: Record<string, unknown>;
}
interface OwnerRow {
  callee?: Record<string, unknown>;
  calleeFile?: Record<string, unknown>;
  owners?: Array<Record<string, unknown> | null>;
  relType?: string;
}
interface TraversalRow {
  target?: Record<string, unknown>;
  nodeType?: string;
  hops?: unknown;
  nodeIds?: string[];
  relTypes?: string[];
  relProps?: Array<Record<string, unknown>>;
}
interface CountRow {
  count?: unknown;
}

@Injectable()
export class GraphRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── Node details & relationships ────────────────────────────────────────────

  /** `GET /api/nodes/:id` — null when the node does not exist. */
  async findNodeById(id: string): Promise<GraphNode | null> {
    const rows = await this.db.executeRead<NodeRow[]>(
      (tx) => tx.run<NodeRow>(FIND_NODE_BY_ID, { id }),
      { name: 'find-node-by-id' },
    );
    return rows.length ? toGraphNode(rows[0]) : null;
  }

  /** `GET /api/nodes/:id/relationships` */
  async findNodeRelationships(
    id: string,
    limit = DEFAULT_RELATIONSHIP_LIMIT,
  ): Promise<{ incoming: RelationshipRow[]; outgoing: RelationshipRow[] }> {
    const [outgoing, incoming] = await Promise.all([
      this.db.executeRead<RelRow[]>(
        (tx) => tx.run<RelRow>(FIND_OUTGOING_RELATIONSHIPS, { id, limit }),
        { name: 'find-outgoing-relationships' },
      ),
      this.db.executeRead<RelRow[]>(
        (tx) => tx.run<RelRow>(FIND_INCOMING_RELATIONSHIPS, { id, limit }),
        { name: 'find-incoming-relationships' },
      ),
    ]);
    return { incoming, outgoing };
  }

  /** Builds the typed NodeRelationships response from raw relationship rows. */
  buildRelationships(
    node: GraphNode,
    incoming: RelationshipRow[],
    outgoing: RelationshipRow[],
  ): NodeRelationships {
    const self: GraphNodeRef = { id: node.id, type: node.type, label: node.label };
    return {
      node,
      incoming: incoming.map((row, i) => toNodeRelationship(row, 'incoming', i, self)),
      outgoing: outgoing.map((row, i) => toNodeRelationship(row, 'outgoing', i, self)),
    };
  }

  // ── Dependencies / dependents ───────────────────────────────────────────────

  /**
   * Direct dependency rows for a node. Returns raw rows; the service maps them
   * per node type. `[]` for types without dependency semantics.
   */
  async findDependencyRows(node: GraphNode, limit: number): Promise<DependencyRow[] | OwnerRow[]> {
    switch (node.type) {
      case 'Function':
        return this.db.executeRead<DependencyRow[]>(
          (tx) => tx.run<DependencyRow>(FIND_FUNCTION_CALLEES, { id: node.id, limit }),
          { name: 'find-function-callees' },
        );
      case 'File':
        return this.db.executeRead<DependencyRow[]>(
          (tx) => tx.run<DependencyRow>(FIND_FILE_IMPORTS, { id: node.id, limit }),
          { name: 'find-file-imports' },
        );
      case 'Class': {
        // Two queries: EXTENDS parents + CALLS callees (through the file).
        const [parents, callees] = await Promise.all([
          this.db.executeRead<DependencyRow[]>(
            (tx) => tx.run<DependencyRow>(FIND_CLASS_EXTENDS, { id: node.id, limit }),
            { name: 'find-class-extends' },
          ),
          this.db.executeRead<OwnerRow[]>(
            (tx) => tx.run<OwnerRow>(FIND_CLASS_DEPENDENCIES, { id: node.id, limit }),
            { name: 'find-class-dependencies' },
          ),
        ]);
        return [...parents, ...callees];
      }
      default:
        return [];
    }
  }

  /** Direct dependent rows for a node (reverse traversal). */
  async findDependentRows(node: GraphNode, limit: number): Promise<DependencyRow[] | OwnerRow[]> {
    switch (node.type) {
      case 'Function':
        return this.db.executeRead<DependencyRow[]>(
          (tx) => tx.run<DependencyRow>(FIND_FUNCTION_CALLERS, { id: node.id, limit }),
          { name: 'find-function-callers' },
        );
      case 'File':
        return this.db.executeRead<DependencyRow[]>(
          (tx) => tx.run<DependencyRow>(FIND_FILE_IMPORTED_BY, { id: node.id, limit }),
          { name: 'find-file-imported-by' },
        );
      case 'Class':
        return this.db.executeRead<OwnerRow[]>(
          (tx) => tx.run<OwnerRow>(FIND_CLASS_DEPENDENTS, { id: node.id, limit }),
          { name: 'find-class-dependents' },
        );
      default:
        return [];
    }
  }

  // ── Test coverage ───────────────────────────────────────────────────────────

  /** Tests covering the entity, resolved per node type. */
  async findTests(node: GraphNode, limit: number): Promise<TestCoverage[]> {
    const run = (
      cypher: string,
    ): Promise<Array<{ t?: Record<string, unknown>; fn?: Record<string, unknown> }>> =>
      this.db.executeRead((tx) => tx.run(cypher, { id: node.id, limit }), {
        name: `find-tests-${node.type.toLowerCase()}`,
      });

    let rows: Array<{ t?: Record<string, unknown>; fn?: Record<string, unknown> }>;
    switch (node.type) {
      case 'Function':
        rows = await run(FIND_TESTS_FOR_FUNCTION);
        break;
      case 'File':
        rows = await run(FIND_TESTS_FOR_FILE);
        break;
      case 'Class':
        rows = await run(FIND_TESTS_FOR_CLASS);
        break;
      case 'Repository':
      case 'Directory':
        rows = await run(FIND_TESTS_FOR_CONTAINER);
        break;
      default:
        rows = [];
    }
    return rows.map(toTestCoverage);
  }

  // ── History ─────────────────────────────────────────────────────────────────

  async findCommits(id: string, limit: number) {
    const rows = await this.db.executeRead<
      Array<{ c?: Record<string, unknown>; d?: Record<string, unknown> | null }>
    >((tx) => tx.run(FIND_COMMITS_FOR_ENTITY, { id, limit }), { name: 'find-commits-for-entity' });
    return rows.map(toHistoryCommit);
  }

  async findPullRequests(id: string, limit: number) {
    const rows = await this.db.executeRead<Array<{ pr?: Record<string, unknown> }>>(
      (tx) => tx.run(FIND_PULL_REQUESTS_FOR_ENTITY, { id, limit }),
      { name: 'find-pull-requests-for-entity' },
    );
    return rows.map(toHistoryPullRequest);
  }

  async findIssues(id: string, limit: number) {
    const rows = await this.db.executeRead<Array<{ i?: Record<string, unknown> }>>(
      (tx) => tx.run(FIND_ISSUES_FOR_ENTITY, { id, limit }),
      { name: 'find-issues-for-entity' },
    );
    return rows.map(toHistoryIssue);
  }

  // ── Multi-hop traversal (shared with the graph neighborhood) ────────────────

  /**
   * Bounded multi-hop reachability. Returns deduplicated nodes (min hop
   * distance), deduplicated edges, and up to `pathLimit` evidence paths.
   * `depth` is a validated integer (DTO clamps 1..4); `types` come from the
   * TRAVERSAL_TYPES whitelist — the one sanctioned structural interpolation.
   */
  async traverseFromNode(
    root: GraphNodeRef,
    depth: number,
    types: readonly string[],
    pathLimit: number,
  ): Promise<TraversalResult> {
    return this.collectTraversal(root, depth, types, pathLimit, 'out');
  }

  /** Reverse-direction walk: everything that REACHES the root. */
  private async traverseIntoNode(
    root: GraphNodeRef,
    depth: number,
    types: readonly string[],
    pathLimit: number,
  ): Promise<TraversalResult> {
    return this.collectTraversal(root, depth, types, pathLimit, 'in');
  }

  /** Runs the traversal query and merges rows into a deduplicated result. */
  private async collectTraversal(
    root: GraphNodeRef,
    depth: number,
    types: readonly string[],
    pathLimit: number,
    direction: 'out' | 'in',
  ): Promise<TraversalResult> {
    const cypher = buildTraversalQuery(depth, types, pathLimit, direction);
    const rows = await this.db.executeRead<TraversalRow[]>(
      (tx) => tx.run<TraversalRow>(cypher, { rootId: root.id }),
      { name: direction === 'out' ? 'traverse-from-node' : 'traverse-into-node' },
    );

    const nodeById = new Map<string, GraphNodeRef & { hops: number }>();
    const edgeByKey = new Map<string, GraphEdge>();
    const seenPaths = new Set<string>();
    const paths: TraversalPath[] = [];

    for (const row of rows) {
      const hops = toNumber(row.hops);
      const props = asProperties(row.target);
      const ref = toNodeRef(String(props.id ?? ''), row.nodeType ?? 'File', humanLabel(props));
      const existing = nodeById.get(ref.id);
      if (!existing || hops < existing.hops) {
        nodeById.set(ref.id, { ...ref, hops });
      }

      // Raw path arrays: for the 'in' walk the query returns them end→…→start.
      // EDGES keep the raw orientation — the pattern already encodes the true
      // semantic direction. Only the evidence PATHS are canonicalized to
      // start→…→end so callers read them uniformly.
      const rawNodeIds = row.nodeIds ?? [];
      const rawRelTypes = row.relTypes ?? [];
      const rawRelProps = row.relProps ?? [];

      for (let i = 0; i < rawRelTypes.length; i += 1) {
        const source = rawNodeIds[i];
        const target = rawNodeIds[i + 1];
        const type = rawRelTypes[i] as RelationshipType;
        const key = `${source}|${type}|${target}`;
        if (!edgeByKey.has(key)) {
          edgeByKey.set(key, {
            id: `e-${edgeByKey.size + 1}`,
            source,
            target,
            type,
            properties: rawRelProps[i] ?? {},
          });
        }
      }

      if (rawNodeIds.length > 1) {
        const nodeIds = direction === 'in' ? [...rawNodeIds].reverse() : rawNodeIds;
        const relTypes = direction === 'in' ? [...rawRelTypes].reverse() : rawRelTypes;
        const pathKey = JSON.stringify(nodeIds);
        if (!seenPaths.has(pathKey)) {
          seenPaths.add(pathKey);
          paths.push({ nodes: nodeIds, relTypes: relTypes as RelationshipType[] });
        }
      }
    }

    return {
      root,
      depth,
      nodes: [...nodeById.values()],
      edges: [...edgeByKey.values()],
      paths,
    };
  }

  /** Merges two traversal results keeping minimum hop distances. */
  private mergeTraversals(a: TraversalResult, b: TraversalResult): TraversalResult {
    const nodeById = new Map<string, GraphNodeRef & { hops: number }>(
      a.nodes.map((n) => [n.id, n]),
    );
    for (const n of b.nodes) {
      const existing = nodeById.get(n.id);
      if (!existing || n.hops < existing.hops) {
        nodeById.set(n.id, n);
      }
    }
    const edgeByKey = new Map<string, GraphEdge>();
    for (const edge of [...a.edges, ...b.edges]) {
      const key = `${edge.source}|${edge.type}|${edge.target}`;
      if (!edgeByKey.has(key)) {
        edgeByKey.set(key, edge);
      }
    }
    return {
      root: a.root,
      depth: Math.max(a.depth, b.depth),
      nodes: [...nodeById.values()],
      edges: [...edgeByKey.values()],
      paths: a.paths,
    };
  }

  /**
   * `GET /api/graph` — everything CONNECTED to the root within `depth` hops
   * (expanded in both directions, deduplicated, min-hop distances).
   * Bidirectional on purpose: containment points UP from classes/functions, so
   * a class root still shows its file, directory, and neighbors. The traversal
   * endpoint stays one-directional (dependency reachability semantics).
   */
  async findGraphNeighborhood(
    root: GraphNode,
    depth: number,
    types: readonly string[],
    nodeLimit: number,
  ): Promise<GraphResponse> {
    const pathLimit = Math.min(nodeLimit * 4, 1000);
    const rootRef: GraphNodeRef = { id: root.id, type: root.type, label: root.label };
    const [outgoing, incoming] = await Promise.all([
      this.traverseFromNode(rootRef, depth, types, pathLimit),
      this.traverseIntoNode(rootRef, depth, types, pathLimit),
    ]);
    const traversal = this.mergeTraversals(outgoing, incoming);

    // Project traversal nodes/edges into the graph response, including the root.
    const nodeById = new Map<string, GraphNode>([[root.id, root]]);
    for (const n of traversal.nodes) {
      if (!nodeById.has(n.id)) {
        nodeById.set(n.id, { id: n.id, type: n.type, label: n.label, properties: {} });
      }
    }
    const nodes = [...nodeById.values()].slice(0, nodeLimit);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = traversal.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { root: rootRef, depth, nodes, edges };
  }

  // ── Repository overview & search ────────────────────────────────────────────

  async findDefaultRepository(): Promise<GraphNode | null> {
    const rows = await this.db.executeRead<NodeRow[]>(
      (tx) => tx.run<NodeRow>(FIND_DEFAULT_REPOSITORY),
      {
        name: 'find-default-repository',
      },
    );
    return rows.length ? toGraphNode(rows[0]) : null;
  }

  /** Counts per TraceGraph label (10 lightweight queries, run in parallel). */
  async countNodesByLabel(): Promise<Record<string, number>> {
    const entries = await Promise.all(
      GRAPH_NODE_TYPES.map(async (label) => {
        const rows = await this.db.executeRead<CountRow[]>(
          (tx) => tx.run<CountRow>(countNodesByLabel(label)),
          { name: `count-${label.toLowerCase()}` },
        );
        return [label, toNumber(rows[0]?.count)] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  /** Total relationships between TraceGraph-labeled nodes. */
  async countTraceGraphRelationships(): Promise<number> {
    const rows = await this.db.executeRead<CountRow[]>(
      (tx) => tx.run<CountRow>(COUNT_TRACEGRAPH_RELATIONSHIPS, { labels: [...GRAPH_NODE_TYPES] }),
      { name: 'count-tracegraph-relationships' },
    );
    return toNumber(rows[0]?.count);
  }

  /** Deterministic substring search across the TraceGraph labels. */
  async search(q: string, limit = 20): Promise<SearchResultItem[]> {
    const rows = await this.db.executeRead<NodeRow[]>(
      (tx) => tx.run<NodeRow>(SEARCH_NODES, { q, limit }),
      { name: 'search-nodes' },
    );
    return rows
      .map((row) => toGraphNode(row))
      .map((n) => ({ id: n.id, type: n.type, label: n.label }));
  }

  // ── Repository-level intelligence (Phase 6) ─────────────────────────────────

  /** Recent commits / PRs / issues across the whole repository (3 parallel reads). */
  async findRepositoryActivity(repoId: string, limit: number): Promise<RepositoryActivity> {
    const [commits, pullRequests, issues] = await Promise.all([
      this.db.executeRead<
        Array<{ c?: Record<string, unknown>; d?: Record<string, unknown> | null }>
      >((tx) => tx.run(FIND_REPOSITORY_ACTIVITY_COMMITS, { id: repoId, limit }), {
        name: 'repository-activity-commits',
      }),
      this.db.executeRead<Array<{ pr?: Record<string, unknown> }>>(
        (tx) => tx.run(FIND_REPOSITORY_ACTIVITY_PULL_REQUESTS, { id: repoId, limit }),
        { name: 'repository-activity-pull-requests' },
      ),
      this.db.executeRead<Array<{ i?: Record<string, unknown> }>>(
        (tx) => tx.run(FIND_REPOSITORY_ACTIVITY_ISSUES, { id: repoId, limit }),
        { name: 'repository-activity-issues' },
      ),
    ]);
    return {
      commits: commits.map(toHistoryCommit),
      pullRequests: pullRequests.map(toHistoryPullRequest),
      issues: issues.map(toHistoryIssue),
    };
  }

  /** Core components ranked by distinct calling functions. */
  async findRepositoryComponents(repoId: string, limit: number): Promise<RepositoryComponent[]> {
    const rows = await this.db.executeRead<
      Array<{ n?: Record<string, unknown>; nodeType?: string; dependents?: unknown }>
    >((tx) => tx.run(FIND_REPOSITORY_COMPONENTS, { id: repoId, limit }), {
      name: 'repository-components',
    });
    return rows.map((row) => {
      const props = asProperties(row.n);
      return {
        id: String(props.id ?? ''),
        type: (row.nodeType ?? 'Class') as NodeType,
        label: humanLabel(props),
        dependents: toNumber(row.dependents),
      };
    });
  }
}

export type { NodeType };
