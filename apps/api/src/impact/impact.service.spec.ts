import { NotFoundException } from '@nestjs/common';
import type {
  GraphNode,
  GraphNodeRef,
  HistoryCommit,
  HistoryIssue,
  HistoryPullRequest,
  TestCoverage,
} from '@tracegraph/shared';
import type { GraphRepository } from '../graph/graph.repository';
import type { GraphService } from '../graph/graph.service';
import { ImpactService } from './impact.service';
import type { ImpactRepository, ImpactEntityRow } from './impact.repository';

const PAYMENT: GraphNode = {
  id: 'class:apps/api/services/payment.service.ts:PaymentService',
  type: 'Class',
  label: 'PaymentService',
  properties: {},
};
const CHECKOUT_REF: GraphNodeRef = {
  id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
  type: 'Class',
  label: 'CheckoutService',
};
const ORDER_REF: GraphNodeRef = {
  id: 'class:apps/api/services/order.service.ts:OrderService',
  type: 'Class',
  label: 'OrderService',
};
const PAYMENT_REF: GraphNodeRef = { id: PAYMENT.id, type: 'Class', label: PAYMENT.label };

function row(partial: Partial<ImpactEntityRow>): ImpactEntityRow {
  return {
    target: CHECKOUT_REF,
    hops: 1,
    relationship: 'CALLS',
    nodes: [CHECKOUT_REF, PAYMENT_REF],
    relTypes: ['CALLS'],
    ...partial,
  };
}

function createMocks(overrides: {
  rows?: ImpactEntityRow[];
  tests?: TestCoverage[];
  commits?: HistoryCommit[];
  pullRequests?: HistoryPullRequest[];
  issues?: HistoryIssue[];
  node?: GraphNode | null;
} = {}) {
  const impactRepo = {
    collectImpact: jest.fn(async () => overrides.rows ?? []),
  } as unknown as ImpactRepository;
  const graphRepo = {
    findTests: jest.fn(async (): Promise<TestCoverage[]> => overrides.tests ?? []),
    findCommits: jest.fn(async (): Promise<HistoryCommit[]> => overrides.commits ?? []),
    findPullRequests: jest.fn(
      async (): Promise<HistoryPullRequest[]> => overrides.pullRequests ?? [],
    ),
    findIssues: jest.fn(async (): Promise<HistoryIssue[]> => overrides.issues ?? []),
  } as unknown as GraphRepository;
  const graphService = {
    getNode: jest.fn(async (id: string): Promise<GraphNode> => {
      if (overrides.node === null) throw new NotFoundException(`Node "${id}" was not found`);
      return overrides.node ?? PAYMENT;
    }),
  } as unknown as GraphService;
  const service = new ImpactService(impactRepo, graphRepo, graphService);
  return { service, impactRepo, graphRepo, graphService };
}

const emptyQuery = { depth: 2, limit: 100 };

