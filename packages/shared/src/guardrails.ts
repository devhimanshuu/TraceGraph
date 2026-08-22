/**
 * @tracegraph/shared — Architecture Guardrails types (Phase 18)
 *
 * Models for architecture rules, selectors, violations, evaluations,
 * and the policy enforcement engine.
 */

// ── Selector model ──────────────────────────────────────────────────────────

export type SelectorMode = 'glob' | 'exact' | 'prefix';

export interface PathSelector {
  /** Wildcard pattern, e.g. "services/payments/**". */
  pattern: string;
  mode: SelectorMode;
}

export type NodeTypeSelector =
  | 'File'
  | 'Function'
  | 'Class'
  | 'Test'
  | 'Interface'
  | 'Enum'
  | 'Module'
  | 'Directory';

export type RelationshipSelector =
  | 'IMPORTS'
  | 'CALLS'
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'REFERENCES'
  | 'TESTS'
  | 'CONTAINS'
  | 'ANY';

export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ── Architecture rule ───────────────────────────────────────────────────────

export interface ArchitectureRule {
  id: string;
  repositoryId: string;
  name: string;
  description: string;
  /** What entity paths/types trigger this rule. */
  sourceSelector: PathSelector;
  /** Which graph relationship to check. */
  relationship: RelationshipSelector;
  /** What entity paths/types the source must not reach. */
  targetSelector: PathSelector;
  /** Severity of violations. */
  severity: Severity;
  /** Whether this rule is active. */
  enabled: boolean;
  /** Optional max traversal depth (default 1). */
  maxDepth: number;
  /** Special rule type override (null = standard forbidden-dependency). */
  ruleType: RuleType | null;
  createdAt: string;
  updatedAt: string;
}

export type RuleType =
  | 'forbidden-dependency'
  | 'circular-dependency'
  | 'layering'
  | 'test-isolation';

// ── Violation ───────────────────────────────────────────────────────────────

export type ViolationStatus = 'OPEN' | 'SUPPRESSED' | 'RESOLVED';

export interface ViolationSuppression {
  reason: string;
  suppressedBy: string | null;
  suppressedAt: string;
  expiresAt: string | null;
}

export interface ArchitectureViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  repositoryId: string;
  revision: string | null;
  /** Source entity that triggered the violation. */
  sourceNode: { id: string; label: string; path: string };
  /** The relationship type that was traversed. */
  relationship: string;
  /** Target entity that was reached. */
  targetNode: { id: string; label: string; path: string };
  /** Full path of the violation (for multi-hop). */
  path: Array<{ id: string; label: string; relationship: string }>;
  severity: Severity;
  status: ViolationStatus;
  suppression: ViolationSuppression | null;
  detectedAt: string;
}

// ── Evaluation ──────────────────────────────────────────────────────────────

export type EvaluationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface GuardrailEvaluation {
  id: string;
  repositoryId: string;
  revision: string | null;
  startedAt: string;
  completedAt: string | null;
  status: EvaluationStatus;
  rulesChecked: number;
  violationsFound: number;
  /** Count by severity. */
  severityCounts: Record<Severity, number>;
}

export interface EvaluationRequest {
  repositoryId: string;
  ruleIds?: string[];
  revision?: string;
}

export interface EvaluationResponse {
  evaluation: GuardrailEvaluation;
  violations: ArchitectureViolation[];
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export interface GuardrailDashboard {
  repositoryId: string;
  totalRules: number;
  enabledRules: number;
  totalViolations: number;
  openViolations: number;
  suppressedViolations: number;
  /** Count by severity. */
  severityCounts: Record<Severity, number>;
  /** Recent evaluations. */
  recentEvaluations: GuardrailEvaluation[];
}
