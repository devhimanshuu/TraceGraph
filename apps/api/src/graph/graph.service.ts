/**
 * GraphService — use-case orchestration for every node-scoped graph read
 * (Phase 5 §2).
 *
 * Owns the business rules the controllers must not contain:
 * - 404 semantics for unknown nodes
 * - default values and bounds for depth/limit
 * - type-aware dependency/dependent/test resolution
 * - deduplication of class-level dependency targets
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  DependencyTarget,
  GraphNode,
  GraphNodeRef,
  GraphResponse,
  NodeRelationships,
  NodeType,
  RelationshipType,
  SearchResultItem,
  TestCoverage,
  TraversalResult,
} from '@tracegraph/shared';
import {
  DEFAULT_GRAPH_NODES,
  DEFAULT_TRAVERSAL_DEPTH,
  DEFAULT_TRAVERSAL_PATHS,
  GRAPH_RELATIONSHIP_TYPES,
  TRAVERSAL_TYPES,
} from './graph.constants';
import { GraphRepository } from './graph.repository';
import { asProperties, humanLabel } from './mappers';
import type { GraphQueryDto } from './dto/graph-query.dto';
import type { TraversalQueryDto } from './dto/traversal-query.dto';

/** Plain node row (Function/File dependencies). */
interface DependencyRow {
  n?: Record<string, unknown>;
  nodeType?: string;
  relType?: string;
  relProps?: Record<string, unknown>;
}

/** Class owner row: leaf function + owner candidates (callee=dep, caller=dependent). */
interface OwnerDependencyRow {
  callee?: Record<string, unknown>;
  caller?: Record<string, unknown>;
  calleeFile?: Record<string, unknown>;
  callerFile?: Record<string, unknown>;
  owners?: Array<Record<string, unknown> | null>;
  relType?: string;
}

@Injectable()
export class GraphService {
  constructor(private readonly repository: GraphRepository) {}

  /** Fetches a node or throws 404 — the single existence gate for node routes. */
  async getNode(id: string): Promise<GraphNode> {
    const node = await this.repository.findNodeById(id);
    if (!node) {
      throw new NotFoundException(`Node "${id}" was not found`);
    }
    return node;
  }

  // ── Graph neighborhood ──────────────────────────────────────────────────────

  async getGraph(query: GraphQueryDto): Promise<GraphResponse> {
    const rootId = query.rootId ?? (await this.resolveDefaultRoot());
    const root = await this.getNode(rootId);

    const depth = query.depth ?? DEFAULT_TRAVERSAL_DEPTH;
    const types = query.relationshipTypes?.length
      ? query.relationshipTypes
      : GRAPH_RELATIONSHIP_TYPES;
    const limit = query.limit ?? DEFAULT_GRAPH_NODES;

    const graph = await this.repository.findGraphNeighborhood(root, depth, types, limit);
    if (query.nodeTypes?.length) {
      const allowed = new Set<string>(query.nodeTypes);
      graph.nodes = graph.nodes.filter((n) => allowed.has(n.type));
      const ids = new Set(graph.nodes.map((n) => n.id));
      graph.edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    }
    return graph;
  }

  private async resolveDefaultRoot(): Promise<string> {
    const repo = await this.repository.findDefaultRepository();
    if (!repo) {
      throw new NotFoundException(
        'No repository found — the graph is empty. Run `npm run db:seed`.',
      );
    }
    return repo.id;
  }

  // ── Node relationships ──────────────────────────────────────────────────────

  async getRelationships(id: string, limit: number): Promise<NodeRelationships> {
    const node = await this.getNode(id);
    const rows = await this.repository.findNodeRelationships(id, limit);
    return this.repository.buildRelationships(node, rows.incoming, rows.outgoing);
  }

  // ── Dependencies / dependents / callers / callees ───────────────────────────

