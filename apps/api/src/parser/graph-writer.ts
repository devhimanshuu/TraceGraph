/**
 * GraphWriter — translates normalized parser IR into CognoDB Cypher operations.
 *
 * This is the ONLY module that touches the database during parsing.
 * Parsers never see CognoDB directly.
 */
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ProgrammingLanguage,
  SymbolKind,
  RelationshipKind,
  type BatchParseResult,
  type ParsedSymbol,
  type ParsedRelationship,
  type ParsedFileMeta,
  type ParsedImport,
} from './types';

const BATCH_SIZE = 500;

/** Node labels used by the parser platform. */
const NODE_LABELS = [
  'Repository',
  'Directory',
  'File',
  'Function',
  'Class',
  'Interface',
  'Enum',
  'Struct',
  'Trait',
  'Module',
  'Namespace',
  'Test',
] as const;

type EdgeType = 'CONTAINS' | 'IMPORTS' | 'CALLS' | 'EXTENDS' | 'IMPLEMENTS' | 'REFERENCES' | 'DEFINES' | 'OVERRIDES' | 'TESTS' | 'MODIFIES' | 'AUTHORED_BY' | 'RELATED_TO' | 'CROSS_LANGUAGE';

interface Edge {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  type: EdgeType;
  props?: Record<string, unknown>;
}

@Injectable()
export class GraphWriter {
  private readonly logger = new Logger(GraphWriter.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Persist a full batch parse result to the graph database.
   * Creates/upserts file, symbol, and directory nodes + all relationships.
   */
  async persistParseResult(
    result: BatchParseResult,
    repoId: string,
    repoName: string,
  ): Promise<{ nodesCreated: number; relationshipsCreated: number }> {
    const startedAt = Date.now();
    const nodes = new Map<string, { label: string; props: Record<string, unknown> }>();
    const edges: Edge[] = [];

    const addNode = (id: string, label: string, props: Record<string, unknown>) => {
      if (!nodes.has(id)) nodes.set(id, { label, props });
    };

    const addEdge = (from: string, to: string, type: EdgeType, props?: Record<string, unknown>) => {
      const fromNode = nodes.get(from);
      const toNode = nodes.get(to);
      if (!fromNode || !toNode) return;
      edges.push({ from, to, fromLabel: fromNode.label, toLabel: toNode.label, type, props });
    };

    // 1. Repository node
    addNode(repoId, 'Repository', { id: repoId, name: repoName });

    // 2. Directory chain + file nodes
    const dirSet = new Set<string>();
    for (const file of result.files) {
      const parts = file.path.split('/');
      let parent = repoId;
      let current = '';
      for (const part of parts.slice(0, -1)) {
        current = current ? `${current}/${part}` : part;
        const dirId = `dir:${current}`;
        if (!dirSet.has(dirId)) {
          dirSet.add(dirId);
          addNode(dirId, 'Directory', { id: dirId, name: part, path: current });
          addEdge(parent, dirId, 'CONTAINS');
        }
        parent = dirId;
      }
      const fileId = `file:${file.path}`;
      addNode(fileId, 'File', {
        id: fileId,
        name: file.path.split('/').pop() ?? file.path,
        path: file.path,
        extension: file.extension,
        language: file.language,
        lineCount: file.lineCount,
        sizeBytes: file.sizeBytes,
        contentHash: file.contentHash,
        parserVersion: 1,
      });
      addEdge(parent, fileId, 'CONTAINS');
    }

    // 3. Symbol nodes + CONTAINS edges to their files
    for (const symbol of result.symbols) {
      const label = this.symbolKindToLabel(symbol.kind);
      addNode(symbol.id, label, {
        id: symbol.id,
        name: symbol.name,
        filePath: symbol.filePath,
        lineStart: symbol.sourceLocation.lineStart,
        lineEnd: symbol.sourceLocation.lineEnd,
        visibility: symbol.visibility,
        signature: symbol.signature,
        kind: symbol.kind,
        language: this.getSymbolLanguage(symbol),
      });
      addEdge(`file:${symbol.filePath}`, symbol.id, 'CONTAINS');
    }

    // 4. Relationships
    for (const rel of result.relationships) {
      const kind = this.mapRelationshipKind(rel.kind);
      addEdge(rel.fromId, rel.toId, kind, {
        resolution: rel.resolution,
        reason: rel.reason,
        line: rel.line,
      });
    }

    // 5. Test files (pattern match)
    for (const file of result.files) {
      if (/\.(spec|test)\.(ts|tsx|js|jsx|py|java|go|rs|php|cs)$/i.test(file.path)) {
        const testId = `test:${file.path}`;
        addNode(testId, 'Test', {
          id: testId,
          name: file.path.split('/').pop() ?? file.path,
          framework: 'unknown',
          filePath: file.path,
        });
        addEdge(`file:${file.path}`, testId, 'CONTAINS');
      }
    }

    // 6. Persist
    this.logger.log(`Persisting ${nodes.size} nodes and ${edges.length} edges`);
    await this.ensureConstraints();
    await this.writeNodes(nodes);
    await this.writeEdges(edges);

    const durationMs = Date.now() - startedAt;
    this.logger.log(`Persisted in ${durationMs}ms`);

    return {
      nodesCreated: nodes.size,
      relationshipsCreated: edges.length,
    };
  }

  // ── Incremental persistence ────────────────────────────────────────────

  /**
   * Persist only the delta (added + changed files) to the graph.
   * Removed file nodes and their edges are deleted.
   *
   * For added/changed files, delegates to persistParseResult for that subset.
   * For removed files, deletes the File node, its symbol children, and all
   * edges touching them.
   */
  async persistIncremental(
    addedChangedResult: import('./types').BatchParseResult,
    removedPaths: string[],
    repoId: string,
    repoName: string,
  ): Promise<{ nodesCreated: number; relationshipsCreated: number; nodesRemoved: number }> {
    const startedAt = Date.now();

    // 1. Persist added/changed files (MERGE — creates or updates)
    const persistResult = await this.persistParseResult(
      addedChangedResult, repoId, repoName,
    );

    // 2. Delete removed file nodes and their orphaned children/edges
    let nodesRemoved = 0;
    if (removedPaths.length > 0) {
      nodesRemoved = await this.removeFiles(removedPaths);
    }

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `Incremental persist in ${durationMs}ms: ` +
      `${persistResult.nodesCreated} upserted, ${nodesRemoved} removed`,
    );

    return {
      nodesCreated: persistResult.nodesCreated,
      relationshipsCreated: persistResult.relationshipsCreated,
      nodesRemoved,
    };
  }

