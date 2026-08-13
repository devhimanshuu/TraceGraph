/**
 * Engineering history — Developers, Commits, Pull Requests, Issues.
 *
 * Includes the demo-critical history path:
 *
 *   Issue #912 "Checkout occasionally times out"
 *     -[:RELATED_TO]-> PR #421 "Add payment retry handling"
 *       -[:CONTAINS]-> Commit 8f21ac7 "Add retry handling to payment flow"
 *         -[:MODIFIES]-> payment.service.ts
 *
 * All developers, SHAs, PRs, and issues are fictional demo data.
 */
import type { SeedNode, SeedRel } from '../types';
import { commitId, devId, fileId, issueId, prId } from '../ids';

export interface DevSpec {
  username: string;
  name: string;
  email: string;
  role: string;
}

export interface CommitSpec {
  sha: string;
  message: string;
  timestamp: string;
  branch: string;
  /** Username of the author (must exist in DEVELOPERS). */
  author: string;
  /** PR number this commit belongs to. */
  pr: number;
  /** File paths modified by this commit. */
  files: string[];
}

export interface PrSpec {
  number: number;
  title: string;
  status: 'merged' | 'open' | 'closed';
  createdAt: string;
  mergedAt?: string;
}

export interface IssueSpec {
  number: number;
  title: string;
  status: 'open' | 'closed';
  createdAt: string;
  /** PR number this issue is related to. */
  relatedPr: number;
}

export const DEVELOPERS: DevSpec[] = [
  { username: 'alex', name: 'Alex Morgan', email: 'alex@acme.dev', role: 'Backend Engineer' },
  { username: 'priya', name: 'Priya Shah', email: 'priya@acme.dev', role: 'Frontend Engineer' },
  { username: 'daniel', name: 'Daniel Kim', email: 'daniel@acme.dev', role: 'Platform Engineer' },
  { username: 'maya', name: 'Maya Patel', email: 'maya@acme.dev', role: 'SRE' },
  { username: 'ethan', name: 'Ethan Reed', email: 'ethan@acme.dev', role: 'Tech Lead' },
];

export const PULL_REQUESTS: PrSpec[] = [
  {
    number: 401,
    title: 'Add authentication flow',
    status: 'merged',
    createdAt: '2025-02-03T10:00:00.000Z',
    mergedAt: '2025-02-05T14:20:00.000Z',
  },
  {
    number: 408,
    title: 'User profile endpoints',
    status: 'merged',
    createdAt: '2025-02-12T09:30:00.000Z',
    mergedAt: '2025-02-14T16:45:00.000Z',
  },
  {
    number: 415,
    title: 'Order service with repository layer',
    status: 'merged',
    createdAt: '2025-02-24T11:15:00.000Z',
    mergedAt: '2025-02-27T15:10:00.000Z',
  },
  {
    number: 421,
    title: 'Add payment retry handling',
    status: 'merged',
    createdAt: '2025-03-05T08:45:00.000Z',
    mergedAt: '2025-03-08T17:30:00.000Z',
  },
  {
    number: 427,
    title: 'Optimize checkout timeout',
    status: 'merged',
    createdAt: '2025-03-15T13:20:00.000Z',
    mergedAt: '2025-03-18T10:05:00.000Z',
  },
  {
    number: 433,
    title: 'Refund flow improvements',
    status: 'merged',
    createdAt: '2025-03-28T10:40:00.000Z',
    mergedAt: '2025-04-01T12:25:00.000Z',
  },
  {
    number: 438,
    title: 'Notification service',
    status: 'merged',
    createdAt: '2025-04-10T14:50:00.000Z',
    mergedAt: '2025-04-13T09:15:00.000Z',
  },
  {
    number: 444,
    title: 'Stripe webhook signature validation',
    status: 'open',
    createdAt: '2025-04-22T16:00:00.000Z',
  },
  {
    number: 450,
    title: 'Database migration tooling',
    status: 'merged',
    createdAt: '2025-05-06T09:10:00.000Z',
    mergedAt: '2025-05-09T14:35:00.000Z',
  },
  {
    number: 455,
    title: 'Shared types package',
    status: 'merged',
    createdAt: '2025-05-15T11:25:00.000Z',
    mergedAt: '2025-05-18T15:40:00.000Z',
  },
  {
    number: 461,
    title: 'Web checkout page',
    status: 'open',
    createdAt: '2025-05-28T10:05:00.000Z',
  },
];

