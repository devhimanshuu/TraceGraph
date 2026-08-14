import type { ImpactResponse } from '@tracegraph/shared';
import { EvidenceBuilder, truncateText } from './evidence-builder';
import {
  MAX_EVIDENCE_COMMITS,
  MAX_EVIDENCE_ISSUES,
  MAX_EVIDENCE_PATHS,
  MAX_EVIDENCE_PULL_REQUESTS,
  MAX_EVIDENCE_TESTS,
} from '../ai.constants';

const PAYMENT = { id: 'class:payment.service.ts:PaymentService', type: 'Class' as const, label: 'PaymentService' };
const CHECKOUT = { id: 'class:checkout.service.ts:CheckoutService', type: 'Class' as const, label: 'CheckoutService' };
const ORDER = { id: 'class:order.service.ts:OrderService', type: 'Class' as const, label: 'OrderService' };

function baseResponse(): ImpactResponse {
  return {
    root: PAYMENT,
    depth: 2,
    summary: {
      direct: 1,
      indirect: 1,
      tests: 1,
      commits: 1,
      pullRequests: 1,
      issues: 1,
      maxDepth: 2,
      score: 'HIGH',
      scoreReasons: [],
    },
    directImpact: [
      {
        id: CHECKOUT.id,
        type: CHECKOUT.type,
        label: CHECKOUT.label,
        impactType: 'DIRECT',
        distance: 1,
        relationship: 'CALLS',
        reason: 'CheckoutService directly calls PaymentService.',
        path: { nodes: [CHECKOUT, PAYMENT], relTypes: ['CALLS'] },
      },
    ],
    indirectImpact: [
      {
        id: ORDER.id,
        type: ORDER.type,
        label: ORDER.label,
        impactType: 'INDIRECT',
        distance: 2,
        relationship: 'CALLS',
        reason: 'OrderService depends on CheckoutService, which calls PaymentService.',
        path: { nodes: [ORDER, CHECKOUT, PAYMENT], relTypes: ['CALLS', 'CALLS'] },
      },
    ],
    tests: [
      {
        id: 'test:payment.service.spec.ts:processPayment.succeeds',
        name: 'processPayment succeeds',
        framework: 'jest',
        filePath: 'apps/api/services/payment.service.spec.ts',
        target: { id: 'fn:processPayment', type: 'Function', label: 'processPayment' },
      },
    ],
    history: {
      commits: [
        {
          sha: '8f21ac7',
          message: 'Add retry handling to payment flow',
          timestamp: '2025-03-05T08:45:00.000Z',
          branch: 'main',
          author: { username: 'alex', name: 'Alex Morgan' },
        },
      ],
      pullRequests: [
        { number: 421, title: 'Add payment retry handling', status: 'merged', createdAt: '2025-03-05T08:45:00.000Z' },
      ],
      issues: [
        { number: 912, title: 'Checkout occasionally times out', status: 'closed', createdAt: '2025-02-20T10:15:00.000Z' },
      ],
    },
    paths: [
      { nodes: [CHECKOUT, PAYMENT], relTypes: ['CALLS'] },
      { nodes: [ORDER, CHECKOUT, PAYMENT], relTypes: ['CALLS', 'CALLS'] },
    ],
  };
}

const builder = new EvidenceBuilder();

