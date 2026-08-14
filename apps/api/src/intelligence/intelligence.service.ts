/**
 * IntelligenceService — deterministic, graph-driven repository intelligence.
 * No AI: every finding is derived from graph facts and every score/rank is
 * explainable from the evidence returned alongside it.
 *
 * Surfaces:
 *   1. Orphans        — dead-code candidates (zero inbound dependency signal)
 *   2. Smells         — circular import/extends cycles, god modules, fragile
 *   3. Test gaps      — files with zero test coverage, ranked by risk context
 *   4. Blast radius   — PR/diff batch impact over a set of changed files
 *   5. Tests-for-change — exact tests to run, ranked by changed-surface coverage
 *   6. Knowledge      — "who to ask": developers ranked by commit authorship
 *
 * Blast-radius classification + scoring deliberately reuse the impact
 * thresholds (impact.constants) so the PR view speaks the same LOW/MEDIUM/HIGH
 * language as the per-entity analysis.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BlastRadiusResponse,
  GraphNode,
  GraphNodeRef,
  ImpactedEntity,
  ImpactPath,
  ImpactScore,
  ImpactType,
  KnowledgeResponse,
  OrphanListResponse,
  RelationshipType,
  SmellResponse,
  TestCoverage,
  TestGapResponse,
  TestsForChangeResponse,
} from '@tracegraph/shared';
import { GraphRepository } from '../graph/graph.repository';
import { ImpactRepository, type ImpactEntityRow } from '../impact/impact.repository';
import {
  IMPACT_TEST_TARGETS,
  MAX_IMPACT_TESTS,
  SCORE_DEPENDENTS_HIGH,
  SCORE_HIGH,
  SCORE_MEDIUM,
  SCORE_TESTS_HIGH,
} from '../impact/impact.constants';
import {
  BLAST_TESTS_PER_TARGET,
  DEFAULT_BLAST_DEPTH,
  DEFAULT_KNOWLEDGE_LIMIT,
  DEFAULT_INTELLIGENCE_LIMIT,
  MAX_BLAST_PATHS,
  MAX_KNOWLEDGE_LIMIT,
  SMELL_LIMIT,
} from './intelligence.constants';

import { IntelligenceRepository } from './intelligence.repository';
import type { BlastRadiusDto, TestsForChangeDto } from './dto/blast-radius.dto';

/** Relationship type → human verb for reason generation (mirrors impact.service). */
const VERBS: Record<string, string> = {
  CALLS: 'calls',
  IMPORTS: 'imports',
  EXTENDS: 'extends',
};

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly intelligenceRepository: IntelligenceRepository,
    private readonly impactRepository: ImpactRepository,
    private readonly graphRepository: GraphRepository,
  ) {}

  // ── Orphans (dead code) ─────────────────────────────────────────────────────

  async getOrphans(limit?: number): Promise<OrphanListResponse> {
    const repo = await this.requireRepository();
    const found = await this.intelligenceRepository.findOrphans(
      repo.id,
      Math.min(limit ?? DEFAULT_INTELLIGENCE_LIMIT, DEFAULT_INTELLIGENCE_LIMIT * 2),
    );
    // "Dead code" should read as code. Manifests, docs, configs and test files
    // have no inbound edges by design (a test runner, not the import graph,
    // exercises them) — filtering them keeps the list actionable.
    const orphans = found.filter((o) => !this.isNonCodeEntity(o.id));
    return { repo: this.ref(repo), orphans };
  }

  /**
   * Non-code / test entities that legitimately have no inbound edges —
   * manifests, lockfiles, docs, images, configs, and *.test.* / *.spec.* files
   * (exercised by a runner, never imported). Pure heuristic over ids, kept in
   * one place and documented so the deterministic claim stays checkable.
   */
  private isNonCodeEntity(id: string): boolean {
    // Ids carry a `file:`/`class:`/… prefix; the heuristics match the path.
    const path = id.replace(/^(file|class|function|directory):/, '');
    if (/\.test\.[^.]+$/.test(path) || /\.spec\.[^.]+$/.test(path)) return true;
    if (
      /(^|\/)(package(-lock)?\.json|\.gitignore|\.npmrc|\.editorconfig|\.env(\..*)?|\.prettierrc(\.[a-z]+)?|Dockerfile)$/i.test(
        path,
      )
    ) {
      return true;
    }
    if (
      /(^|\/)(\.eslintrc(\.[a-z]+)?|tsconfig(\.\w+)?\.json|jsconfig\.json|next\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s|jest\.config\.[cm]?[jt]s|tailwind\.config\.[cm]?[jt]s)$/i.test(
        path,
      )
    ) {
      return true;
    }
    if (/\.(md|markdown|svg|png|jpe?g|gif|ico|lock|sum|map|d\.ts)$/i.test(path)) return true;
    return false;
  }

  // ── Architecture smells ─────────────────────────────────────────────────────

  async getSmells(): Promise<SmellResponse> {
    const repo = await this.requireRepository();
    const [importCycles, extendsCycles, godModuleRows, fragileRows] = await Promise.all([
      this.intelligenceRepository.findImportCycles(SMELL_LIMIT),
      this.intelligenceRepository.findExtendsCycles(SMELL_LIMIT),
      this.intelligenceRepository.findGodModules(repo.id, SMELL_LIMIT),
      this.intelligenceRepository.findFragileEntities(repo.id, SMELL_LIMIT),
    ]);

    const cycles = [
      ...importCycles.map((c) => ({
        kind: 'cycle' as const,
        title: 'Circular import cycle',
        reason: `${c.names.join(' → ')} → ${c.names[0]}. Files import each other in a cycle, so module initialization order and change blast radius become unpredictable.`,
        entities: c.ids.map((id, i) => ({ id, type: 'File' as const, label: c.names[i] ?? id })),
        metrics: { cycleLength: c.length },
      })),
      ...extendsCycles.map((c) => ({
        kind: 'cycle' as const,
        title: 'Circular inheritance cycle',
        reason: `${c.names.join(' → ')} → ${c.names[0]}. Classes extend each other in a cycle, which breaks constructor ordering and can cause subtle initialization bugs.`,
        entities: c.ids.map((id, i) => ({ id, type: 'Class' as const, label: c.names[i] ?? id })),
        metrics: { cycleLength: c.length },
      })),
    ];

    const godModules = godModuleRows.map((g) => ({
      kind: 'god-module' as const,
      title: 'God module',
      reason: `Called from ${g.fanIn} distinct places and calls ${g.fanOut} distinct targets — the class concentrates coupling in both directions, so a change ripples widely and it is sensitive to change everywhere else.`,
      entities: [g.ref],
      metrics: { fanIn: g.fanIn, fanOut: g.fanOut },
    }));

    const fragile = fragileRows.map((f) => ({
      kind: 'fragile' as const,
      title: 'Fragile entity',
      reason: `Touched by ${f.commits} commits and depended on by ${f.dependents} distinct callers — frequently changed code with a wide blast radius is where a regression hurts most.`,
      entities: [f.ref],
      metrics: { commits: f.commits, dependents: f.dependents },
    }));

    return { repo: this.ref(repo), cycles, godModules, fragile };
  }

  // ── Test coverage gaps ──────────────────────────────────────────────────────

  async getTestGaps(limit?: number): Promise<TestGapResponse> {
    const repo = await this.requireRepository();
    const gaps = await this.intelligenceRepository.findTestGaps(
      repo.id,
      Math.min(limit ?? DEFAULT_INTELLIGENCE_LIMIT, DEFAULT_INTELLIGENCE_LIMIT * 2),
    );
    return { repo: this.ref(repo), gaps };
  }

  // ── PR / diff blast radius ──────────────────────────────────────────────────

  async blastRadius(dto: BlastRadiusDto): Promise<BlastRadiusResponse> {
    const repo = await this.requireRepository();
    const depth = dto.depth ?? DEFAULT_BLAST_DEPTH;
    const pathLimit = Math.max(
      20,
      Math.floor(MAX_BLAST_PATHS / Math.max(1, dto.files.length)),
    );

    // 1. Resolve changed paths to File nodes (dedup, track unresolved).
    const { resolved, unresolved } = await this.resolveFiles(dto.files);
    const changedIds = new Set(resolved.map((n) => n.id));

    // 2. Batch inbound impact across every changed file (bounded per file).
    const rows = (
      await Promise.all(resolved.map((file) => this.impactRepository.collectImpact(file, depth, pathLimit)))
    ).flat();

    // 3. Classify + dedup (min distance, never the changed files themselves).
    const { direct, indirect } = this.classify(rows, changedIds);

    // 4. Potentially affected tests across the changed surface.
    const tests = await this.collectTests(resolved, direct);

    // 5. Summary + deterministic score (same language as the impact engine).
    const { score, scoreReasons } = this.computeScore(direct, indirect, tests, depth);
    return {
      repo: this.ref(repo),
      depth,
      changed: resolved.map((n) => this.ref(n)),
      unresolved,
      directImpact: direct,
      indirectImpact: indirect,
      tests,
      summary: {
        changed: resolved.length,
        direct: direct.length,
        indirect: indirect.length,
        tests: tests.length,
        score,
        scoreReasons,
      },
    };
  }

  // ── Tests to run for a change ───────────────────────────────────────────────

  async testsForChange(dto: TestsForChangeDto): Promise<TestsForChangeResponse> {
    // Existence gate: the graph must be mapped before ranking anything.
    await this.requireRepository();
    const depth = dto.depth ?? DEFAULT_BLAST_DEPTH;
    const pathLimit = Math.max(
      20,
      Math.floor(MAX_BLAST_PATHS / Math.max(1, dto.entityIds.length)),
    );

    const { resolved, unresolved } = await this.resolveEntities(dto.entityIds);
    const changedIds = new Set(resolved.map((n) => n.id));

    // Affected surface = changed entities + everything they impact.
    const rows = (
      await Promise.all(resolved.map((root) => this.impactRepository.collectImpact(root, depth, pathLimit)))
    ).flat();
    const affected = new Map<string, GraphNodeRef>();
    for (const n of resolved) affected.set(n.id, this.ref(n));
    for (const row of rows) {
      if (!affected.has(row.target.id)) affected.set(row.target.id, row.target);
    }

    // Every test covering any affected entity, with the covered entity attached.
    const found = await this.intelligenceRepository.findTestsForEntityIds([...affected.keys()]);

    // Rank: how much of the changed surface does each test guard?
    const byTest = new Map<string, { coverage: TestCoverage; entities: Set<string> }>();
    for (const { coverage, entityId } of found) {
      const entry = byTest.get(coverage.id) ?? { coverage, entities: new Set<string>() };
      entry.entities.add(entityId);
      byTest.set(coverage.id, entry);
    }
    const tests = [...byTest.values()]
      .map(({ coverage, entities }) => {
        const covers = entities.size;
        const directlyCovers = [...entities].filter((e) => changedIds.has(e)).length;
        return {
          id: coverage.id,
          name: coverage.name,
          framework: coverage.framework,
          filePath: coverage.filePath,
          covers,
          directlyCovers,
          // Changed files are weighted double: a test that guards code you
          // edited directly is more important than one covering a transitively
          // reached neighbor.
          risk: directlyCovers * 2 + (covers - directlyCovers),
        };
      })
      .sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name));

    return {
      changed: resolved.map((n) => this.ref(n)),
      unresolved,
      tests,
    };
  }

  // ── Knowledge map ("who to ask") ────────────────────────────────────────────

  async getKnowledge(entityId?: string, limit?: number): Promise<KnowledgeResponse> {
    const repo = await this.requireRepository();
    const cap = Math.min(limit ?? DEFAULT_KNOWLEDGE_LIMIT, MAX_KNOWLEDGE_LIMIT);
    if (entityId) {
      const entity = await this.graphRepository.findNodeById(entityId);
      if (entity) {
        const owners = await this.intelligenceRepository.findEntityKnowledge(entity.id, cap);
        return { repo: this.ref(repo), entity: this.ref(entity), owners };
      }
    }
    const owners = await this.intelligenceRepository.findRepoKnowledge(repo.id, cap);
    return { repo: this.ref(repo), entity: null, owners };
  }

  // ── Shared internals ────────────────────────────────────────────────────────

  /**
   * Resolves changed PR paths to File nodes. Accepts plain repo-relative
   * paths, `a/`/`b/` diff prefixes, and GitHub blob URLs; unknown paths are
   * returned as unresolved (new files, docs, ignored paths — not a failure).
   */
  private async resolveFiles(paths: string[]): Promise<{ resolved: GraphNode[]; unresolved: string[] }> {
    const resolved: GraphNode[] = [];
    const unresolved: string[] = [];
    const seen = new Set<string>();
    for (const raw of paths) {
      const id = this.normalizeFilePath(raw);
      if (seen.has(id)) continue;
      seen.add(id);
      const node = await this.graphRepository.findNodeById(id);
      if (node && node.type === 'File') resolved.push(node);
      else unresolved.push(raw.trim());
    }
    return { resolved, unresolved };
  }

  /** Resolves change ids that may be paths OR full node ids. */
  private async resolveEntities(ids: string[]): Promise<{ resolved: GraphNode[]; unresolved: string[] }> {
    const resolved: GraphNode[] = [];
    const unresolved: string[] = [];
    const seen = new Set<string>();
    for (const raw of ids) {
      const id = this.looksLikeNodeId(raw) ? raw.trim() : this.normalizeFilePath(raw);
      if (seen.has(id)) continue;
      seen.add(id);
      const node = await this.graphRepository.findNodeById(id);
      if (node && (node.type === 'File' || node.type === 'Class' || node.type === 'Function')) {
        resolved.push(node);
      } else {
        unresolved.push(raw.trim());
      }
    }
    return { resolved, unresolved };
  }

  private looksLikeNodeId(raw: string): boolean {
    return /^(file|class|function|directory):/.test(raw.trim());
  }

  /** Plain path → File node id, tolerating diff prefixes and blob URLs. */
  private normalizeFilePath(raw: string): string {
    let p = raw.trim();
    if (p.startsWith('a/')) p = p.slice(2);
    else if (p.startsWith('b/')) p = p.slice(2);
    const blobMatch = p.match(/\/blob\/[^/]+\/(.+)$/);
    if (blobMatch) p = blobMatch[1];
    p = p.replace(/^\/+/, '');
    return `file:${p}`;
  }

  /**
   * Classification + dedup (same rules as ImpactService): distance 1 →
   * DIRECT, > 1 → INDIRECT; one entry per entity at the minimum distance;
   * changed roots can never be "impacted" by themselves.
   */
  private classify(
    rows: ImpactEntityRow[],
    rootIds: Set<string>,
  ): { direct: ImpactedEntity[]; indirect: ImpactedEntity[] } {
    const best = new Map<string, ImpactEntityRow>();
    for (const row of rows) {
      if (rootIds.has(row.target.id)) continue;
      const current = best.get(row.target.id);
      if (!current || row.hops < current.hops) best.set(row.target.id, row);
    }
    const direct: ImpactedEntity[] = [];
    const indirect: ImpactedEntity[] = [];
    for (const row of best.values()) {
      const impactType: ImpactType = row.hops <= 1 ? 'DIRECT' : 'INDIRECT';
      const path: ImpactPath = { nodes: row.nodes, relTypes: row.relTypes };
      const entity: ImpactedEntity = {
        id: row.target.id,
        type: row.target.type,
        label: row.target.label,
        impactType,
        distance: row.hops,
        relationship: row.relationship,
        reason: this.buildReason(row),
        path,
        ...(row.via ? { via: row.via } : {}),
      };
      (impactType === 'DIRECT' ? direct : indirect).push(entity);
    }
    const byLabel = (a: ImpactedEntity, b: ImpactedEntity) => a.label.localeCompare(b.label);
    direct.sort(byLabel);
    indirect.sort(byLabel);
    return { direct, indirect };
  }

  /** Deterministic reason from graph facts (mirrors impact.service.buildReason). */
  private buildReason(row: ImpactEntityRow): string {
    const labels = row.nodes.map((n) => n.label);
    const rootLabel = labels[labels.length - 1] ?? 'the root';
    if (row.hops <= 1) {
      const verb = VERBS[row.relationship] ?? row.relationship.toLowerCase();
      return `${row.target.label} directly ${verb} ${rootLabel}.`;
    }
    const lastRel = row.relTypes[row.relTypes.length - 1] ?? row.relationship;
    const rootVerb = VERBS[lastRel] ?? lastRel.toLowerCase();
    if (labels.length <= 2) {
      return `${labels[0]} depends on ${labels[1]}, which ${rootVerb} ${rootLabel}.`;
    }
    const middle = labels.slice(1, -1).join(', ');
    return `${labels[0]} depends on ${middle}, which ${rootVerb} ${rootLabel}.`;
  }

  /**
   * Potentially affected tests: every changed entity's coverage plus coverage
   * of directly-affected entities, deduplicated by test id (capped) — the
   * same collection rule as the impact engine.
   */
  private async collectTests(
    roots: GraphNode[],
    direct: ImpactedEntity[],
  ): Promise<TestCoverage[]> {
    const targets = [...roots, ...direct.slice(0, IMPACT_TEST_TARGETS).map((e) => this.toNode(e))];
    const seen = new Set<string>();
    const tests: TestCoverage[] = [];
    for (const target of targets) {
      const found = await this.graphRepository.findTests(target, BLAST_TESTS_PER_TARGET);
      for (const test of found) {
        if (seen.has(test.id)) continue;
        seen.add(test.id);
        tests.push(test);
        if (tests.length >= MAX_IMPACT_TESTS) return tests;
      }
    }
    return tests;
  }

  /** Deterministic LOW/MEDIUM/HIGH from dependents, depth coverage, test exposure. */
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

    const dependentsPts = dependents === 0 ? 0 : dependents >= SCORE_DEPENDENTS_HIGH ? 2 : 1;
    const dependentsReason =
      dependents === 0
        ? 'No modeled dependents found'
        : indirect.length === 0
          ? plural(direct.length, 'direct dependent')
          : direct.length === 0
            ? plural(indirect.length, 'indirect dependent')
            : `${direct.length} direct and ${indirect.length} indirect dependents`;

    const ratio = depth > 0 ? maxDistance / depth : 0;
    const depthPts = ratio >= 2 / 3 ? 2 : ratio >= 1 / 3 ? 1 : 0;
    const depthReason =
      maxDistance === 0
        ? 'No impact reaches beyond the changed files'
        : maxDistance >= depth
          ? `Impact reaches the full ${depth}-hop depth`
          : `Impact reaches ${maxDistance} of ${depth} requested hops`;

    const testPts = tests.length === 0 ? 0 : tests.length >= SCORE_TESTS_HIGH ? 2 : 1;
    const testReason =
      tests.length === 0
        ? 'No test coverage found for the affected surface'
        : plural(tests.length, 'potentially affected test');

    const total = dependentsPts + depthPts + testPts;
    return {
      score: total >= SCORE_HIGH ? 'HIGH' : total >= SCORE_MEDIUM ? 'MEDIUM' : 'LOW',
      scoreReasons: [dependentsReason, depthReason, testReason],
    };
  }

  private async requireRepository(): Promise<GraphNode> {
    const repo = await this.graphRepository.findDefaultRepository();
    if (!repo) {
      throw new NotFoundException(
        'No repository found — the graph is empty. Import a GitHub repository to get started.',
      );
    }
    return repo;
  }

  private ref(node: GraphNode): GraphNodeRef {
    return { id: node.id, type: node.type, label: node.label };
  }

  private toNode(entity: ImpactedEntity): GraphNode {
    return { id: entity.id, type: entity.type, label: entity.label, properties: {} };
  }
}

export type { RelationshipType };
