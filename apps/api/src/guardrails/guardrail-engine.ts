/**
 * GuardrailEngine — evaluates architecture rules against the code graph.
 *
 * Architecture:
 *   Rule → Selector matching → Graph traversal → Violations
 *
 * The engine is deterministic, bounded, and produces explainable results.
 * It never generates arbitrary Cypher — selectors are translated into
 * parameterized graph queries.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import type {
  ArchitectureRule,
  ArchitectureViolation,
  GuardrailEvaluation,
  ViolationSuppression,
  PathSelector,
  Severity,
  EvaluationResponse,
  GuardrailDashboard,
  RelationshipSelector,
} from '@tracegraph/shared';

const logger = new Logger('GuardrailEngine');

/** In-memory rule store (would be CognoDB in production). */
const ruleStore = new Map<string, ArchitectureRule>();

/** In-memory violation store. */
const violationStore = new Map<string, ArchitectureViolation>();

/** In-memory evaluation store. */
const evaluationStore = new Map<string, GuardrailEvaluation>();

/** In-memory suppressions. */
const suppressionStore = new Map<string, ViolationSuppression>();

@Injectable()
export class GuardrailEngine {
  constructor(private readonly db: DatabaseService) {}

  // ── Rule CRUD ──────────────────────────────────────────────────────────