  /**
   * Remove File nodes (and their orphaned children) for the given paths.
   * Deletes all edges touching the file node, then CONTAINS children,
   * then the file node itself.
   */
  async removeFiles(paths: string[]): Promise<number> {
    const fileIds = paths.map((p) => `file:${p}`);
    let totalRemoved = 0;

    // Process in batches
    const BATCH = 100;
    for (let i = 0; i < fileIds.length; i += BATCH) {
      const batch = fileIds.slice(i, i + BATCH);

      // Delete all edges touching these file nodes
      await this.db.executeWrite(
        (tx) => tx.run(
          `UNWIND $fileIds AS fileId
           MATCH (f:File {id: fileId})
           OPTIONAL MATCH (f)-[r]-()
           DELETE r`,
          { fileIds: batch },
        ),
        { name: 'incremental-delete-edges' },
      );

      // Delete symbol/function nodes CONTAINED by these files
      const symResult = await this.db.executeWrite(
        (tx) => tx.run(
          `UNWIND $fileIds AS fileId
           MATCH (f:File {id: fileId})-[:CONTAINS]->(child)
           WHERE child:Function OR child:Class OR child:Interface OR child:Enum
                  OR child:Struct OR child:Trait OR child:Module OR child:Namespace
           DETACH DELETE child
           RETURN count(child) AS deleted`,
          { fileIds: batch },
        ),
        { name: 'incremental-delete-symbols' },
      );
      for (const row of symResult) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const count = (row as any).get?.('deleted') ?? (row as Record<string, unknown>)?.deleted;
        totalRemoved += typeof count?.toNumber === 'function' ? count.toNumber() : Number(count ?? 0);
      }

      // Delete Test nodes for these files
      await this.db.executeWrite(
        (tx) => tx.run(
          `UNWIND $fileIds AS fileId
           MATCH (f:File {id: fileId})-[:CONTAINS]->(t:Test)
           DETACH DELETE t`,
          { fileIds: batch },
        ),
        { name: 'incremental-delete-tests' },
      );

      // Delete the File nodes themselves
      const fileResult = await this.db.executeWrite(
        (tx) => tx.run(
          `UNWIND $fileIds AS fileId
           MATCH (f:File {id: fileId})
           DETACH DELETE f
           RETURN count(f) AS deleted`,
          { fileIds: batch },
        ),
        { name: 'incremental-delete-files' },
      );
      for (const row of fileResult) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const count = (row as any).get?.('deleted') ?? (row as Record<string, unknown>)?.deleted;
        totalRemoved += typeof count?.toNumber === 'function' ? count.toNumber() : Number(count ?? 0);
      }
    }

    this.logger.log(`Removed ${totalRemoved} nodes for ${paths.length} deleted files`);
    return totalRemoved;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private symbolKindToLabel(kind: SymbolKind): string {
    switch (kind) {
      case SymbolKind.CLASS: return 'Class';
      case SymbolKind.INTERFACE: return 'Interface';
      case SymbolKind.ENUM: return 'Enum';
      case SymbolKind.STRUCT: return 'Struct';
      case SymbolKind.TRAIT: return 'Trait';
      case SymbolKind.MODULE: return 'Module';
      case SymbolKind.NAMESPACE: return 'Namespace';
      default: return 'Function';
    }
  }

  private mapRelationshipKind(kind: RelationshipKind): EdgeType {
    return kind as unknown as EdgeType;
  }

  private getSymbolLanguage(symbol: ParsedSymbol): string {
    // Derive language from file extension
    const ext = symbol.filePath.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
      py: 'Python', go: 'Go', java: 'Java', rs: 'Rust', php: 'PHP', cs: 'C#',
    };
    return map[ext] ?? 'Unknown';
  }

  private async ensureConstraints(): Promise<void> {
    for (const label of NODE_LABELS) {
      await this.db.executeWrite(
        (tx) =>
          tx.run(
            `CREATE CONSTRAINT tg_${label.toLowerCase()}_id IF NOT EXISTS FOR (n:\`${label}\`) REQUIRE n.id IS UNIQUE`,
          ),
        { name: `parser-constraint-${label.toLowerCase()}` },
      );
    }
  }

  private async writeNodes(
    nodes: Map<string, { label: string; props: Record<string, unknown> }>,
  ): Promise<void> {
    for (const label of NODE_LABELS) {
      const rows = [...nodes.values()]
        .filter((n) => n.label === label)
        .map((n) => ({ id: n.props.id, props: n.props }));
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        if (batch.length === 0) continue;
        await this.db.executeWrite(
          (tx) =>
            tx.run(
              `UNWIND $rows AS row\nMERGE (n:\`${label}\` {id: row.id})\nSET n += row.props`,
              { rows: batch },
            ),
          { name: `parser-nodes-${label.toLowerCase()}` },
        );
      }
    }
  }

  private async writeEdges(edges: Edge[]): Promise<void> {
    const groups = new Map<string, Edge[]>();
    for (const edge of edges) {
      const key = `${edge.type}|${edge.fromLabel}|${edge.toLabel}`;
      const group = groups.get(key) ?? [];
      group.push(edge);
      groups.set(key, group);
    }

    for (const [key, group] of groups) {
      const [type, fromLabel, toLabel] = key.split('|') as [EdgeType, string, string];
      const rows = group.map((e) => ({ from: e.from, to: e.to, props: e.props ?? {} }));
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        if (batch.length === 0) continue;
        await this.db.executeWrite(
          (tx) =>
            tx.run(
              `UNWIND $rows AS row\nMATCH (a:\`${fromLabel}\` {id: row.from})\nMATCH (b:\`${toLabel}\` {id: row.to})\nMERGE (a)-[r:\`${type}\`]->(b)\nSET r += row.props`,
              { rows: batch },
            ),
          { name: `parser-edges-${type.toLowerCase()}` },
        );
      }
    }
  }
}
