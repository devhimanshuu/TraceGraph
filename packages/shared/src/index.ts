/**
 * @tracegraph/shared — shared contracts between the Next.js frontend and the
 * NestJS backend.
 *
 * This package intentionally contains **types only** (no runtime code), so both
 * applications can consume it with zero build overhead. If runtime helpers are
 * ever needed here, add a build step (tsc → dist) before shipping them.
 */

// ── Graph model (Phase 1 §10) ─────────────────────────────────────────────────

export type NodeType =
  | 'Repository'
  | 'Directory'
  | 'File'
  | 'Function'
  | 'Class'
  | 'Test'
  | 'Commit'
  | 'PullRequest'
  | 'Issue'
  | 'Developer';

export type RelationshipType =
  | 'CONTAINS'
  | 'IMPORTS'
  | 'CALLS'
  | 'EXTENDS'
  | 'TESTS'
  | 'MODIFIES'
  | 'AUTHORED_BY'
  | 'RESOLVED_BY';

// ── Health ────────────────────────────────────────────────────────────────────

/** `GET /api/health` */
export interface AppHealth {
  status: 'ok';
  service: string;
  timestamp: string;
  version: string;
}

/** `GET /api/health/database` */
export interface DatabaseHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  /** Sanitized, human-readable reason. Never contains credentials or URIs. */
  error?: string;
}

// ── Errors ────────────────────────────────────────────────────────────────────

/** Standard error body returned by the API (see Phase 1 §18). */
export interface ApiError {
  statusCode: number;
  message: string | string[];
  code: string;
  timestamp: string;
  path?: string;
  details?: unknown;
}
