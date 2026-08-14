/**
 * ImpactRepository — executes the impact analysis Cypher (Phase 9 §39).
 *
 * Responsibilities:
 * - resolve the root's entry functions per node type
 * - run the bounded inbound traversals (CALLS / IMPORTS / EXTENDS)
 * - resolve function owners (class preferred, file fallback)
 * - return NORMALIZED entity-level evidence paths with the concrete
 *   function (`via`) for CALLS — business classification (direct vs
 *   indirect, reasons, dedup) stays in ImpactService.
 *
 * The repository knows nothing about HTTP, validation, or classification.
 * It reuses the graph module's DatabaseService (single DB access layer) and
 * mapper helpers for labels/Integer normalization.
 */
import { Injectable } from '@nestjs/common';
import type { GraphNode, GraphNodeRef, RelationshipType } from '@tracegraph/shared';
import { DatabaseService } from '../database/database.service';
import { asProperties, humanLabel } from '../graph/mappers';
import {
  ENTRY_FUNCTIONS_FOR_CLASS,
  ENTRY_FUNCTIONS_FOR_CONTAINER,
  ENTRY_FUNCTIONS_FOR_FILE,
  ENTRY_FUNCTIONS_FOR_FUNCTION,
  FIND_FUNCTION_OWNERS,
  MAX_ENTRY_FUNCTIONS,
  buildImpactCallPathsQuery,
  buildImpactExtendsPathsQuery,
  buildImpactImportsPathsQuery,
} from './queries/impact.queries';

/** One normalized entity-level impact path: affected → … → root. */
export interface ImpactEntityRow {
  target: GraphNodeRef;
  /** Entity-level hop distance from the root (1 = direct). */
  hops: number;
  /** Relationship type connecting the target into the chain. */
  relationship: RelationshipType;
  /** Entity refs from the affected entity to the root (inclusive). */
  nodes: GraphNodeRef[];
  /** Relationship types between consecutive entities. */
  relTypes: RelationshipType[];
  /** The concrete function through which CALLS impact flows. */
  via?: GraphNodeRef;
}

interface CallPathRow {
  fnIds?: string[];
  relTypes?: string[];
  hops?: unknown;
}

interface OwnerRow {
  fnId?: string;
  fnName?: string;
  fileId?: string;
  fileName?: string;
  classIds?: Array<string | null>;
  classNames?: Array<string | null>;
}

interface FilePathRow {
  fileIds?: string[];
  relTypes?: string[];
  hops?: unknown;
}

interface ClassPathRow {
  classIds?: string[];
  relTypes?: string[];
  hops?: unknown;
}

