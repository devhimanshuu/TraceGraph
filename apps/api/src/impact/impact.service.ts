/**
 * ImpactService — the flagship "Analyze Impact" use case (Phase 9 §38).
 *
 * Responsibilities (all deterministic, graph-driven — no AI):
 *   1. validate request + resolve the root node (404 for unknown ids)
 *   2. execute the bounded impact traversal (repository)
 *   3. classify results: distance 1 → DIRECT, >1 → INDIRECT, with the
 *      relationship policy (TESTS/MODIFIES/RELATED_TO never count as impact
 *      edges — they surface as tests/history context instead)
 *   4. deduplicate by entity id, keeping the minimum-distance path
 *   5. collect potentially-affected tests (root + direct impact targets)
 *   6. collect engineering history for the root
 *   7. generate explanations from graph facts
 *   8. build the ImpactResponse DTO (summary counts computed HERE, never in
 *      the frontend)
 */
import { Injectable } from '@nestjs/common';
import type {
  GraphNode,
  GraphNodeRef,
  ImpactedEntity,
  ImpactHistory,
  ImpactPath,
  ImpactResponse,
  ImpactScore,
  ImpactSummary,
  ImpactType,
  RelationshipType,
  TestCoverage,
} from '@tracegraph/shared';
import { GraphService } from '../graph/graph.service';
import { GraphRepository } from '../graph/graph.repository';
import { ImpactQueryDto } from './dto/impact-query.dto';
import {
  DEFAULT_IMPACT_DEPTH,
  DEFAULT_IMPACT_LIMIT,
  IMPACT_TEST_TARGETS,
  IMPACT_TESTS_PER_TARGET,
  MAX_IMPACT_PATHS,
  MAX_IMPACT_TESTS,
  SCORE_DEPENDENTS_HIGH,
  SCORE_HIGH,
  SCORE_MEDIUM,
  SCORE_TESTS_HIGH,
} from './impact.constants';
import { ImpactRepository, type ImpactEntityRow } from './impact.repository';

/** Relationship type → human verb for reason generation. */
const VERBS: Record<string, string> = {
  CALLS: 'calls',
  IMPORTS: 'imports',
  EXTENDS: 'extends',
};

@Injectable()
export class ImpactService {
  constructor(
    private readonly impactRepository: ImpactRepository,
    private readonly graphRepository: GraphRepository,
    private readonly graphService: GraphService,
  ) {}

  async analyze(nodeId: string, query: ImpactQueryDto): Promise<ImpactResponse> {
    // 1. Root resolution (404 for unknown nodes — consistent with every node route).
    const root = await this.graphService.getNode(nodeId);
    const depth = query.depth ?? DEFAULT_IMPACT_DEPTH;
    const limit = query.limit ?? DEFAULT_IMPACT_LIMIT;
    const pathLimit = Math.min(MAX_IMPACT_PATHS, limit * 4);

    // 2. Traversal (bounded by depth, path-preserving).
    const rows = await this.impactRepository.collectImpact(root, depth, pathLimit);

    // 3. Classify + 4. deduplicate: one entry per entity, minimum distance wins.
    // The root itself can never be "affected" by its own change — cyclic CALLS
    // chains must not surface the root as an impacted entity (Phase 9 §41).
    const { direct, indirect } = this.classify(rows, root.id);

    // 5. Tests: the root's own coverage plus coverage of directly-affected
    //    entities (capped) — clearly labeled "potentially affected".
    const tests = await this.collectTests(root, direct);

    // 6. History context for the selected entity.
    const history = await this.collectHistory(root);

    // 8. Response (summary + deterministic, explainable score).
    const { score, scoreReasons } = this.computeScore(direct, indirect, tests, depth);
    const summary: ImpactSummary = {
      direct: direct.length,
      indirect: indirect.length,
      tests: tests.length,
      commits: history.commits.length,
      pullRequests: history.pullRequests.length,
      issues: history.issues.length,
      maxDepth: depth,
      score,
      scoreReasons,
    };
    const rootRef: GraphNodeRef = { id: root.id, type: root.type, label: root.label };
    const paths = [...direct, ...indirect].map((e) => e.path).filter(Boolean);

    return {
      root: rootRef,
      depth,
      summary,
      directImpact: direct,
      indirectImpact: indirect,
      tests,
      history,
      paths,
    };
  }

  /**
   * Classification + deduplication (Phase 9 §14, §15).
   *
   * - distance 1 → DIRECT; distance > 1 → INDIRECT. Relationship semantics are
   *   already enforced by the traversal policy: only CALLS/IMPORTS/EXTENDS are
   *   traversed, so a TESTS edge can never masquerade as direct dependency.
   * - Dedup: keep the row with the minimum hop distance per target entity; if
   *   two paths tie, the first (shortest path, deterministic ordering) wins.
   */
  private classify(rows: ImpactEntityRow[], rootId: string): {
    direct: ImpactedEntity[];
    indirect: ImpactedEntity[];
  } {
    const best = new Map<string, ImpactEntityRow>();
    for (const row of rows) {
      // Cycle guard: a path that loops back to the root is not impact.
      if (row.target.id === rootId) continue;
      const current = best.get(row.target.id);
      if (!current || row.hops < current.hops) {
        best.set(row.target.id, row);
      }
    }

    const direct: ImpactedEntity[] = [];
    const indirect: ImpactedEntity[] = [];
    for (const row of best.values()) {
      const entity = this.toImpactedEntity(row);
      if (entity.impactType === 'DIRECT') direct.push(entity);
      else indirect.push(entity);
    }
    // Deterministic display order: alphabetical by label within each bucket.
    const sortBy = (a: ImpactedEntity, b: ImpactedEntity) => a.label.localeCompare(b.label);
    direct.sort(sortBy);
    indirect.sort(sortBy);
    return { direct, indirect };
  }

