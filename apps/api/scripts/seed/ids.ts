/**
 * Stable-ID strategy (Phase 4 §7).
 *
 * Every node id is deterministic, readable, unique, and MERGE-friendly:
 *
 *   Repository  repo:commerce-platform
 *   Directory   dir:apps/api/services
 *   File        file:apps/api/services/payment.service.ts
 *   Function    fn:apps/api/services/payment.service.ts:processPayment
 *   Class       class:apps/api/services/payment.service.ts:PaymentService
 *   Test        test:apps/api/services/payment.service.spec.ts:processPayment.retries
 *   Commit      commit:8f21ac7
 *   PullRequest pr:421
 *   Issue       issue:912
 *   Developer   dev:alex
 *
 * Ids embed the file path where relevant, which keeps them unique across the
 * whole graph without a registry, and readable when surfaced in the UI.
 */

export const repoId = (name: string): string => `repo:${name}`;
export const dirId = (path: string): string => `dir:${path}`;
export const fileId = (path: string): string => `file:${path}`;
export const fnId = (filePath: string, name: string): string => `fn:${filePath}:${name}`;
export const classId = (filePath: string, name: string): string => `class:${filePath}:${name}`;
export const testId = (filePath: string, name: string): string => `test:${filePath}:${name}`;
export const commitId = (sha: string): string => `commit:${sha}`;
export const prId = (number: number): string => `pr:${number}`;
export const issueId = (number: number): string => `issue:${number}`;
export const devId = (username: string): string => `dev:${username}`;
