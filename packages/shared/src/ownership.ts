/**
 * @tracegraph/shared — Ownership Intelligence types (Phase 19)
 *
 * Models for contribution signals, ownership scoring, expertise profiles,
 * and the "who should I ask?" feature.
 */

// ── Ownership signals ───────────────────────────────────────────────────────

export type SignalType =
  | 'COMMIT'
  | 'RECENT_COMMIT'
  | 'LINES_CHANGED'
  | 'PR_AUTHOR'
  | 'PR_REVIEW'
  | 'REVIEW_COMMENT'
  | 'TEST_CONTRIBUTION'
  | 'CODEOWNER';

export interface OwnershipSignal {
  developerId: string;
  developerName: string;
  developerUsername: string;
  entityId: string;
  signalType: SignalType;
  weight: number;
  observedAt: string;
  source: string;
}

// ── Ownership candidate ─────────────────────────────────────────────────────

export type OwnershipConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface OwnershipEvidence {
  signal: SignalType;
  label: string;
  count: number;
  detail: string;
}

export interface OwnershipCandidate {
  developer: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
  };
  /** Composite ownership score (higher = more relevant). */
  score: number;
  rank: number;
  confidence: OwnershipConfidence;
  /** Breakdown of evidence signals. */
  evidence: OwnershipEvidence[];
  /** Most recent contribution timestamp. */
  lastActiveAt: string | null;
  /** Number of relevant commits. */
  commitCount: number;
  /** Number of relevant PR reviews. */
  reviewCount: number;
  /** Number of related test contributions. */
  testContributions: number;
}

// ── Ownership result ────────────────────────────────────────────────────────

export interface OwnershipResult {
  entityId: string;
  entityLabel: string;
  entityType: string;
  /** Ranked ownership candidates. */
  candidates: OwnershipCandidate[];
  /** Total contributors found. */
  totalContributors: number;
  /** Repository revision this was calculated for. */
  revision: string | null;
  /** Timestamp of calculation. */
  calculatedAt: string;
  /** Explicit CODEOWNERS owners, if present. */
  codeowners: Array<{ name: string; path: string }>;
}

// ── Ownership overview ──────────────────────────────────────────────────────

export interface OwnershipArea {
  entityId: string;
  label: string;
  path: string;
  topContributor: {
    name: string;
    username: string;
    score: number;
  } | null;
  contributorCount: number;
  singleContributor: boolean;
  staleExpertise: boolean;
}

export interface OwnershipOverview {
  repositoryId: string;
  areas: OwnershipArea[];
  /** Areas with unclear ownership. */
  unclearAreas: OwnershipArea[];
  /** Areas with single contributor. */
  singleContributorAreas: OwnershipArea[];
  /** Health metrics. */
  health: {
    totalAreas: number;
    wellCovered: number;
    singleContributor: number;
    unclear: number;
  };
}

// ── Developer expertise ─────────────────────────────────────────────────────

export interface DeveloperExpertise {
  developerId: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  /** Primary areas of expertise. */
  primaryAreas: string[];
  /** Recent contribution count. */
  recentContributions: number;
  /** Total PR reviews. */
  totalReviews: number;
  /** Total test contributions. */
  totalTestContributions: number;
  /** Most active entities. */
  mostActiveEntities: Array<{
    entityId: string;
    label: string;
    contributions: number;
  }>;
  /** Last active timestamp. */
  lastActiveAt: string | null;
}
