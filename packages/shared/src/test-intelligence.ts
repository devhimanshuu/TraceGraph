/**
 * @tracegraph/shared — Test Intelligence types (Phase 17)
 *
 * Models for test discovery, test-to-code mapping, test execution history,
 * flakiness metrics, intelligent test selection, and recommendation scoring.
 */

// ── Test definition ─────────────────────────────────────────────────────────

export type TestFramework =
  | 'jest'
  | 'vitest'
  | 'mocha'
  | 'jasmine'
  | 'pytest'
  | 'unittest'
  | 'go-test'
  | 'junit'
  | 'xunit'
  | 'nunit'
  | 'dotnet-test'
  | 'cargo-test'
  | 'unknown';

export type TestType = 'unit' | 'integration' | 'e2e' | 'component' | 'unknown';

export type TestResolutionStatus = 'resolved' | 'partial' | 'unresolved';

export interface TestDefinition {
  id: string;
  name: string;
  filePath: string;
  framework: TestFramework;
  testType: TestType;
  /** Line range in the source file. */
  lineStart: number;
  lineEnd: number;
  /** The symbol(s) this test targets, if resolved. */
  targetSymbolIds: string[];
  /** Structural resolution quality. */
  resolutionStatus: TestResolutionStatus;
}

// ── Test execution ──────────────────────────────────────────────────────────

export type TestRunStatus = 'passed' | 'failed' | 'skipped' | 'cancelled' | 'unknown';

export interface TestExecution {
  id: string;
  testId: string;
  repositoryId: string;
  revision: string;
  status: TestRunStatus;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  failureMessage: string | null;
}

// ── Test metrics (materialized summary) ─────────────────────────────────────

export interface TestMetrics {
  testId: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  skippedRuns: number;
  avgDurationMs: number;
  passRate: number;
  /** 0–1 observed flakiness rate (see Flakiness Algorithm doc). */
  flakinessRate: number;
  lastRunAt: string | null;
  lastRunStatus: TestRunStatus | null;
}

// ── Test recommendation ─────────────────────────────────────────────────────

export type TestPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface TestRecommendationSignal {
  /** Human-readable signal name. */
  signal: string;
  /** Numeric weight contribution to the score. */
  weight: number;
  /** Detailed explanation of why this signal fired. */
  detail: string;
}

export interface TestRecommendation {
  testId: string;
  testName: string;
  filePath: string;
  framework: TestFramework;
  priority: TestPriority;
  /** Composite score (higher = more relevant). */
  score: number;
  /** Breakdown of scoring signals. */
  signals: TestRecommendationSignal[];
  /** How many hops from changed code to this test's target. */
  distance: number;
  /** Estimated duration from historical data (null if unknown). */
  estimatedDurationMs: number | null;
  /** Flakiness rate (null if unknown). */
  flakinessRate: number | null;
}

// ── Test selection request/response ──────────────────────────────────────────

export interface TestSelectionRequest {
  /** Changed file paths (repo-relative). */
  changedFiles: string[];
  /** Changed symbol IDs, if known. */
  changedSymbolIds?: string[];
  /** Repository ID. */
  repositoryId: string;
}

export interface TestSelectionResponse {
  repositoryId: string;
  revision: string | null;
  /** Tests recommended to run, ranked by priority. */
  recommendations: TestRecommendation[];
  /** Total tests in the repository. */
  totalTests: number;
  /** Tests with known execution history. */
  testsWithHistory: number;
  /** Estimated total duration of recommended tests (ms). */
  estimatedDurationMs: number | null;
  /** Estimated duration of full suite (ms). */
  fullSuiteDurationMs: number | null;
  /** Reduction percentage (null if unknown). */
  reductionPercent: number | null;
  /** Framework command to run recommended tests locally. */
  runCommand: string | null;
  /** Machine-readable output for CI. */
  ciOutput: {
    repository: string;
    revision: string | null;
    recommendedTests: string[];
  };
}

// ── Test intelligence page ──────────────────────────────────────────────────

export interface TestIntelligenceOverview {
  repositoryId: string;
  totalTests: number;
  totalTestFiles: number;
  frameworks: Array<{ framework: TestFramework; count: number }>;
  testTypes: Array<{ type: TestType; count: number }>;
  avgSuiteDurationMs: number | null;
  flakyTests: number;
  /** Tests with resolved targets. */
  resolvedTests: number;
  /** Tests with unresolved targets. */
  unresolvedTests: number;
}

export interface TestDetail {
  id: string;
  name: string;
  filePath: string;
  framework: TestFramework;
  testType: TestType;
  lineStart: number;
  lineEnd: number;
  resolutionStatus: TestResolutionStatus;
  targetSymbolIds: string[];
  metrics: TestMetrics | null;
}

export interface TestHistoryEntry {
  executionId: string;
  revision: string;
  status: TestRunStatus;
  durationMs: number;
  startedAt: string;
  failureMessage: string | null;
}
