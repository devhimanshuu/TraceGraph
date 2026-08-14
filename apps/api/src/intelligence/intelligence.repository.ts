/**
 * IntelligenceRepository — executes the Intelligence Cypher catalog
 * (orphans, smells, test gaps, tests-for-change, knowledge). Same discipline
 * as the graph/impact repositories: parameterized queries only, rows
 * normalized to plain DTO shapes, and the small amount of structural work
 * (cycle canonicalization) done here so services stay thin.
 */
import { Injectable } from '@nestjs/common';
import type { GraphNodeRef, NodeType, TestCoverage } from '@tracegraph/shared';
import { DatabaseService } from '../database/database.service';
import { asProperties, humanLabel, toNodeRef, toNumber, toTestCoverage } from '../graph/mappers';
import {
  FIND_CLASS_EXTENDS_CYCLES,
  FIND_ENTITY_KNOWLEDGE,
  FIND_FILE_IMPORT_CYCLES,
  FIND_FRAGILE_ENTITIES,
  FIND_GOD_MODULES,
  FIND_ORPHANS,
  FIND_REPO_KNOWLEDGE,
  FIND_TEST_GAPS,
  FIND_TESTS_FOR_ENTITY_IDS,
} from './queries/intelligence.queries';
import { MAX_SMELL_CYCLES, MIN_GAP_FUNCTIONS } from './intelligence.constants';

/** One raw orphan row. */
interface OrphanRow {
  n?: Record<string, unknown>;
  nodeType?: string;
  testCount?: unknown;
  commitCount?: unknown;
}

/** One raw cycle row (members in traversal order). */
interface CycleRow {
  ids?: string[];
  names?: string[];
  cycleLength?: unknown;
}

/** One raw god-module / fragile row. */
interface MetricRow {
  n?: Record<string, unknown>;
  nodeType?: string;
  fanIn?: unknown;
  fanOut?: unknown;
  commits?: unknown;
  dependents?: unknown;
  score?: unknown;
}

/** One raw test-gap row. */
interface TestGapRow {
  n?: Record<string, unknown>;
  nodeType?: string;
  untestedFunctions?: unknown;
  dependents?: unknown;
  commits?: unknown;
}

/** One raw tests-for-change row (test + the entity whose surface it covers). */
interface TestsForEntityRow {
  t?: Record<string, unknown>;
  fn?: Record<string, unknown>;
  entityId?: string;
}

/** One raw knowledge row. */
interface KnowledgeRow {
  d?: Record<string, unknown>;
  nodeType?: string;
  commits?: unknown;
  lastCommit?: string | null;
}

/** A canonicalized cycle finding. */
export interface CycleFinding {
  ids: string[];
  names: string[];
  length: number;
}

