/**
 * GraphDeltaBuilder — compares old and new ParseResults to produce a GraphDelta.
 *
 * Given:
 *   old result (from graph) + new result (from reparse of changed file)
 *   → EntityDelta[] + RelationshipDelta[]
 *
 * This is a pure computation — it does NOT write to CognoDB.
 */
import { Injectable, Logger } from '@nestjs/common';
import type {
  ChangeSet,
  DeltaAction,
  EntityDelta,
  GraphDelta,
  RelationshipDelta,
} from '@tracegraph/shared';
import type { BatchParseResult, ParsedSymbol, ParsedRelationship } from '../parser/types';

const logger = new Logger('GraphDeltaBuilder');

/**
 * Minimal snapshot of what was previously in the graph for a single file.
 * Used for comparison against a fresh parse result.
 */
export interface GraphEntitySnapshot {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphRelationshipSnapshot {
  fromId: string;
  toId: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface FileGraphState {
  /** All entity (node) snapshots for this file. */
  entities: GraphEntitySnapshot[];
  /** All relationship snapshots originating from or targeting this file's entities. */
  relationships: GraphRelationshipSnapshot[];
}

@Injectable()
export class GraphDeltaBuilder {
  /**
   * Build a GraphDelta by comparing old file state with new parse results.
   *
   * @param changeSet    The changeset describing which files changed
   * @param oldStates    Map of file path → previous graph state for changed files
   * @param newResult    Fresh parse result for all changed files
   */
  buildDelta(
    changeSet: ChangeSet,
    oldStates: Map<string, FileGraphState>,
    newResult: BatchParseResult,
  ): GraphDelta {
    const entityDeltas: EntityDelta[] = [];
    const relationshipDeltas: RelationshipDelta[] = [];

    // ── Process added files ──────────────────────────────────────────────
    for (const file of changeSet.addedFiles) {
      const fileSymbols = newResult.symbols.filter((s) => s.filePath === file.path);
      const fileRels = newResult.relationships.filter((r) => {
        const fileId = `file:${file.path}`;
        return r.fromId.startsWith(`fn:${file.path}:`) || r.toId.startsWith(`fn:${file.path}:`) ||
               r.fromId === fileId || r.toId === fileId;
      });

      // Add file entity
      const fileMeta = newResult.files.find((f) => f.path === file.path);
      if (fileMeta) {
        entityDeltas.push({
          entityId: `file:${file.path}`,
          label: 'File',
          action: 'ADDED',
          newProps: {
            id: `file:${file.path}`,
            name: file.path.split('/').pop(),
            path: file.path,
            language: fileMeta.language,
            extension: fileMeta.extension,
            contentHash: fileMeta.contentHash,
            lineCount: fileMeta.lineCount,
            sizeBytes: fileMeta.sizeBytes,
          },
        });
      }

      // Add symbol entities
      for (const symbol of fileSymbols) {
        entityDeltas.push({
          entityId: symbol.id,
          label: this.symbolKindToLabel(symbol.kind),
          action: 'ADDED',
          newProps: this.symbolToProps(symbol),
        });
      }

      // Add relationships
      for (const rel of fileRels) {
        relationshipDeltas.push({
          fromId: rel.fromId,
          toId: rel.toId,
          type: rel.kind,
          action: 'ADDED',
          props: { resolution: rel.resolution, reason: rel.reason },
        });
      }
    }

    // ── Process modified files ───────────────────────────────────────────
    for (const file of changeSet.modifiedFiles) {
      const oldState = oldStates.get(file.path);
      const fileSymbols = newResult.symbols.filter((s) => s.filePath === file.path);
      const fileRels = newResult.relationships.filter((r) => {
        const fileId = `file:${file.path}`;
        return r.fromId.startsWith(`fn:${file.path}:`) || r.toId.startsWith(`fn:${file.path}:`) ||
               r.fromId === fileId || r.toId === fileId;
      });

      // Diff entities
      const oldEntityMap = new Map(oldState?.entities.map((e) => [e.id, e]) ?? []);
      const newEntityMap = new Map<string, ParsedSymbol>();

      for (const symbol of fileSymbols) {
        newEntityMap.set(symbol.id, symbol);
      }
      // Add the file entity itself
      const fileMeta = newResult.files.find((f) => f.path === file.path);
      if (fileMeta) {
        const fileId = `file:${file.path}`;
        const oldFileEntity = oldEntityMap.get(fileId);
        const newFileProps: Record<string, unknown> = {
          id: fileId,
          name: file.path.split('/').pop(),
          path: file.path,
          language: fileMeta.language,
          extension: fileMeta.extension,
          contentHash: fileMeta.contentHash,
          lineCount: fileMeta.lineCount,
          sizeBytes: fileMeta.sizeBytes,
        };

        if (!oldFileEntity) {
          entityDeltas.push({ entityId: fileId, label: 'File', action: 'ADDED', newProps: newFileProps });
        } else if (!this.propsEqual(oldFileEntity.properties, newFileProps)) {
          entityDeltas.push({
            entityId: fileId,
            label: 'File',
            action: 'UPDATED',
            previousProps: oldFileEntity.properties,
            newProps: newFileProps,
          });
        }
      }

      // Added symbols (in new but not in old)
      for (const [id, symbol] of newEntityMap) {
        if (!oldEntityMap.has(id)) {
          entityDeltas.push({
            entityId: id,
            label: this.symbolKindToLabel(symbol.kind),
            action: 'ADDED',
            newProps: this.symbolToProps(symbol),
          });
        } else {
          // Updated symbols
          const oldEntity = oldEntityMap.get(id)!;
          const newProps = this.symbolToProps(symbol);
          if (!this.propsEqual(oldEntity.properties, newProps)) {
            entityDeltas.push({
              entityId: id,
              label: this.symbolKindToLabel(symbol.kind),
              action: 'UPDATED',
              previousProps: oldEntity.properties,
              newProps,
            });
          }
        }
      }

      // Removed symbols (in old but not in new)
      for (const [id, oldEntity] of oldEntityMap) {
        if (!newEntityMap.has(id) && id !== `file:${file.path}`) {
          entityDeltas.push({
            entityId: id,
            label: oldEntity.label,
            action: 'REMOVED',
            previousProps: oldEntity.properties,
          });
        }
      }

      // Diff relationships
      const oldRelSet = new Set(
        (oldState?.relationships ?? []).map((r) => `${r.fromId}|${r.type}|${r.toId}`),
      );
      const newRelSet = new Set(fileRels.map((r) => `${r.fromId}|${r.kind}|${r.toId}`));

      for (const relKey of newRelSet) {
        if (!oldRelSet.has(relKey)) {
          const rel = fileRels.find((r) => `${r.fromId}|${r.kind}|${r.toId}` === relKey)!;
          relationshipDeltas.push({
            fromId: rel.fromId,
            toId: rel.toId,
            type: rel.kind,
            action: 'ADDED',
            props: { resolution: rel.resolution, reason: rel.reason },
          });
        }
      }

      for (const relKey of oldRelSet) {
        if (!newRelSet.has(relKey)) {
          const [fromId, type, toId] = relKey.split('|');
          relationshipDeltas.push({
            fromId,
            toId,
            type,
            action: 'REMOVED',
          });
        }
      }
    }

    // ── Process deleted files ────────────────────────────────────────────
    for (const file of changeSet.deletedFiles) {
      const oldState = oldStates.get(file.path);

      // Remove all entities for this file
      for (const entity of oldState?.entities ?? []) {
        entityDeltas.push({
          entityId: entity.id,
          label: entity.label,
          action: 'REMOVED',
          previousProps: entity.properties,
        });
      }

      // Remove all relationships for this file
      for (const rel of oldState?.relationships ?? []) {
        relationshipDeltas.push({
          fromId: rel.fromId,
          toId: rel.toId,
          type: rel.type,
          action: 'REMOVED',
        });
      }
    }

    // ── Process renamed files ────────────────────────────────────────────
    for (const file of changeSet.renamedFiles) {
      if (file.oldPath) {
        // Treat as delete old + add new for simplicity
        // A more sophisticated approach would update file paths
        const oldState = oldStates.get(file.oldPath);
        for (const entity of oldState?.entities ?? []) {
          entityDeltas.push({
            entityId: entity.id,
            label: entity.label,
            action: 'REMOVED',
            previousProps: entity.properties,
          });
        }
        for (const rel of oldState?.relationships ?? []) {
          relationshipDeltas.push({
            fromId: rel.fromId,
            toId: rel.toId,
            type: rel.type,
            action: 'REMOVED',
          });
        }

        // Add new entities from the renamed file
        const fileSymbols = newResult.symbols.filter((s) => s.filePath === file.path);
        for (const symbol of fileSymbols) {
          entityDeltas.push({
            entityId: symbol.id,
            label: this.symbolKindToLabel(symbol.kind),
            action: 'ADDED',
            newProps: this.symbolToProps(symbol),
          });
        }
      }
    }

    // ── Deduplicate ──────────────────────────────────────────────────────
    const dedupedEntities = this.deduplicateEntityDeltas(entityDeltas);
    const dedupedRels = this.deduplicateRelationshipDeltas(relationshipDeltas);

    const summary = {
      entitiesAdded: dedupedEntities.filter((e) => e.action === 'ADDED').length,
      entitiesUpdated: dedupedEntities.filter((e) => e.action === 'UPDATED').length,
      entitiesRemoved: dedupedEntities.filter((e) => e.action === 'REMOVED').length,
      relationshipsAdded: dedupedRels.filter((r) => r.action === 'ADDED').length,
      relationshipsRemoved: dedupedRels.filter((r) => r.action === 'REMOVED').length,
    };

    logger.log(
      `Graph delta: ${summary.entitiesAdded}+ ${summary.entitiesUpdated}~ ${summary.entitiesRemoved}- ` +
      `entities, ${summary.relationshipsAdded}+ ${summary.relationshipsRemoved}- relationships`,
    );

    return {
      entities: dedupedEntities,
      relationships: dedupedRels,
      summary,
      computedAt: new Date().toISOString(),
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private symbolToProps(symbol: ParsedSymbol): Record<string, unknown> {
    return {
      id: symbol.id,
      name: symbol.name,
      filePath: symbol.filePath,
      lineStart: symbol.sourceLocation.lineStart,
      lineEnd: symbol.sourceLocation.lineEnd,
      visibility: symbol.visibility,
      signature: symbol.signature,
      kind: symbol.kind,
    };
  }

  private symbolKindToLabel(kind: string): string {
    switch (kind) {
      case 'class': return 'Class';
      case 'interface': return 'Interface';
      case 'enum': return 'Enum';
      case 'struct': return 'Struct';
      case 'trait': return 'Trait';
      case 'module': return 'Module';
      case 'namespace': return 'Namespace';
      default: return 'Function';
    }
  }

  private propsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
      if (keysA[i] !== keysB[i]) return false;
      if (JSON.stringify(a[keysA[i]]) !== JSON.stringify(b[keysB[i]])) return false;
    }
    return true;
  }

  private deduplicateEntityDeltas(deltas: EntityDelta[]): EntityDelta[] {
    const byId = new Map<string, EntityDelta>();
    for (const d of deltas) {
      const existing = byId.get(d.entityId);
      if (!existing) {
        byId.set(d.entityId, d);
      } else {
        // Keep the most informative action: ADDED > UPDATED > REMOVED
        const priority: Record<string, number> = { ADDED: 3, UPDATED: 2, REMOVED: 1, UNCHANGED: 0 };
        if ((priority[d.action] ?? 0) > (priority[existing.action] ?? 0)) {
          byId.set(d.entityId, d);
        }
      }
    }
    return [...byId.values()];
  }

  private deduplicateRelationshipDeltas(deltas: RelationshipDelta[]): RelationshipDelta[] {
    const byKey = new Map<string, RelationshipDelta>();
    for (const d of deltas) {
      const key = `${d.fromId}|${d.type}|${d.toId}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, d);
      } else if (existing.action === 'ADDED' && d.action === 'REMOVED') {
        // Cancel out: added then removed = no change
        byKey.delete(key);
      }
    }
    return [...byKey.values()];
  }
}