export const COMMITS: CommitSpec[] = [
  {
    sha: '3f0a9b2',
    message: 'Add login endpoint',
    timestamp: '2025-02-03T10:00:00.000Z',
    branch: 'main',
    author: 'alex',
    pr: 401,
    files: ['apps/api/controllers/auth.controller.ts'],
  },
  {
    sha: '7c1e5d4',
    message: 'Add token service',
    timestamp: '2025-02-04T09:20:00.000Z',
    branch: 'main',
    author: 'alex',
    pr: 401,
    files: ['lib/token.service.ts', 'apps/api/services/auth.service.ts'],
  },
  {
    sha: '9b2d7f1',
    message: 'Add user profile endpoints',
    timestamp: '2025-02-12T09:30:00.000Z',
    branch: 'main',
    author: 'priya',
    pr: 408,
    files: ['apps/api/controllers/user.controller.ts', 'apps/api/services/user.service.ts'],
  },
  {
    sha: '1a4c8e6',
    message: 'Wire user repository',
    timestamp: '2025-02-13T11:45:00.000Z',
    branch: 'main',
    author: 'priya',
    pr: 408,
    files: ['apps/api/repositories/user.repository.ts'],
  },
  {
    sha: '5d3a0c8',
    message: 'Add order service',
    timestamp: '2025-02-24T11:15:00.000Z',
    branch: 'main',
    author: 'alex',
    pr: 415,
    files: ['apps/api/services/order.service.ts'],
  },
  {
    sha: '2b6e1a4',
    message: 'Add order repository',
    timestamp: '2025-02-25T10:30:00.000Z',
    branch: 'main',
    author: 'alex',
    pr: 415,
    files: ['apps/api/repositories/order.repository.ts'],
  },
  {
    sha: '8e9f2b3',
    message: 'Expose order endpoints',
    timestamp: '2025-02-26T14:00:00.000Z',
    branch: 'main',
    author: 'alex',
    pr: 415,
    files: ['apps/api/controllers/order.controller.ts'],
  },
  // ★ PR #421 — the demo-critical commit
  {
    sha: '8f21ac7',
    message: 'Add retry handling to payment flow',
    timestamp: '2025-03-05T08:45:00.000Z',
    branch: 'main',
    author: 'alex',
    pr: 421,
    files: ['apps/api/services/payment.service.ts'],
  },
  {
    sha: '4d0c7e2',
    message: 'Add retry test coverage',
    timestamp: '2025-03-06T13:10:00.000Z',
    branch: 'main',
    author: 'alex',
    pr: 421,
    files: ['apps/api/services/payment.service.spec.ts'],
  },
  {
    sha: '6b3f9a1',
    message: 'Reduce checkout timeout window',
    timestamp: '2025-03-15T13:20:00.000Z',
    branch: 'main',
    author: 'daniel',
    pr: 427,
    files: ['apps/api/services/checkout.service.ts'],
  },
  {
    sha: '0e5a2c9',
    message: 'Surface timeout errors clearly',
    timestamp: '2025-03-16T09:50:00.000Z',
    branch: 'main',
    author: 'daniel',
    pr: 427,
    files: ['apps/api/controllers/checkout.controller.ts', 'packages/shared/errors.ts'],
  },
  {
    sha: '7f1e8b4',
    message: 'Add refund service',
    timestamp: '2025-03-28T10:40:00.000Z',
    branch: 'main',
    author: 'maya',
    pr: 433,
    files: ['apps/api/services/refund.service.ts'],
  },
  {
    sha: '3c9d0a6',
    message: 'Wire refund endpoint',
    timestamp: '2025-03-30T15:25:00.000Z',
    branch: 'main',
    author: 'maya',
    pr: 433,
    files: ['apps/api/controllers/payment.controller.ts'],
  },
  {
    sha: 'a2b4f8d',
    message: 'Add notification service',
    timestamp: '2025-04-10T14:50:00.000Z',
    branch: 'main',
    author: 'priya',
    pr: 438,
    files: ['apps/api/services/notification.service.ts'],
  },
  {
    sha: '5e7c1b9',
    message: 'Add notification endpoint',
    timestamp: '2025-04-11T10:15:00.000Z',
    branch: 'main',
    author: 'priya',
    pr: 438,
    files: ['apps/api/controllers/notification.controller.ts'],
  },
  {
    sha: 'd8f3a6e',
    message: 'Validate webhook signatures',
    timestamp: '2025-04-22T16:00:00.000Z',
    branch: 'main',
    author: 'daniel',
    pr: 444,
    files: ['apps/api/services/payment.service.ts', 'lib/stripe.client.ts'],
  },
  {
    sha: '2a6c0f4',
    message: 'Handle duplicate webhook events',
    timestamp: '2025-04-23T12:30:00.000Z',
    branch: 'main',
    author: 'daniel',
    pr: 444,
    files: ['apps/api/services/payment.service.ts'],
  },
  {
    sha: '9c4e7d2',
    message: 'Add migration runner',
    timestamp: '2025-05-06T09:10:00.000Z',
    branch: 'main',
    author: 'ethan',
    pr: 450,
    files: ['packages/database/migrations.ts'],
  },
  {
    sha: '6f0b8e5',
    message: 'Add health check query',
    timestamp: '2025-05-07T13:40:00.000Z',
    branch: 'main',
    author: 'ethan',
    pr: 450,
    files: ['packages/database/database.service.ts'],
  },
  {
    sha: '1e7d3a8',
    message: 'Document migrations',
    timestamp: '2025-05-08T10:20:00.000Z',
    branch: 'main',
    author: 'ethan',
    pr: 450,
    files: ['packages/database/migrations.ts'],
  },
  {
    sha: '4b8f2c6',
    message: 'Extract shared types',
    timestamp: '2025-05-15T11:25:00.000Z',
    branch: 'main',
    author: 'priya',
    pr: 455,
    files: ['packages/shared/types.ts'],
  },
  {
    sha: '0c6a9e3',
    message: 'Add shared error classes',
    timestamp: '2025-05-16T09:55:00.000Z',
    branch: 'main',
    author: 'priya',
    pr: 455,
    files: ['packages/shared/errors.ts'],
  },
  {
    sha: '8a3e5f1',
    message: 'Add checkout page',
    timestamp: '2025-05-28T10:05:00.000Z',
    branch: 'main',
    author: 'priya',
    pr: 461,
    files: ['apps/web/checkout.page.tsx'],
  },
  {
    sha: '5f9b1d7',
    message: 'Add order page',
    timestamp: '2025-05-29T14:35:00.000Z',
    branch: 'main',
    author: 'priya',
    pr: 461,
    files: ['apps/web/order.page.tsx'],
  },
];