describe('EvidenceBuilder', () => {
  it('emits the root entity and impact direction in the payload', () => {
    const { payload } = builder.build(baseResponse());
    expect(payload.root).toEqual({ label: 'PaymentService', type: 'Class' });
    expect(payload.impact.direct).toEqual(['CheckoutService']);
    expect(payload.impact.indirect).toEqual(['OrderService']);
  });

  it('assigns stable ids E1..En with direct paths first, then indirect', () => {
    const { items } = builder.build(baseResponse());
    const paths = items.filter((i) => i.kind === 'path');
    expect(paths.map((p) => p.id)).toEqual(['E1', 'E2']);
    expect(paths[0].direction).toBe('direct');
    expect(paths[1].direction).toBe('indirect');
    expect(paths[0].description).toBe('CheckoutService → CALLS → PaymentService');
    expect(paths[1].description).toBe('OrderService → CALLS → CheckoutService → CALLS → PaymentService');
    expect(paths[0].nodes).toEqual([CHECKOUT.id, PAYMENT.id]);
    expect(paths[0].relTypes).toEqual(['CALLS']);
  });

  it('includes tests, commits, PRs and issues with ids', () => {
    const { items } = builder.build(baseResponse());
    expect(items.map((i) => i.id)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5', 'E6']);
    const test = items[2];
    expect(test.kind).toBe('test');
    expect(test.description).toContain('processPayment succeeds');
    expect(test.label).toBe('apps/api/services/payment.service.spec.ts');
    expect(items[3]).toMatchObject({ kind: 'commit', label: '8f21ac7' });
    expect(items[4]).toMatchObject({ kind: 'pullRequest', description: 'PR #421 — Add payment retry handling' });
    expect(items[5]).toMatchObject({ kind: 'issue', label: 'Issue #912' });
  });

  it('builds a valid id set covering every emitted item', () => {
    const { items, idSet } = builder.build(baseResponse());
    expect(idSet.size).toBe(items.length);
    for (const item of items) expect(idSet.has(item.id)).toBe(true);
  });

  it('applies evidence limits per category', () => {
    const response = baseResponse();
    response.directImpact = Array.from({ length: 20 }, (_, i) => ({
      id: `class:c${i}:C${i}`,
      type: 'Class' as const,
      label: `C${i}`,
      impactType: 'DIRECT' as const,
      distance: 1,
      relationship: 'CALLS' as const,
      reason: 'x',
      path: { nodes: [{ id: `c${i}`, type: 'Class' as const, label: `C${i}` }, PAYMENT], relTypes: ['CALLS' as const] },
    }));
    response.indirectImpact = [];
    response.tests = Array.from({ length: 30 }, (_, i) => ({
      id: `test:${i}`,
      name: `test ${i}`,
      framework: 'jest',
      filePath: `spec-${i}.ts`,
      target: { id: 'fn:x', type: 'Function', label: 'x' },
    }));
    response.history = {
      commits: Array.from({ length: 12 }, (_, i) => ({
        sha: `sha${i}`,
        message: `commit ${i}`,
        timestamp: '2025-01-01T00:00:00.000Z',
        branch: 'main',
        author: null,
      })),
      pullRequests: Array.from({ length: 12 }, (_, i) => ({
        number: i,
        title: `pr ${i}`,
        status: 'merged',
        createdAt: '2025-01-01T00:00:00.000Z',
      })),
      issues: Array.from({ length: 12 }, (_, i) => ({
        number: i,
        title: `issue ${i}`,
        status: 'open',
        createdAt: '2025-01-01T00:00:00.000Z',
      })),
    };
    const { items } = builder.build(response);
    expect(items.filter((i) => i.kind === 'path')).toHaveLength(MAX_EVIDENCE_PATHS);
    expect(items.filter((i) => i.kind === 'test')).toHaveLength(MAX_EVIDENCE_TESTS);
    expect(items.filter((i) => i.kind === 'commit')).toHaveLength(MAX_EVIDENCE_COMMITS);
    expect(items.filter((i) => i.kind === 'pullRequest')).toHaveLength(MAX_EVIDENCE_PULL_REQUESTS);
    expect(items.filter((i) => i.kind === 'issue')).toHaveLength(MAX_EVIDENCE_ISSUES);
  });

  it('handles an empty impact honestly (no paths, no tests, no history)', () => {
    const response = baseResponse();
    response.directImpact = [];
    response.indirectImpact = [];
    response.tests = [];
    response.history = { commits: [], pullRequests: [], issues: [] };
    const { items, payload } = builder.build(response);
    expect(items).toEqual([]);
    expect(payload.impact.direct).toEqual([]);
    expect(payload.impact.indirect).toEqual([]);
  });

  it('truncates long free-text fields', () => {
    expect(truncateText('a'.repeat(500)).length).toBeLessThanOrEqual(120);
    expect(truncateText('short message')).toBe('short message');
    expect(truncateText('  a   b  ')).toBe('a b');
  });
});