@Injectable()
export class ImpactRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Runs the full impact traversal for a root node and returns normalized
   * entity-level paths (root → … → target), deduplicated per raw path row.
   * Returns `[]` for node types without dependency semantics.
   */
  async collectImpact(root: GraphNode, depth: number, pathLimit: number): Promise<ImpactEntityRow[]> {
    const rows: ImpactEntityRow[] = [];

    // CALLS — the primary channel, for every root with functions.
    const entryFnIds = await this.findEntryFunctions(root);
    if (entryFnIds.length > 0) {
      const callRows = await this.collectCallImpact(entryFnIds, root, depth, pathLimit);
      rows.push(...callRows.filter((r): r is ImpactEntityRow => r !== null));
    }

    // IMPORTS — file-level channel for File roots.
    if (root.type === 'File') {
      rows.push(...(await this.collectImportsImpact(root.id, depth, pathLimit)));
    }

    // EXTENDS — class-level channel for Class roots.
    if (root.type === 'Class') {
      rows.push(...(await this.collectExtendsImpact(root.id, depth, pathLimit)));
    }

    return rows;
  }

  /** Functions representing the root, per node type. */
  private async findEntryFunctions(root: GraphNode): Promise<string[]> {
    let cypher: string;
    switch (root.type) {
      case 'Function':
        cypher = ENTRY_FUNCTIONS_FOR_FUNCTION;
        break;
      case 'Class':
        cypher = ENTRY_FUNCTIONS_FOR_CLASS;
        break;
      case 'File':
        cypher = ENTRY_FUNCTIONS_FOR_FILE;
        break;
      case 'Repository':
      case 'Directory':
        cypher = ENTRY_FUNCTIONS_FOR_CONTAINER;
        break;
      default:
        return [];
    }
    const rows = await this.db.executeRead<Array<{ fnId?: string }>>(
      (tx) => tx.run(cypher, { rootId: root.id }),
      { name: `impact-entry-functions-${root.type.toLowerCase()}` },
    );
    return [...new Set(rows.map((r) => String(r.fnId ?? '')))]
      .filter(Boolean)
      .slice(0, MAX_ENTRY_FUNCTIONS);
  }

  /** Inbound CALLS chains, owner-resolved to entities (affected → … → root). */
  private async collectCallImpact(
    entryFnIds: string[],
    root: GraphNode,
    depth: number,
    pathLimit: number,
  ): Promise<Array<ImpactEntityRow | null>> {
    const cypher = buildImpactCallPathsQuery(depth, pathLimit);
    const rows = await this.db.executeRead<CallPathRow[]>((tx) => tx.run(cypher, { entryIds: entryFnIds }), {
      name: 'impact-call-paths',
    });

    const fnIds = [...new Set(rows.flatMap((r) => r.fnIds ?? []))];
    const { owners, refs } = await this.findOwners(fnIds);
    // Entry functions belong to the root entity — anchor the chain end on the
    // root regardless of owner resolution (a class root's file may hold several
    // classes, and a function root's entry is the root itself).
    const rootRef: GraphNodeRef = { id: root.id, type: root.type, label: root.label };

    return rows.map((row) => {
      const chain = (row.fnIds ?? []).map((fnId) => owners.get(fnId) ?? rootRef);
      // Collapse consecutive same-entity hops (functions in the same file),
      // then anchor the last entity on the root.
      const entities: GraphNodeRef[] = [];
      for (const ref of chain) {
        const prev = entities[entities.length - 1];
        if (!prev || prev.id !== ref.id) entities.push(ref);
      }
      if (entities.length > 0) {
        entities[entities.length - 1] = rootRef;
      }
      // Drop the trailing root when it is the ONLY entity (self-call noise).
      const unique = entities.length > 1 && entities[entities.length - 1].id === entities[entities.length - 2]?.id;
      if (unique) entities.pop();
      // A chain that collapses to just the root is intra-file self-call noise,
      // not real impact — skip it.
      if (entities.length < 2) {
        return null;
      }

      const target = entities[0] ?? rootRef;
      const fnPath = row.fnIds ?? [];
      const viaFnId = fnPath[0];
      const viaRef = viaFnId ? refs.get(viaFnId) : undefined;
      const relTypes = (row.relTypes ?? []) as RelationshipType[];
      const hops = Math.max(1, entities.length - 1);
      return {
        target,
        hops,
        relationship: relTypes[0] ?? 'CALLS',
        nodes: entities,
        relTypes: relTypes.slice(-Math.max(0, entities.length - 1)),
        ...(viaRef ? { via: viaRef } : {}),
      };
    });
  }

  /** Inbound IMPORTS chains for a File root — entities are files directly. */
  private async collectImportsImpact(
    rootId: string,
    depth: number,
    pathLimit: number,
  ): Promise<ImpactEntityRow[]> {
    const cypher = buildImpactImportsPathsQuery(depth, pathLimit);
    const rows = await this.db.executeRead<FilePathRow[]>((tx) => tx.run(cypher, { rootId }), {
      name: 'impact-imports-paths',
    });
    const fileRefs = await this.findNodeRefs(rows.flatMap((r) => r.fileIds ?? []));

    return rows.map((row) => {
      // nodes(p) = [importer, …, rootFile] → already affected → root order.
      const chain = (row.fileIds ?? []).map(
        (id) => fileRefs.get(id) ?? ({ id, type: 'File', label: id } satisfies GraphNodeRef),
      );
      const target = chain[0] ?? ({ id: rootId, type: 'File', label: rootId } satisfies GraphNodeRef);
      const relTypes = (row.relTypes ?? []) as RelationshipType[];
      const hops = Math.max(1, chain.length - 1);
      return {
        target,
        hops,
        relationship: relTypes[0] ?? 'IMPORTS',
        nodes: [target, ...chain.slice(1)],
        relTypes: relTypes.slice(0, Math.max(0, chain.length - 1)),
      };
    });
  }

  /** Inbound EXTENDS chains for a Class root — entities are classes directly. */
  private async collectExtendsImpact(
    rootId: string,
    depth: number,
    pathLimit: number,
  ): Promise<ImpactEntityRow[]> {
    const cypher = buildImpactExtendsPathsQuery(depth, pathLimit);
    const rows = await this.db.executeRead<ClassPathRow[]>((tx) => tx.run(cypher, { rootId }), {
      name: 'impact-extends-paths',
    });
    const classRefs = await this.findNodeRefs(rows.flatMap((r) => r.classIds ?? []));

    return rows.map((row) => {
      // nodes(p) = [subclass, …, rootClass] → already affected → root order.
      const chain = (row.classIds ?? []).map(
        (id) => classRefs.get(id) ?? ({ id, type: 'Class', label: id } satisfies GraphNodeRef),
      );
      const target = chain[0] ?? ({ id: rootId, type: 'Class', label: rootId } satisfies GraphNodeRef);
      const relTypes = (row.relTypes ?? []) as RelationshipType[];
      const hops = Math.max(1, chain.length - 1);
      return {
        target,
        hops,
        relationship: relTypes[0] ?? 'EXTENDS',
        nodes: [target, ...chain.slice(1)],
        relTypes: relTypes.slice(0, Math.max(0, chain.length - 1)),
      };
    });
  }

  /**
   * fnId → owner entity (single class in the file, else the file itself), plus
   * a raw function ref map for `via` evidence.
   */
  private async findOwners(fnIds: string[]): Promise<{
    owners: Map<string, GraphNodeRef>;
    refs: Map<string, GraphNodeRef>;
  }> {
    const owners = new Map<string, GraphNodeRef>();
    const refs = new Map<string, GraphNodeRef>();
    if (fnIds.length === 0) return { owners, refs };

    const rows = await this.db.executeRead<OwnerRow[]>((tx) => tx.run(FIND_FUNCTION_OWNERS, { fnIds }), {
      name: 'impact-function-owners',
    });
    for (const row of rows) {
      const fnId = String(row.fnId ?? '');
      if (!fnId) continue;
      refs.set(fnId, {
        id: fnId,
        type: 'Function',
        label: String(row.fnName ?? humanLabel({ id: fnId })),
      });
      const classIds = (row.classIds ?? []).filter((id): id is string => Boolean(id));
      const classNames = (row.classNames ?? []).filter((name): name is string => Boolean(name));
      if (classIds.length === 1) {
        owners.set(fnId, { id: classIds[0], type: 'Class', label: classNames[0] ?? classIds[0] });
      } else {
        owners.set(fnId, {
          id: String(row.fileId ?? fnId),
          type: 'File',
          label: humanLabel({ name: row.fileName, path: row.fileId, id: row.fileId }),
        });
      }
    }
    return { owners, refs };
  }

  /** Minimal id → ref lookup for file/class chains. */
  private async findNodeRefs(ids: string[]): Promise<Map<string, GraphNodeRef>> {
    const map = new Map<string, GraphNodeRef>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return map;
    const rows = await this.db.executeRead<Array<{ n?: Record<string, unknown>; nodeType?: string }>>(
      (tx) =>
        tx.run(
          `
MATCH (n)
WHERE n.id IN $ids
RETURN properties(n) AS n, labels(n)[0] AS nodeType
`,
          { ids: unique },
        ),
      { name: 'impact-node-refs' },
    );
    for (const row of rows) {
      const props = asProperties(row.n);
      const id = String(props.id ?? '');
      if (!id) continue;
      map.set(id, {
        id,
        type: (row.nodeType ?? 'File') as GraphNodeRef['type'],
        label: humanLabel(props),
      });
    }
    return map;
  }
}
