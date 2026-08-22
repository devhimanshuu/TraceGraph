/**
 * TestSelectionService — deterministic, explainable test selection engine.
 *
 * Scoring model:
 *   Direct test match (TESTS edge)                              +50
 *   File-level match (test in same file)                        +40
 *   Graph distance 1 (direct dependent target)                 +20
 *   Graph distance 2 (indirect dependent target)               +10
 *   Historical association (has past failures)                  +10
 *   High flakiness penalty (rate > 0.3)                        -10
 */
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  TestRecommendation,
  TestRecommendationSignal,
  TestPriority,
  TestSelectionRequest,
  TestSelectionResponse,
  TestMetrics,
  TestFramework,
} from '@tracegraph/shared';

const logger = new Logger('TestSelectionService');

/** Internal raw test from DB queries. */
interface RawTest {
  id: string;
  name: string;
  filePath: string;
  framework: string;
  resolutionStatus?: string;
}

const SCORE_DIRECT = 50;
const SCORE_FILE = 40;
const SCORE_DIST1 = 20;
const SCORE_DIST2 = 10;
const SCORE_HIST = 10;
const PENALTY_FLAKY = 10;
const FLAKY_THRESHOLD = 0.3;

@Injectable()
export class TestSelectionService {
  constructor(private readonly db: DatabaseService) {}

  async selectTests(req: TestSelectionRequest): Promise<TestSelectionResponse> {
    const { changedFiles, changedSymbolIds, repositoryId } = req;

    const allTests = await this.findAllTests(repositoryId);
    const directTests = await this.findDirectTests(changedFiles, changedSymbolIds);
    const indirectTests = await this.findIndirectTests(changedFiles, changedSymbolIds);

    const candidateIds = new Set([
      ...directTests.map((d) => d.testId),
      ...indirectTests.map((i) => i.testId),
    ]);

    const candidates = candidateIds.size > 0
      ? allTests.filter((t) => candidateIds.has(t.id))
      : allTests;

    const metricsMap = await this.getMetricsForTests(candidates.map((t) => t.id));

    const scored: TestRecommendation[] = candidates.map((test) => {
      const signals: TestRecommendationSignal[] = [];
      let score = 0;

      const directMatch = directTests.find((d) => d.testId === test.id);
      if (directMatch) {
        score += SCORE_DIRECT;
        signals.push({ signal: 'Direct test relationship', weight: SCORE_DIRECT, detail: `Directly tests ${directMatch.targetLabel}` });
      }

      const isFileMatch = changedFiles.some((f) => test.filePath === f || test.filePath.replace(/\.(spec|test)\./, '.') === f);
      if (isFileMatch) {
        score += SCORE_FILE;
        signals.push({ signal: 'File-level match', weight: SCORE_FILE, detail: 'Test file matches a changed source file' });
      }

      const indirectMatch = indirectTests.find((i) => i.testId === test.id);
      if (indirectMatch) {
        const ds = indirectMatch.distance === 1 ? SCORE_DIST1 : SCORE_DIST2;
        score += ds;
        signals.push({ signal: `Graph distance ${indirectMatch.distance}`, weight: ds, detail: `Targets ${indirectMatch.targetLabel} (${indirectMatch.distance} hop${indirectMatch.distance > 1 ? 's' : ''})` });
      }

      const metrics = metricsMap.get(test.id);
      if (metrics && metrics.totalRuns >= 5 && metrics.failedRuns > 0 && metrics.passRate < 0.95) {
        score += SCORE_HIST;
        signals.push({ signal: 'Historical association', weight: SCORE_HIST, detail: `${metrics.failedRuns} historical failure(s)` });
      }

      if (metrics && metrics.flakinessRate > FLAKY_THRESHOLD) {
        score -= PENALTY_FLAKY;
        signals.push({ signal: 'Flakiness penalty', weight: -PENALTY_FLAKY, detail: `Flakiness: ${(metrics.flakinessRate * 100).toFixed(1)}%` });
      }

      const priority: TestPriority = score >= SCORE_DIRECT ? 'HIGH' : score >= SCORE_DIST1 ? 'MEDIUM' : 'LOW';

      return {
        testId: test.id,
        testName: test.name,
        filePath: test.filePath,
        framework: (test.framework ?? 'unknown') as TestFramework,
        priority,
        score,
        signals,
        distance: indirectMatch?.distance ?? (directMatch ? 0 : 99),
        estimatedDurationMs: metrics?.avgDurationMs ?? null,
        flakinessRate: metrics?.flakinessRate ?? null,
      };
    });

    scored.sort((a, b) => b.score - a.score || a.distance - b.distance);

    const totalTests = allTests.length;
    const testsWithHistory = [...metricsMap.values()].filter((m) => m.totalRuns > 0).length;
    const estimatedDurationMs = scored.reduce((s, t) => s + (t.estimatedDurationMs ?? 0), 0);
    const fullSuiteDurationMs = allTests.reduce((s, t) => s + (metricsMap.get(t.id)?.avgDurationMs ?? 0), 0);
    const reductionPercent = totalTests > 0 ? ((totalTests - scored.length) / totalTests) * 100 : null;
    const runCommand = this.generateRunCommand(scored);

    const activeRepo = await this.getActiveRepo(repositoryId);

    return {
      repositoryId,
      revision: null,
      recommendations: scored,
      totalTests,
      testsWithHistory,
      estimatedDurationMs: estimatedDurationMs > 0 ? estimatedDurationMs : null,
      fullSuiteDurationMs: fullSuiteDurationMs > 0 ? fullSuiteDurationMs : null,
      reductionPercent,
      runCommand,
      ciOutput: { repository: activeRepo?.name ?? repositoryId, revision: null, recommendedTests: scored.map((t) => t.filePath) },
    };
  }