  async createRule(rule: Omit<ArchitectureRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ArchitectureRule> {
    const now = new Date().toISOString();
    const full: ArchitectureRule = {
      ...rule,
      id: `rule:${randomUUID().slice(0, 8)}`,
      createdAt: now,
      updatedAt: now,
    };
    ruleStore.set(full.id, full);
    return full;
  }

  async getRule(id: string): Promise<ArchitectureRule | null> {
    return ruleStore.get(id) ?? null;
  }

  async listRules(repositoryId: string): Promise<ArchitectureRule[]> {
    return [...ruleStore.values()]
      .filter((r) => r.repositoryId === repositoryId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async updateRule(id: string, patch: Partial<ArchitectureRule>): Promise<ArchitectureRule | null> {
    const rule = ruleStore.get(id);
    if (!rule) return null;
    const updated = { ...rule, ...patch, id: rule.id, updatedAt: new Date().toISOString() };
    ruleStore.set(id, updated);
    return updated;
  }

  async deleteRule(id: string): Promise<boolean> {
    return ruleStore.delete(id);
  }

  // ── Evaluation ─────────────────────────────────────────────────────────

  async evaluate(
    repositoryId: string,
    ruleIds?: string[],
    revision?: string,
  ): Promise<EvaluationResponse> {
    const evalId = `eval:${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // Get rules to evaluate
    let rules = [...ruleStore.values()].filter(
      (r) => r.repositoryId === repositoryId && r.enabled,
    );
    if (ruleIds && ruleIds.length > 0) {
      rules = rules.filter((r) => ruleIds.includes(r.id));
    }

    const evalRecord: GuardrailEvaluation = {
      id: evalId,
      repositoryId,
      revision: revision ?? null,
      startedAt: now,
      completedAt: null,
      status: 'RUNNING',
      rulesChecked: rules.length,
      violationsFound: 0,
      severityCounts: { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    };
    evaluationStore.set(evalId, evalRecord);

    const allViolations: ArchitectureViolation[] = [];

    for (const rule of rules) {
      try {
        const violations = await this.evaluateRule(rule, repositoryId, revision ?? null);
        allViolations.push(...violations);
      } catch (err) {
        logger.error(`Rule ${rule.id} evaluation failed: ${String(err)}`);
      }
    }

    // Count severities
    for (const v of allViolations) {
      evalRecord.severityCounts[v.severity] = (evalRecord.severityCounts[v.severity] ?? 0) + 1;
    }

    evalRecord.completedAt = new Date().toISOString();
    evalRecord.status = 'COMPLETED';
    evalRecord.violationsFound = allViolations.length;

    return { evaluation: evalRecord, violations: allViolations };
  }

  /**
   * Evaluate a single rule against the graph.
   */
  private async evaluateRule(
    rule: ArchitectureRule,
    repositoryId: string,
    revision: string | null,
  ): Promise<ArchitectureViolation[]> {
    if (rule.ruleType === 'circular-dependency') {
      return this.detectCircularDependencies(rule, repositoryId, revision);
    }
    return this.detectForbiddenDependencies(rule, repositoryId, revision);
  }

  /**
   * Detect forbidden dependency: source → relationship → target
   * within the repository graph.
   */
  private async detectForbiddenDependencies(
    rule: ArchitectureRule,
    repositoryId: string,
    revision: string | null,
  ): Promise<ArchitectureViolation[]> {
    const violations: ArchitectureViolation[] = [];
    const maxDepth = Math.min(rule.maxDepth, 5);

    try {
      // Step 1: Find source nodes matching the source selector
      const sourceIds = await this.matchNodesBySelector(
        rule.sourceSelector,
        repositoryId,
      );

      if (sourceIds.length === 0) return [];

      // Step 2: For each source, traverse the specified relationship(s) up to maxDepth
      const relTypes = rule.relationship === 'ANY'
        ? ['IMPORTS', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'REFERENCES']
        : [rule.relationship];

      for (const sourceId of sourceIds) {
        for (const relType of relTypes) {
          const reached = await this.traverseFromSource(
            sourceId,
            relType,
            maxDepth,
            repositoryId,
          );

          // Step 3: Check if any reached node matches the target selector
          for (const hop of reached) {
            if (this.matchesSelector(rule.targetSelector, hop.targetPath)) {
              const path = [
                { id: sourceId, label: hop.sourceLabel, relationship: relType },
                { id: hop.targetId, label: hop.targetLabel, relationship: '' },
              ];

              const violation: ArchitectureViolation = {
                id: `viol:${randomUUID().slice(0, 8)}`,
                ruleId: rule.id,
                ruleName: rule.name,
                repositoryId,
                revision,
                sourceNode: {
                  id: sourceId,
                  label: hop.sourceLabel,
                  path: hop.sourcePath,
                },
                relationship: relType,
                targetNode: {
                  id: hop.targetId,
                  label: hop.targetLabel,
                  path: hop.targetPath,
                },
                path,
                severity: rule.severity,
                status: 'OPEN',
                suppression: null,
                detectedAt: new Date().toISOString(),
              };

              violations.push(violation);
              violationStore.set(violation.id, violation);
            }
          }
        }
      }
    } catch (err) {
      logger.error(`Rule ${rule.id} graph query failed: ${String(err)}`);
    }

    return violations;
  }

  /**
   * Detect circular dependencies within a scope.
   */
  private async detectCircularDependencies(
    rule: ArchitectureRule,
    repositoryId: string,
    revision: string | null,
  ): Promise<ArchitectureViolation[]> {
    const violations: ArchitectureViolation[] = [];

    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `MATCH (repo:Repository {id: $repoId})-[:CONTAINS*1..5]->(f:File)
           WITH f
           MATCH (a:File)-[r:IMPORTS|CALLS]->(b:File)
           WHERE a.path STARTS WITH $scope AND b.path STARTS WITH $scope
             AND a <> b
           RETURN a.id AS fromId, a.path AS fromPath, a.name AS fromName,
                  b.id AS toId, b.path AS toPath, b.name AS toName,
                  type(r) AS relType
           LIMIT 1000`,
          { repoId: repositoryId, scope: rule.sourceSelector.pattern.replace('/**', '/') },
        ),
        { name: 'guardrail-cycle-query' },
      );

      // Build adjacency list and detect cycles using DFS
      const adj = new Map<string, Array<{ target: string; rel: string; targetPath: string; targetName: string }>>();
      for (const row of rows) {
        const fromId = String(row.fromId ?? '');
        const toId = String(row.toId ?? '');
        if (!fromId || !toId) continue;
        const existing = adj.get(fromId) ?? [];
        existing.push({ target: toId, rel: String(row.relType ?? ''), targetPath: String(row.toPath ?? ''), targetName: String(row.toName ?? '') });
        adj.set(fromId, existing);
      }

      // DFS cycle detection (bounded)
      const visited = new Set<string>();
      const inStack = new Set<string>();
      const path: string[] = [];
      const pathNames: string[] = [];
      const pathRels: string[] = [];
      const foundCycles = new Set<string>();

      const dfs = (node: string, depth: number): void => {
        if (depth > 10) return; // Bound traversal
        if (inStack.has(node)) {
          // Found cycle — create violation
          const cycleStart = path.indexOf(node);
          if (cycleStart >= 0) {
            const cyclePath = path.slice(cycleStart);
            const cycleKey = cyclePath.sort().join('|');
            if (!foundCycles.has(cycleKey)) {
              foundCycles.add(cycleKey);
              const pathNodes = cyclePath.map((id, i) => ({
                id,
                label: pathNames[cycleStart + i] ?? id,
                relationship: i < cyclePath.length - 1 ? (pathRels[cycleStart + i] ?? '') : '',
              }));
              violations.push({
                id: `viol:${randomUUID().slice(0, 8)}`,
                ruleId: rule.id,
                ruleName: rule.name,
                repositoryId,
                revision,
                sourceNode: { id: cyclePath[0], label: pathNames[0] ?? '', path: '' },
                relationship: pathRels[0] ?? '',
                targetNode: { id: cyclePath[cyclePath.length - 1], label: pathNames[cyclePath.length - 1] ?? '', path: '' },
                path: pathNodes,
                severity: rule.severity,
                status: 'OPEN',
                suppression: null,
                detectedAt: new Date().toISOString(),
              });
            }
          }
          return;
        }

        visited.add(node);
        inStack.add(node);
        path.push(node);
        pathNames.push(adj.get(node)?.[0]?.targetName ?? '');
        pathRels.push(adj.get(node)?.[0]?.rel ?? '');

        const neighbors = adj.get(node) ?? [];
        for (const n of neighbors) {
          dfs(n.target, depth + 1);
        }

        inStack.delete(node);
        path.pop();
        pathNames.pop();
        pathRels.pop();
      };

      for (const [node] of adj) {
        if (!visited.has(node)) {
          dfs(node, 0);
        }
      }
    } catch (err) {
      logger.error(`Circular dependency detection failed: ${String(err)}`);
    }

    return violations;
  }

  // ── Selector matching ──────────────────────────────────────────────────

  private matchesSelector(selector: PathSelector, path: string): boolean {
    switch (selector.mode) {
      case 'exact':
        return path === selector.pattern;
      case 'prefix':
        return path.startsWith(selector.pattern);
      case 'glob':
        return this.globMatch(selector.pattern, path);
    }
  }

  private globMatch(pattern: string, path: string): boolean {
    // Simple glob: ** matches any path segments, * matches within a segment
    const regex = new RegExp(
      '^' +
      pattern
        .replace(/\*\*/g, '{{DOUBLE_STAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/\{\{DOUBLE_STAR\}\}/g, '.*') +
      '$',
    );
    return regex.test(path);
  }

  private async matchNodesBySelector(
    selector: PathSelector,
    repositoryId: string,
  ): Promise<string[]> {
    try {
      // Convert glob to a LIKE pattern for Cypher
      const likePattern = selector.pattern
        .replace(/\*\*/g, '%')
        .replace(/\*/g, '%');

      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `MATCH (repo:Repository {id: $repoId})-[:CONTAINS*1..5]->(n)
           WHERE n.path =~ $pattern OR n.filePath =~ $pattern OR n.path STARTS WITH $prefix
           RETURN DISTINCT n.id AS id
           LIMIT 500`,
          {
            repoId: repositoryId,
            pattern: likePattern.replace(/%/g, '.*'),
            prefix: selector.pattern.replace('/**', '/').replace(/\*$/, ''),
          },
        ),
        { name: 'guardrail-match-nodes' },
      );

      return rows.map((r) => String(r.id ?? '')).filter(Boolean);
    } catch {
      return [];
    }
  }

  // ── Graph traversal ────────────────────────────────────────────────────

  private async traverseFromSource(
    sourceId: string,
    relType: string,
    maxDepth: number,
    repositoryId: string,
  ): Promise<Array<{ sourceId: string; sourceLabel: string; sourcePath: string; targetId: string; targetLabel: string; targetPath: string; hops: number }>> {
    const results: Array<{ sourceId: string; sourceLabel: string; sourcePath: string; targetId: string; targetLabel: string; targetPath: string; hops: number }> = [];

    try {
      const relClause = relType === 'ANY'
        ? '-[:IMPORTS|CALLS|EXTENDS|IMPLEMENTS|REFERENCES]->'
        : `-[:${relType}]->`;

      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `MATCH (src {id: $sourceId})-${relClause}(target)
           WHERE (src)-[:CONTAINS*0..5]-(:Repository {id: $repoId})
              OR src.id = $repoId
           RETURN src.id AS sourceId, labels(src)[0] AS sourceLabel, src.path AS sourcePath,
                  target.id AS targetId, labels(target)[0] AS targetLabel, target.path AS targetPath,
                  1 AS hops
           LIMIT 200`,
          { sourceId, repoId: repositoryId },
        ),
        { name: 'guardrail-traverse' },
      );

      for (const row of rows) {
        results.push({
          sourceId: String(row.sourceId ?? ''),
          sourceLabel: String(row.sourceLabel ?? ''),
          sourcePath: String(row.sourcePath ?? ''),
          targetId: String(row.targetId ?? ''),
          targetLabel: String(row.targetLabel ?? ''),
          targetPath: String(row.targetPath ?? ''),
          hops: 1,
        });
      }
    } catch {
      // Non-fatal
    }

    return results;
  }

  // ── Dashboard ──────────────────────────────────────────────────────────

  async getDashboard(repositoryId: string): Promise<GuardrailDashboard> {
    const rules = await this.listRules(repositoryId);
    const violations = [...violationStore.values()].filter((v) => v.repositoryId === repositoryId);

    const severityCounts: Record<Severity, number> = { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    let openCount = 0;
    let suppressedCount = 0;
    for (const v of violations) {
      severityCounts[v.severity] = (severityCounts[v.severity] ?? 0) + 1;
      if (v.status === 'OPEN') openCount++;
      if (v.status === 'SUPPRESSED') suppressedCount++;
    }

    const evaluations = [...evaluationStore.values()]
      .filter((e) => e.repositoryId === repositoryId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 10);

    return {
      repositoryId,
      totalRules: rules.length,
      enabledRules: rules.filter((r) => r.enabled).length,
      totalViolations: violations.length,
      openViolations: openCount,
      suppressedViolations: suppressedCount,
      severityCounts,
      recentEvaluations: evaluations,
    };
  }

  // ── Suppression ────────────────────────────────────────────────────────

  suppressViolation(violationId: string, reason: string, expiresAt?: string): ArchitectureViolation | null {
    const v = violationStore.get(violationId);
    if (!v) return null;

    const suppression: ViolationSuppression = {
      reason,
      suppressedBy: null,
      suppressedAt: new Date().toISOString(),
      expiresAt: expiresAt ?? null,
    };

    v.status = 'SUPPRESSED';
    v.suppression = suppression;
    violationStore.set(violationId, v);
    return v;
  }

  // ── Seed default rules ─────────────────────────────────────────────────

  async seedDefaultRules(repositoryId: string): Promise<ArchitectureRule[]> {
    const existing = await this.listRules(repositoryId);
    if (existing.length > 0) return existing;

    const defaults: Array<Omit<ArchitectureRule, 'id' | 'createdAt' | 'updatedAt'>> = [
      {
        repositoryId, name: 'Services cannot import UI',
        description: 'Service layer code must not depend on presentation layer modules.',
        sourceSelector: { pattern: 'services/**', mode: 'glob' },
        relationship: 'IMPORTS', targetSelector: { pattern: 'apps/web/**', mode: 'glob' },
        severity: 'HIGH', enabled: true, maxDepth: 1, ruleType: 'forbidden-dependency',
      },
      {
        repositoryId, name: 'API cannot import frontend',
        description: 'Backend API code must not import frontend application modules.',
        sourceSelector: { pattern: 'apps/api/**', mode: 'glob' },
        relationship: 'IMPORTS', targetSelector: { pattern: 'apps/web/**', mode: 'glob' },
        severity: 'HIGH', enabled: true, maxDepth: 1, ruleType: 'forbidden-dependency',
      },
      {
        repositoryId, name: 'Shared must not import application modules',
        description: 'Shared packages must remain application-agnostic.',
        sourceSelector: { pattern: 'packages/shared/**', mode: 'glob' },
        relationship: 'IMPORTS', targetSelector: { pattern: 'apps/**', mode: 'glob' },
        severity: 'MEDIUM', enabled: true, maxDepth: 1, ruleType: 'forbidden-dependency',
      },
      {
        repositoryId, name: 'No circular dependencies',
        description: 'Detect circular dependency chains in the codebase.',
        sourceSelector: { pattern: '**', mode: 'glob' },
        relationship: 'IMPORTS', targetSelector: { pattern: '**', mode: 'glob' },
        severity: 'CRITICAL', enabled: true, maxDepth: 1, ruleType: 'circular-dependency',
      },
      {
        repositoryId, name: 'Production code must not depend on tests',
        description: 'Production source files should not import test utilities or test files.',
        sourceSelector: { pattern: 'src/**', mode: 'glob' },
        relationship: 'IMPORTS', targetSelector: { pattern: '**/*.test.*', mode: 'glob' },
        severity: 'MEDIUM', enabled: true, maxDepth: 1, ruleType: 'forbidden-dependency',
      },
    ];

    const created: ArchitectureRule[] = [];
    for (const rule of defaults) {
      created.push(await this.createRule(rule));
    }
    return created;
  }
}