describe('ImpactService', () => {
  it('404s for an unknown node', async () => {
    const { service } = createMocks({ node: null });
    await expect(service.analyze('missing', emptyQuery)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('classifies distance-1 rows as DIRECT with a fact-based reason', async () => {
    const { service } = createMocks({
      rows: [row({ target: CHECKOUT_REF, hops: 1 })],
    });
    const res = await service.analyze(PAYMENT.id, emptyQuery);
    expect(res.summary.direct).toBe(1);
    expect(res.summary.indirect).toBe(0);
    expect(res.directImpact[0]).toMatchObject({
      id: CHECKOUT_REF.id,
      label: 'CheckoutService',
      impactType: 'DIRECT',
      distance: 1,
      relationship: 'CALLS',
    });
    expect(res.directImpact[0].reason).toBe(
      'CheckoutService directly calls PaymentService.',
    );
    expect(res.directImpact[0].path.nodes).toEqual([CHECKOUT_REF, PAYMENT_REF]);
  });

  it('classifies distance-2 rows as INDIRECT with a chain reason', async () => {
    const { service } = createMocks({
      rows: [
        row({
          target: ORDER_REF,
          hops: 2,
          nodes: [ORDER_REF, CHECKOUT_REF, PAYMENT_REF],
          relTypes: ['CALLS', 'CALLS'],
        }),
      ],
    });
    const res = await service.analyze(PAYMENT.id, emptyQuery);
    expect(res.summary.indirect).toBe(1);
    expect(res.indirectImpact[0]).toMatchObject({
      label: 'OrderService',
      impactType: 'INDIRECT',
      distance: 2,
    });
    expect(res.indirectImpact[0].reason).toBe(
      'OrderService depends on CheckoutService, which calls PaymentService.',
    );
    expect(res.indirectImpact[0].path.nodes.map((n) => n.id)).toEqual([
      ORDER_REF.id,
      CHECKOUT_REF.id,
      PAYMENT_REF.id,
    ]);
  });

  it('deduplicates by entity id keeping the minimum distance', async () => {
    const { service } = createMocks({
      rows: [
        row({ target: ORDER_REF, hops: 2, nodes: [ORDER_REF, CHECKOUT_REF, PAYMENT_REF] }),
        row({ target: ORDER_REF, hops: 3, nodes: [ORDER_REF, CHECKOUT_REF, CHECKOUT_REF, PAYMENT_REF] }),
      ],
    });
    const res = await service.analyze(PAYMENT.id, emptyQuery);
    expect(res.summary.indirect).toBe(1);
    expect(res.indirectImpact).toHaveLength(1);
    expect(res.indirectImpact[0].distance).toBe(2);
  });

  it('respects the requested depth in the response and summary', async () => {
    const { service } = createMocks({
      rows: [row({ target: ORDER_REF, hops: 2, nodes: [ORDER_REF, CHECKOUT_REF, PAYMENT_REF] })],
    });
    const res = await service.analyze(PAYMENT.id, { depth: 3, limit: 100 });
    expect(res.depth).toBe(3);
    expect(res.summary.maxDepth).toBe(3);
    expect(res.indirectImpact).toHaveLength(1);
  });

  it('never lists the root itself as an impacted entity (cycle guard)', async () => {
    const { service } = createMocks({
      rows: [
        row({ target: CHECKOUT_REF, hops: 1 }),
        // A cyclic CALLS chain loops back to the root — must be dropped.
        row({
          target: PAYMENT_REF,
          hops: 2,
          nodes: [PAYMENT_REF, CHECKOUT_REF, PAYMENT_REF],
          relTypes: ['CALLS', 'CALLS'],
        }),
      ],
    });
    const res = await service.analyze(PAYMENT.id, emptyQuery);
    expect(res.summary.direct).toBe(1);
    expect(res.summary.indirect).toBe(0);
    expect(res.directImpact.map((e) => e.id)).toEqual([CHECKOUT_REF.id]);
    expect(res.indirectImpact).toEqual([]);
  });

  it('returns an empty impact result when nothing reaches the root', async () => {
    const { service } = createMocks({ rows: [] });
    const res = await service.analyze(PAYMENT.id, emptyQuery);
    expect(res.summary).toEqual({
      direct: 0,
      indirect: 0,
      tests: 0,
      commits: 0,
      pullRequests: 0,
      issues: 0,
      maxDepth: 2,
      score: 'LOW',
      scoreReasons: [
        'No modeled dependents found',
        'No impact reaches beyond the selected entity',
        'No test coverage found for the affected surface',
      ],
    });
    expect(res.directImpact).toEqual([]);
    expect(res.indirectImpact).toEqual([]);
    expect(res.paths).toEqual([]);
  });

  it('scores HIGH when dependents, depth coverage and test exposure are all strong', async () => {
    const { service } = createMocks({
      rows: [
        row({ target: CHECKOUT_REF, hops: 1 }),
        row({
          target: ORDER_REF,
          hops: 2,
          nodes: [ORDER_REF, CHECKOUT_REF, PAYMENT_REF],
          relTypes: ['CALLS', 'CALLS'],
        }),
      ],
      tests: Array.from({ length: 9 }, (_, i) => ({
        id: `test:${i}`,
        name: `test ${i}`,
        framework: 'jest',
        filePath: 'payment.spec.ts',
        target: { id: 'fn:processPayment', type: 'Function', label: 'processPayment' },
      })),
    });
    const res = await service.analyze(PAYMENT.id, emptyQuery);
    expect(res.summary.score).toBe('HIGH');
    expect(res.summary.scoreReasons).toEqual([
      '1 direct and 1 indirect dependents',
      'Impact reaches the full 2-hop depth',
      '9 potentially affected tests',
    ]);
  });

  it('scores MEDIUM for a shallow one-hop impact with light test coverage', async () => {
    const { service } = createMocks({
      rows: [row({ target: CHECKOUT_REF, hops: 1 })],
      tests: [
        {
          id: 'test:1',
          name: 'one test',
          framework: 'jest',
          filePath: 'payment.spec.ts',
          target: { id: 'fn:processPayment', type: 'Function', label: 'processPayment' },
        },
      ],
    });
    const res = await service.analyze(PAYMENT.id, { depth: 3, limit: 100 });
    expect(res.summary.score).toBe('MEDIUM');
    expect(res.summary.scoreReasons).toContain('1 direct dependent');
    expect(res.summary.scoreReasons).toContain('Impact reaches 1 of 3 requested hops');
    expect(res.summary.scoreReasons).toContain('1 potentially affected test');
  });

  it('scores LOW for an empty result', async () => {
    const { service } = createMocks({ rows: [] });
    const res = await service.analyze(PAYMENT.id, emptyQuery);
    expect(res.summary.score).toBe('LOW');
  });

  it('collects root tests plus tests of directly-affected entities, deduplicated', async () => {
    const { service, graphRepo } = createMocks({
      rows: [row({ target: CHECKOUT_REF, hops: 1 })],
      tests: [
        {
          id: 'test:payment.spec.ts:processPayment',
          name: 'processPayment succeeds',
          framework: 'jest',
          filePath: 'payment.spec.ts',
          target: { id: 'fn:processPayment', type: 'Function', label: 'processPayment' },
        },
      ],
    });
    const res = await service.analyze(PAYMENT.id, emptyQuery);
    expect(res.summary.tests).toBe(1);
    expect(res.tests[0].name).toBe('processPayment succeeds');
    // Root + the single direct target → two findTests calls.
    expect(graphRepo.findTests).toHaveBeenCalledTimes(2);
  });

  it('returns history context for the root', async () => {
    const commit: HistoryCommit = {
      sha: '8f21ac7',
      message: 'Add retry handling',
      timestamp: '2025-03-05T08:45:00.000Z',
      branch: 'main',
      author: { username: 'alex', name: 'Alex Morgan' },
    };
    const pr: HistoryPullRequest = {
      number: 421,
      title: 'Add payment retry handling',
      status: 'merged',
      createdAt: '2025-03-05T08:45:00.000Z',
    };
    const issue: HistoryIssue = {
      number: 912,
      title: 'Checkout occasionally times out',
      status: 'closed',
      createdAt: '2025-02-20T10:15:00.000Z',
    };
    const { service } = createMocks({ commits: [commit], pullRequests: [pr], issues: [issue] });
    const res = await service.analyze(PAYMENT.id, emptyQuery);
    expect(res.summary.commits).toBe(1);
    expect(res.summary.pullRequests).toBe(1);
    expect(res.summary.issues).toBe(1);
    expect(res.history.commits[0].sha).toBe('8f21ac7');
    expect(res.history.pullRequests[0].number).toBe(421);
    expect(res.history.issues[0].number).toBe(912);
  });

  it('exposes deduplicated evidence paths (affected → … → root)', async () => {
    const { service } = createMocks({
      rows: [
        row({ target: CHECKOUT_REF, hops: 1 }),
        row({
          target: ORDER_REF,
          hops: 2,
          nodes: [ORDER_REF, CHECKOUT_REF, PAYMENT_REF],
          relTypes: ['CALLS', 'CALLS'],
        }),
      ],
    });
    const res = await service.analyze(PAYMENT.id, emptyQuery);
    expect(res.paths).toHaveLength(2);
    expect(res.paths[1].nodes.map((n) => n.id)).toEqual([
      ORDER_REF.id,
      CHECKOUT_REF.id,
      PAYMENT_REF.id,
    ]);
  });
});