@Injectable()
export class IntelligenceRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Dead-code / orphan candidates, most recently-changed first. */
  async findOrphans(repoId: string, limit: number) {
    const rows = await this.db.executeRead<OrphanRow[]>(
      (tx) => tx.run(FIND_ORPHANS, { repoId, limit }),
      { name: 'intelligence-orphans' },
    );
    return rows.map((row) => {
      const props = asProperties(row.n);
      return {
        id: String(props.id ?? ''),
        type: (row.nodeType ?? 'File') as NodeType,
        label: humanLabel(props),
        incomingDependencies: 0,
        hasTests: toNumber(row.testCount) > 0,
        commits: toNumber(row.commitCount),
      };
    });
  }

  /** Circular import cycles among files (canonicalized, capped). */
  async findImportCycles(limit: number): Promise<CycleFinding[]> {
    const rows = await this.db.executeRead<CycleRow[]>(
      (tx) => tx.run(FIND_FILE_IMPORT_CYCLES, { limit: Math.max(limit, MAX_SMELL_CYCLES * 4) }),
      { name: 'intelligence-import-cycles' },
    );
    return this.canonicalizeCycles(rows, 'File');
  }

  /** Circular inheritance cycles among classes (canonicalized, capped). */
  async findExtendsCycles(limit: number): Promise<CycleFinding[]> {
    const rows = await this.db.executeRead<CycleRow[]>(
      (tx) => tx.run(FIND_CLASS_EXTENDS_CYCLES, { limit: Math.max(limit, MAX_SMELL_CYCLES * 4) }),
      { name: 'intelligence-extends-cycles' },
    );
    return this.canonicalizeCycles(rows, 'Class');
  }

  /**
   * Deduplicates cycle walks: a simple cycle of length k appears k times as
   * rotations and twice as mirrored walks, so the canonical signature is the
   * sorted id list. Only SIMPLE cycles (no repeated members) survive.
   */
  private canonicalizeCycles(rows: CycleRow[], fallbackType: NodeType): CycleFinding[] {
    const bySignature = new Map<string, CycleFinding>();
    for (const row of rows) {
      const ids = (row.ids ?? []).filter(Boolean);
      const names = row.names ?? [];
      // Simple-cycle guard: every member appears exactly once.
      if (ids.length < 2 || new Set(ids).size !== ids.length) continue;
      const length = Math.max(2, toNumber(row.cycleLength));
      const signature = [...ids].sort().join('|');
      if (!bySignature.has(signature)) {
        bySignature.set(signature, { ids, names, length });
      }
    }
    return [...bySignature.values()].slice(0, MAX_SMELL_CYCLES);
  }

  /** God modules: classes with high fan-in × fan-out over CALLS. */
  async findGodModules(repoId: string, limit: number) {
    const rows = await this.db.executeRead<MetricRow[]>(
      (tx) => tx.run(FIND_GOD_MODULES, { repoId, limit }),
      { name: 'intelligence-god-modules' },
    );
    return rows.map((row) => {
      const props = asProperties(row.n);
      return {
        ref: toNodeRef(String(props.id ?? ''), row.nodeType ?? 'Class', humanLabel(props)),
        fanIn: toNumber(row.fanIn),
        fanOut: toNumber(row.fanOut),
        score: toNumber(row.score),
      };
    });
  }

  /** Fragile entities: classes with high commit churn × many dependents. */
  async findFragileEntities(repoId: string, limit: number) {
    const rows = await this.db.executeRead<MetricRow[]>(
      (tx) => tx.run(FIND_FRAGILE_ENTITIES, { repoId, limit }),
      { name: 'intelligence-fragile-entities' },
    );
    return rows.map((row) => {
      const props = asProperties(row.n);
      return {
        ref: toNodeRef(String(props.id ?? ''), row.nodeType ?? 'Class', humanLabel(props)),
        commits: toNumber(row.commits),
        dependents: toNumber(row.dependents),
        score: toNumber(row.score),
      };
    });
  }

  /** Files with zero tested functions, ranked by dependents then churn. */
  async findTestGaps(repoId: string, limit: number) {
    const rows = await this.db.executeRead<TestGapRow[]>(
      (tx) => tx.run(FIND_TEST_GAPS, { repoId, limit, minFunctions: MIN_GAP_FUNCTIONS }),
      { name: 'intelligence-test-gaps' },
    );
    return rows.map((row) => {
      const props = asProperties(row.n);
      return {
        id: String(props.id ?? ''),
        type: (row.nodeType ?? 'File') as NodeType,
        label: humanLabel(props),
        untestedFunctions: toNumber(row.untestedFunctions),
        dependents: toNumber(row.dependents),
        commits: toNumber(row.commits),
      };
    });
  }

  /**
   * Every test covering any function contained by the given entity ids, with
   * the owning entity id attached so the service can rank by changed-surface
   * coverage. `toTestCoverage` needs a `t`/`fn` row; we attach entityId by
   * re-joining the target function to the entity surface in the service.
   */
  async findTestsForEntityIds(ids: string[]) {
    const rows = await this.db.executeRead<TestsForEntityRow[]>(
      (tx) => tx.run(FIND_TESTS_FOR_ENTITY_IDS, { ids }),
      { name: 'intelligence-tests-for-change' },
    );
    return rows.map((row) => ({
      coverage: toTestCoverage(row),
      entityId: String(row.entityId ?? ''),
    }));
  }

  /** Repo-wide authorship, ranked by distinct commits. */
  async findRepoKnowledge(repoId: string, limit: number) {
    const rows = await this.db.executeRead<KnowledgeRow[]>(
      (tx) => tx.run(FIND_REPO_KNOWLEDGE, { repoId, limit }),
      { name: 'intelligence-repo-knowledge' },
    );
    return rows.map(this.toKnowledgeOwner);
  }

  /** Entity-scoped authorship (entity or its containing file). */
  async findEntityKnowledge(entityId: string, limit: number) {
    const rows = await this.db.executeRead<KnowledgeRow[]>(
      (tx) => tx.run(FIND_ENTITY_KNOWLEDGE, { entityId, limit }),
      { name: 'intelligence-entity-knowledge' },
    );
    return rows.map(this.toKnowledgeOwner);
  }

  private toKnowledgeOwner(row: KnowledgeRow) {
    const d = asProperties(row.d);
    return {
      developer: toNodeRef(String(d.id ?? ''), 'Developer', humanLabel(d)),
      commits: toNumber(row.commits),
      lastCommit: row.lastCommit ? String(row.lastCommit) : null,
    };
  }

  /** Builds a GraphNodeRef for a node id (used for change-surface resolution). */
  async findNodeRef(id: string): Promise<GraphNodeRef | null> {
    const rows = await this.db.executeRead<Array<{ n?: Record<string, unknown>; nodeType?: string }>>(
      (tx) =>
        tx.run(
          `MATCH (n {id: $id}) RETURN properties(n) AS n, labels(n)[0] AS nodeType`,
          { id },
        ),
      { name: 'intelligence-node-ref' },
    );
    if (!rows.length) return null;
    const props = asProperties(rows[0].n);
    return toNodeRef(String(props.id ?? ''), rows[0].nodeType ?? 'File', humanLabel(props));
  }
}

export type { TestCoverage };