  /**
   * Deterministic severity indicator (Phase 9 §19) — never a numeric risk
   * prediction. Three explainable graph facts, each with its own reason:
   * dependents count, depth coverage vs the requested depth, and test
   * exposure. See `impact.constants.ts` for the thresholds.
   */
  private computeScore(
    direct: ImpactedEntity[],
    indirect: ImpactedEntity[],
    tests: TestCoverage[],
    depth: number,
  ): { score: ImpactScore; scoreReasons: string[] } {
    const dependents = direct.length + indirect.length;
    const maxDistance = Math.max(
      0,
      ...direct.map((e) => e.distance),
      ...indirect.map((e) => e.distance),
    );

    const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

    // 1. Dependents — the blast radius of the change.
    const dependentsPts =
      dependents === 0 ? 0 : dependents >= SCORE_DEPENDENTS_HIGH ? 2 : 1;
    const dependentsReason =
      dependents === 0
        ? 'No modeled dependents found'
        : indirect.length === 0
          ? plural(direct.length, 'direct dependent')
          : direct.length === 0
            ? plural(indirect.length, 'indirect dependent')
            : `${direct.length} direct and ${indirect.length} indirect dependents`;

    // 2. Depth coverage — how deep the impact actually reaches vs requested.
    const ratio = depth > 0 ? maxDistance / depth : 0;
    const depthPts = ratio >= 2 / 3 ? 2 : ratio >= 1 / 3 ? 1 : 0;
    const depthReason =
      maxDistance === 0
        ? 'No impact reaches beyond the selected entity'
        : maxDistance >= depth
          ? `Impact reaches the full ${depth}-hop depth`
          : `Impact reaches ${maxDistance} of ${depth} requested hops`;

    // 3. Test exposure — how much automated coverage sits on the surface.
    const testPts = tests.length === 0 ? 0 : tests.length >= SCORE_TESTS_HIGH ? 2 : 1;
    const testReason =
      tests.length === 0
        ? 'No test coverage found for the affected surface'
        : plural(tests.length, 'potentially affected test');

    const total = dependentsPts + depthPts + testPts;
    const score: ImpactScore = total >= SCORE_HIGH ? 'HIGH' : total >= SCORE_MEDIUM ? 'MEDIUM' : 'LOW';
    return { score, scoreReasons: [dependentsReason, depthReason, testReason] };
  }

  /** Builds an ImpactedEntity with a graph-fact explanation. */
  private toImpactedEntity(row: ImpactEntityRow): ImpactedEntity {
    const impactType: ImpactType = row.hops <= 1 ? 'DIRECT' : 'INDIRECT';
    const path: ImpactPath = {
      nodes: row.nodes,
      relTypes: row.relTypes,
    };
    return {
      id: row.target.id,
      type: row.target.type,
      label: row.target.label,
      impactType,
      distance: row.hops,
      relationship: row.relationship,
      reason: this.buildReason(row),
      path,
    };
  }

  /**
   * Deterministic explanation from graph facts — never an LLM (Phase 9 §11, §49).
   *   DIRECT:  "CheckoutService directly calls PaymentService."
   *   INDIRECT: "OrderService depends on CheckoutService, which calls PaymentService."
   */
  private buildReason(row: ImpactEntityRow): string {
    const labels = row.nodes.map((n) => n.label);
    const rootLabel = labels[labels.length - 1] ?? 'the root';
    if (row.hops <= 1) {
      const verb = VERBS[row.relationship] ?? row.relationship.toLowerCase();
      return `${row.target.label} directly ${verb} ${rootLabel}.`;
    }
    // Indirect: the root connection is the LAST relationship in the chain
    // (intermediate → root); everything before it is "depends on".
    const lastRel = row.relTypes[row.relTypes.length - 1] ?? row.relationship;
    const rootVerb = VERBS[lastRel] ?? lastRel.toLowerCase();
    if (labels.length <= 2) {
      return `${labels[0]} depends on ${labels[1]}, which ${rootVerb} ${rootLabel}.`;
    }
    const middle = labels.slice(1, -1).join(', ');
    return `${labels[0]} depends on ${middle}, which ${rootVerb} ${rootLabel}.`;
  }

  /**
   * Potentially affected tests: the root's own coverage plus coverage of the
   * directly-affected entities (capped), deduplicated by test id.
   */
  private async collectTests(root: GraphNode, direct: ImpactedEntity[]): Promise<TestCoverage[]> {
    const targets = [root, ...direct.slice(0, IMPACT_TEST_TARGETS).map((e) => this.toGraphNode(e))];
    const seen = new Set<string>();
    const tests: TestCoverage[] = [];
    for (const target of targets) {
      const found = await this.graphRepository.findTests(target, IMPACT_TESTS_PER_TARGET);
      for (const test of found) {
        if (seen.has(test.id)) continue;
        seen.add(test.id);
        tests.push(test);
        if (tests.length >= MAX_IMPACT_TESTS) return tests;
      }
    }
    return tests;
  }

  /** Engineering history for the selected entity (commits, PRs, issues). */
  private async collectHistory(root: GraphNode): Promise<ImpactHistory> {
    const [commits, pullRequests, issues] = await Promise.all([
      this.graphRepository.findCommits(root.id, 10),
      this.graphRepository.findPullRequests(root.id, 5),
      this.graphRepository.findIssues(root.id, 5),
    ]);
    return { commits, pullRequests, issues };
  }

  /** ImpactedEntity → GraphNode for repository methods that need a node. */
  private toGraphNode(entity: ImpactedEntity): GraphNode {
    return {
      id: entity.id,
      type: entity.type,
      label: entity.label,
      properties: {},
    };
  }
}

export type { RelationshipType };