  async getOverview(repositoryId: string) {
    const allTests = await this.findAllTests(repositoryId);
    const metricsMap = await this.getMetricsForTests(allTests.map((t) => t.id));

    const frameworkCounts = new Map<string, number>();
    for (const t of allTests) {
      frameworkCounts.set(t.framework, (frameworkCounts.get(t.framework) ?? 0) + 1);
    }

    const resolvedTests = allTests.filter((t) => t.resolutionStatus === 'resolved').length;
    const flakyTests = [...metricsMap.values()].filter((m) => m.flakinessRate > FLAKY_THRESHOLD).length;
    const durations = allTests.map((t) => metricsMap.get(t.id)?.avgDurationMs).filter((d): d is number => d != null && d > 0);
    const avgSuiteDurationMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) : null;

    return {
      totalTests: allTests.length,
      totalTestFiles: new Set(allTests.map((t) => t.filePath)).size,
      frameworks: [...frameworkCounts.entries()].map(([framework, count]) => ({ framework: framework as TestFramework, count })),
      testTypes: [] as Array<{ type: import('@tracegraph/shared').TestType; count: number }>,
      avgSuiteDurationMs,
      flakyTests,
      resolvedTests,
      unresolvedTests: allTests.length - resolvedTests,
    };
  }

  // ── DB helpers ────────────────────────────────────────────────────────

  private async findAllTests(repositoryId: string): Promise<RawTest[]> {
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `MATCH (repo:Repository {id: $repoId})-[:CONTAINS*1..5]->(f:File)-[:CONTAINS]->(t:Test)
           RETURN t.id AS id, t.name AS name, t.filePath AS filePath, t.framework AS framework
           LIMIT 5000`,
          { repositoryId },
        ),
        { name: 'find-all-tests' },
      );
      return rows.map((r) => ({
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        filePath: String(r.filePath ?? ''),
        framework: String(r.framework ?? 'unknown'),
      }));
    } catch { return []; }
  }

  private async findDirectTests(
    changedFiles: string[],
    symbolIds?: string[],
  ): Promise<Array<{ testId: string; targetLabel: string }>> {
    const results: Array<{ testId: string; targetLabel: string }> = [];
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `UNWIND $fileIds AS fileId
           MATCH (t:Test)-[:TESTS]->(target)
           WHERE (target)<-[:CONTAINS]-(:File {id: fileId})
              OR target.id IN $symbolIds
           RETURN DISTINCT t.id AS testId, target.name AS targetName
           LIMIT 200`,
          { fileIds: changedFiles.map((f) => `file:${f}`), symbolIds: symbolIds ?? [] },
        ),
        { name: 'find-direct-tests' },
      );
      for (const r of rows) {
        results.push({ testId: String(r.testId ?? ''), targetLabel: String(r.targetName ?? '') });
      }
    } catch { /* Non-fatal */ }

    // Same-file tests
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `UNWIND $fileIds AS fileId
           MATCH (f:File {id: fileId})-[:CONTAINS]->(t:Test)
           RETURN DISTINCT t.id AS testId`,
          { fileIds: changedFiles.map((f) => `file:${f}`) },
        ),
        { name: 'find-same-file-tests' },
      );
      for (const r of rows) {
        const id = String(r.testId ?? '');
        if (id && !results.some((x) => x.testId === id)) {
          results.push({ testId: id, targetLabel: 'same file' });
        }
      }
    } catch { /* Non-fatal */ }

    return results;
  }

  private async findIndirectTests(
    changedFiles: string[],
    symbolIds?: string[],
  ): Promise<Array<{ testId: string; targetLabel: string; distance: number }>> {
    const results: Array<{ testId: string; targetLabel: string; distance: number }> = [];
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(
          `UNWIND $fileIds AS fileId
           MATCH (changed:File {id: fileId})-[:CONTAINS]->(sym)
           MATCH (sym)-[:CALLS*1..2]->(downstream)
           MATCH (t:Test)-[:TESTS]->(downstream)
           WHERE NOT (t)-[:TESTS]->(sym)
           RETURN DISTINCT t.id AS testId, downstream.name AS targetName,
                  length(shortestPath((sym)-[:CALLS*1..2]->(downstream))) AS dist
           LIMIT 200`,
          { fileIds: changedFiles.map((f) => `file:${f}`) },
        ),
        { name: 'find-indirect-tests' },
      );
      for (const r of rows) {
        const dist = typeof r.dist === 'object' && r.dist !== null && 'low' in r.dist
          ? (r.dist as { low: number }).low : Number(r.dist ?? 1);
        results.push({ testId: String(r.testId ?? ''), targetLabel: String(r.targetName ?? ''), distance: dist });
      }
    } catch { /* Non-fatal */ }
    return results;
  }

  private async getMetricsForTests(testIds: string[]): Promise<Map<string, TestMetrics>> {
    const map = new Map<string, TestMetrics>();
    for (const id of testIds) {
      map.set(id, {
        testId: id, totalRuns: 0, passedRuns: 0, failedRuns: 0, skippedRuns: 0,
        avgDurationMs: 0, passRate: 0, flakinessRate: 0, lastRunAt: null, lastRunStatus: null,
      });
    }
    return map;
  }

  private generateRunCommand(tests: TestRecommendation[]): string | null {
    if (tests.length === 0) return null;
    const files = tests.map((t) => t.filePath);
    const fws = new Set(tests.map((t) => t.framework));
    if (fws.has('jest') || fws.has('vitest')) {
      return `npx ${fws.has('vitest') ? 'vitest' : 'jest'} ${files.join(' ')}`;
    }
    if (fws.has('pytest')) return `pytest ${files.join(' ')}`;
    if (fws.has('go-test')) return `go test ${files.join(' ')}`;
    return `# Run these ${tests.length} test files:\n${files.map((f) => `# ${f}`).join('\n')}`;
  }

  private async getActiveRepo(repoId: string): Promise<{ name: string } | null> {
    try {
      const rows = await this.db.executeRead<Array<Record<string, unknown>>>(
        (tx) => tx.run(`MATCH (r:Repository {id: $repoId}) RETURN r.name AS name`, { repoId }),
        { name: 'get-active-repo' },
      );
      return rows.length > 0 ? { name: String(rows[0].name ?? '') } : null;
    } catch { return null; }
  }
}