export const ISSUES: IssueSpec[] = [
  {
    number: 880,
    title: 'Login tokens expire too quickly',
    status: 'closed',
    createdAt: '2025-01-28T09:00:00.000Z',
    relatedPr: 401,
  },
  {
    number: 891,
    title: 'User profile picture not updating',
    status: 'closed',
    createdAt: '2025-02-08T13:30:00.000Z',
    relatedPr: 408,
  },
  // ★ Issue #912 — the demo-critical issue
  {
    number: 912,
    title: 'Checkout occasionally times out',
    status: 'closed',
    createdAt: '2025-02-20T10:15:00.000Z',
    relatedPr: 421,
  },
  {
    number: 921,
    title: 'Checkout timeout error message unclear',
    status: 'closed',
    createdAt: '2025-03-10T15:45:00.000Z',
    relatedPr: 427,
  },
  {
    number: 930,
    title: 'Duplicate payment attempt after retry',
    status: 'open',
    createdAt: '2025-04-15T11:20:00.000Z',
    relatedPr: 444,
  },
  {
    number: 941,
    title: 'Refund flow fails after payment timeout',
    status: 'closed',
    createdAt: '2025-03-22T09:40:00.000Z',
    relatedPr: 433,
  },
  {
    number: 950,
    title: 'Notification emails delayed',
    status: 'open',
    createdAt: '2025-04-18T14:10:00.000Z',
    relatedPr: 438,
  },
  {
    number: 958,
    title: 'Migrations fail on fresh installs',
    status: 'closed',
    createdAt: '2025-04-28T10:05:00.000Z',
    relatedPr: 450,
  },
  {
    number: 964,
    title: 'Order list pagination broken',
    status: 'open',
    createdAt: '2025-05-20T16:25:00.000Z',
    relatedPr: 455,
  },
];

export const developerNodes = (): SeedNode[] =>
  DEVELOPERS.map((d) => ({
    label: 'Developer' as const,
    props: {
      id: devId(d.username),
      username: d.username,
      name: d.name,
      email: d.email,
      role: d.role,
    },
  }));

export const commitNodes = (): SeedNode[] =>
  COMMITS.map((c) => ({
    label: 'Commit' as const,
    props: {
      id: commitId(c.sha),
      sha: c.sha,
      message: c.message,
      timestamp: c.timestamp,
      branch: c.branch,
    },
  }));

export const pullRequestNodes = (): SeedNode[] =>
  PULL_REQUESTS.map((pr) => ({
    label: 'PullRequest' as const,
    props: {
      id: prId(pr.number),
      number: pr.number,
      title: pr.title,
      status: pr.status,
      createdAt: pr.createdAt,
      ...(pr.mergedAt ? { mergedAt: pr.mergedAt } : {}),
    },
  }));

export const issueNodes = (): SeedNode[] =>
  ISSUES.map((i) => ({
    label: 'Issue' as const,
    props: {
      id: issueId(i.number),
      number: i.number,
      title: i.title,
      status: i.status,
      createdAt: i.createdAt,
    },
  }));

/** Commit MODIFIES File; Commit AUTHORED_BY Developer; PR CONTAINS Commit; Issue RELATED_TO PR. */
export const historyRels = (): SeedRel[] => {
  const rels: SeedRel[] = [];
  for (const c of COMMITS) {
    for (const file of c.files) {
      rels.push({
        type: 'MODIFIES',
        fromLabel: 'Commit',
        toLabel: 'File',
        from: commitId(c.sha),
        to: fileId(file),
      });
    }
    rels.push({
      type: 'AUTHORED_BY',
      fromLabel: 'Commit',
      toLabel: 'Developer',
      from: commitId(c.sha),
      to: devId(c.author),
    });
    rels.push({
      type: 'CONTAINS',
      fromLabel: 'PullRequest',
      toLabel: 'Commit',
      from: prId(c.pr),
      to: commitId(c.sha),
    });
  }
  for (const i of ISSUES) {
    rels.push({
      type: 'RELATED_TO',
      fromLabel: 'Issue',
      toLabel: 'PullRequest',
      from: issueId(i.number),
      to: prId(i.relatedPr),
    });
  }
  return rels;
};
