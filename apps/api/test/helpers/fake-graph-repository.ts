import type { GraphNode, GraphNodeRef } from '@tracegraph/shared';
import type { GraphRepository } from '../../src/graph/graph.repository';

/**
 * In-memory GraphRepository for e2e tests — no database needed. Mirrors the
 * real repository's method surface with canned, deterministic data that is
 * consistent with the seeded demo graph.
 */
export function createFakeGraphRepository(): GraphRepository {
  const paymentService: GraphNode = {
    id: 'class:apps/api/services/payment.service.ts:PaymentService',
    type: 'Class',
    label: 'PaymentService',
    properties: {
      id: 'class:apps/api/services/payment.service.ts:PaymentService',
      name: 'PaymentService',
    },
  };
  const checkoutService: GraphNode = {
    id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
    type: 'Class',
    label: 'CheckoutService',
    properties: {
      id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
      name: 'CheckoutService',
    },
  };
  const processPayment: GraphNode = {
    id: 'fn:apps/api/services/payment.service.ts:processPayment',
    type: 'Function',
    label: 'processPayment',
    properties: {
      id: 'fn:apps/api/services/payment.service.ts:processPayment',
      name: 'processPayment',
    },
  };
  const repo: GraphNode = {
    id: 'repo:commerce-platform',
    type: 'Repository',
    label: 'commerce-platform',
    properties: {
      id: 'repo:commerce-platform',
      name: 'commerce-platform',
      fullName: 'acme/commerce-platform',
      description: 'A modular commerce backend',
      language: 'TypeScript',
      defaultBranch: 'main',
    },
  };
  const allNodes = new Map<string, GraphNode>(
    [repo, paymentService, checkoutService, processPayment].map((n) => [n.id, n]),
  );

  return {
    findNodeById: jest.fn(async (id: string) => allNodes.get(id) ?? null),
    findDefaultRepository: jest.fn(async () => repo),
    findNodeRelationships: jest.fn(async () => ({
      incoming: [
        {
          relType: 'CALLS',
          relProps: {},
          sourceId: 'fn:apps/api/services/checkout.service.ts:processCheckout',
          sourceType: 'Function',
          sourceName: 'processCheckout',
        },
      ],
      outgoing: [],
    })),
    buildRelationships: jest.fn((node: GraphNode, incoming, outgoing) => {
      const self: GraphNodeRef = { id: node.id, type: node.type, label: node.label };
      return {
        node,
        incoming: incoming.map(
          (
            row: {
              relType: string;
              relProps: Record<string, unknown>;
              sourceId: string;
              sourceType: string;
              sourceName: string;
            },
            i: number,
          ) => ({
            id: `r-${i + 1}`,
            type: row.relType,
            source: { id: row.sourceId, type: row.sourceType, label: row.sourceName },
            target: self,
            properties: row.relProps,
          }),
        ),
        outgoing: outgoing.map(
          (
            row: {
              relType: string;
              relProps: Record<string, unknown>;
              targetId: string;
              targetType: string;
              targetName: string;
            },
            i: number,
          ) => ({
            id: `r-${i + 1}`,
            type: row.relType,
            source: self,
            target: { id: row.targetId, type: row.targetType, label: row.targetName },
            properties: row.relProps,
          }),
        ),
      };
    }),
    findDependencyRows: jest.fn(async (node: GraphNode) => {
      if (node.type === 'Class') {
        return [
          {
            callee: { id: 'fn:pr:createTransaction', name: 'createTransaction' },
            calleeFile: { id: 'file:payment.repository.ts', name: 'payment.repository.ts' },
            owners: [
              { id: 'class:payment.repository.ts:PaymentRepository', name: 'PaymentRepository' },
            ],
            relType: 'CALLS',
          },
        ];
      }
      if (node.type === 'Function') {
        return [
          { n: { id: 'fn:stripe:charge', name: 'charge' }, nodeType: 'Function', relType: 'CALLS' },
        ];
      }
      return [];
    }),
    findDependentRows: jest.fn(async (node: GraphNode) => {
      if (node.type === 'Class') {
        return [
          {
            caller: { id: 'fn:co:processCheckout', name: 'processCheckout' },
            callerFile: { id: 'file:checkout.service.ts', name: 'checkout.service.ts' },
            owners: [checkoutService.properties],
            relType: 'CALLS',
          },
        ];
      }
      if (node.type === 'Function') {
        return [
          {
            n: { id: 'fn:co:processCheckout', name: 'processCheckout' },
            nodeType: 'Function',
            relType: 'CALLS',
          },
        ];
      }
      return [];
    }),
    findTests: jest.fn(async () => [
      {
        id: 'test:payment.service.spec.ts:processPayment.succeeds',
        name: 'processPayment succeeds',
        framework: 'jest',
        filePath: 'apps/api/services/payment.service.spec.ts',
        target: {
          id: 'fn:apps/api/services/payment.service.ts:processPayment',
          type: 'Function',
          label: 'processPayment',
        },
      },
    ]),
    findCommits: jest.fn(async () => [
      {
        sha: '8f21ac7',
        message: 'Add retry handling to payment flow',
        timestamp: '2025-03-05T08:45:00.000Z',
        branch: 'main',
        author: { username: 'alex', name: 'Alex Morgan' },
      },
    ]),
    findPullRequests: jest.fn(async () => [
      {
        number: 421,
        title: 'Add payment retry handling',
        status: 'merged',
        createdAt: '2025-03-05T08:45:00.000Z',
        mergedAt: '2025-03-08T17:30:00.000Z',
      },
    ]),
    findIssues: jest.fn(async () => [
      {
        number: 912,
        title: 'Checkout occasionally times out',
        status: 'closed',
        createdAt: '2025-02-20T10:15:00.000Z',
      },
    ]),
    traverseFromNode: jest.fn(async (root: GraphNodeRef, depth: number) => ({
      root,
      depth,
      nodes: [
        { ...checkoutService, hops: 1 },
        { ...paymentService, hops: 2 },
      ],
      edges: [
        {
          id: 'e-1',
          source: root.id,
          target: checkoutService.id,
          type: 'CALLS' as const,
          properties: {},
        },
      ],
      paths: [{ nodes: [root.id, checkoutService.id], relTypes: ['CALLS' as const] }],
    })),
    findGraphNeighborhood: jest.fn(async (root: GraphNode, depth: number) => ({
      root: { id: root.id, type: root.type, label: root.label },
      depth,
      nodes: [root, checkoutService],
      edges: [
        {
          id: 'e-1',
          source: root.id,
          target: checkoutService.id,
          type: 'CONTAINS' as const,
          properties: {},
        },
      ],
    })),
    countNodesByLabel: jest.fn(async () => ({
      Directory: 11,
      File: 37,
      Function: 64,
      Class: 21,
      Test: 19,
      Commit: 24,
      PullRequest: 11,
      Issue: 9,
      Developer: 5,
    })),
    countTraceGraphRelationships: jest.fn(async () => 348),
    search: jest.fn(async (q: string) =>
      q.includes('pay')
        ? [{ id: paymentService.id, type: paymentService.type, label: paymentService.label }]
        : [],
    ),
    findRepositoryActivity: jest.fn(async () => ({
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
        {
          number: 421,
          title: 'Add payment retry handling',
          status: 'merged',
          createdAt: '2025-03-05T08:45:00.000Z',
          mergedAt: '2025-03-08T17:30:00.000Z',
        },
      ],
      issues: [
        {
          number: 912,
          title: 'Checkout occasionally times out',
          status: 'closed',
          createdAt: '2025-02-20T10:15:00.000Z',
        },
      ],
    })),
    findRepositoryComponents: jest.fn(async () => [
      { id: paymentService.id, type: 'Class' as const, label: 'PaymentService', dependents: 6 },
      { id: checkoutService.id, type: 'Class' as const, label: 'CheckoutService', dependents: 4 },
    ]),
  } as unknown as GraphRepository;
}