  async getDependencies(id: string, limit: number): Promise<DependencyTarget[]> {
    const node = await this.getNode(id);
    const rows = await this.repository.findDependencyRows(node, limit);
    return this.mapDependencyTargets(node, rows);
  }

  async getDependents(id: string, limit: number): Promise<DependencyTarget[]> {
    const node = await this.getNode(id);
    const rows = await this.repository.findDependentRows(node, limit);
    return this.mapDependencyTargets(node, rows);
  }

  /** Callers = dependents (semantic alias for function-level views). */
  async getCallers(id: string, limit: number): Promise<DependencyTarget[]> {
    return this.getDependents(id, limit);
  }

  /** Callees = dependencies (semantic alias for function-level views). */
  async getCallees(id: string, limit: number): Promise<DependencyTarget[]> {
    return this.getDependencies(id, limit);
  }

  /**
   * Maps raw dependency/dependent rows to `DependencyTarget`. Two row shapes:
   * plain node rows (Function/File) and owner rows (Class) whose target is the
   * owner class (preferred) or owner file (fallback) of the concrete leaf
   * function. Dependency queries name the leaf `callee`, dependent queries
   * `caller` — both are handled identically here.
   */
  private mapDependencyTargets(
    node: GraphNode,
    rows: Array<DependencyRow | OwnerDependencyRow>,
  ): DependencyTarget[] {
    const targets: DependencyTarget[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      if ('n' in row && row.n) {
        const props = asProperties(row.n);
        const target = {
          id: String(props.id ?? ''),
          type: (row.nodeType ?? 'File') as NodeType,
          label: humanLabel(props),
          relationshipType: (row.relType ?? 'CALLS') as RelationshipType,
        };
        if (!seen.has(target.id)) {
          seen.add(target.id);
          targets.push(target);
        }
        continue;
      }

      // Class-level owner rows: the leaf function (callee or caller) plus its
      // owner candidates.
      if (!('callee' in row || 'caller' in row)) continue;
      const ownerRow = row as OwnerDependencyRow;
      const leaf = asProperties(ownerRow.callee ?? ownerRow.caller);
      if (!leaf.id && !leaf.name) continue;
      const leafFile = asProperties(ownerRow.calleeFile ?? ownerRow.callerFile);
      const owners = (ownerRow.owners ?? []).filter(Boolean).map(asProperties);
      const owner = owners.length === 1 ? owners[0] : leafFile;
      const props = owner && (owner.id || owner.name) ? owner : leaf;
      const target: DependencyTarget = {
        id: String(props.id ?? ''),
        type: ('name' in props && props.name ? 'Class' : 'File') as NodeType,
        label: humanLabel(props),
        relationshipType: (row.relType ?? 'CALLS') as RelationshipType,
        via: {
          id: String(leaf.id ?? ''),
          type: 'Function',
          label: humanLabel(leaf),
        },
      };
      const key = `${target.id}|${target.relationshipType}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push(target);
      }
    }
    return targets;
  }

  // ── Tests ───────────────────────────────────────────────────────────────────

  async getTests(id: string, limit: number): Promise<TestCoverage[]> {
    const node = await this.getNode(id);
    return this.repository.findTests(node, limit);
  }

  // ── Traversal ───────────────────────────────────────────────────────────────

  async traverse(id: string, query: TraversalQueryDto): Promise<TraversalResult> {
    const node = await this.getNode(id);
    const depth = query.depth ?? DEFAULT_TRAVERSAL_DEPTH;
    const types = query.types?.length ? query.types : TRAVERSAL_TYPES;
    const pathLimit = query.limit ?? DEFAULT_TRAVERSAL_PATHS;
    const root: GraphNodeRef = { id: node.id, type: node.type, label: node.label };
    return this.repository.traverseFromNode(root, depth, types, pathLimit);
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  async search(q: string, limit: number): Promise<SearchResultItem[]> {
    return this.repository.search(q, limit);
  }
}
