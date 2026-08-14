import type { DatabaseService } from '../database/database.service';
import type { GraphNode } from '@tracegraph/shared';
import { ImpactRepository } from './impact.repository';

function createMockDb() {
  const executeRead = jest.fn();
  const db = {
    executeRead,
    executeWrite: jest.fn(),
    executeTransaction: jest.fn(),
  } as unknown as DatabaseService;
  return { db, executeRead };
}

/** Runs a captured executeRead work callback with a fake transaction. */
async function runWork(
  executeRead: jest.Mock,
  index: number,
  rows: unknown[],
): Promise<{ cypher: string; params: Record<string, unknown> }> {
  const work = executeRead.mock.calls[index][0];
  const fakeTx = { run: jest.fn().mockResolvedValue(rows) };
  await work(fakeTx);
  const [cypher, params] = fakeTx.run.mock.calls[0];
  return { cypher, params };
}

const classNode: GraphNode = {
  id: 'class:apps/api/services/payment.service.ts:PaymentService',
  type: 'Class',
  label: 'PaymentService',
  properties: {},
};

describe('ImpactRepository', () => {  it('resolves class roots to the functions in their containing file', async () => {
    const { db, executeRead } = createMockDb();
    executeRead
      .mockResolvedValueOnce([
        { fnId: 'fn:payment.service.ts:processPayment' },
        { fnId: 'fn:payment.service.ts:getPaymentStatus' },
      ]) // entry fns
      .mockResolvedValueOnce([]) // call paths
      .mockResolvedValueOnce([]) // owners
      .mockResolvedValueOnce([]) // extends paths
      .mockResolvedValueOnce([]); // extends node refs
    const repo = new ImpactRepository(db);

    const paths = await repo.collectImpact(classNode, 2, 100);
    // Entry functions resolved, then call paths query ran.
    const { cypher, params } = await runWork(executeRead, 1, []);
    expect(cypher).toContain('MATCH (entryFn:Function)');
    expect(cypher).toContain('-[:CALLS*1..2]->');
    expect(cypher).toContain('LIMIT 100');
    expect(params).toEqual({
      entryIds: ['fn:payment.service.ts:processPayment', 'fn:payment.service.ts:getPaymentStatus'],
    });
    expect(paths).toEqual([]);
  });

  it('resolves a function root to itself', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([{ fnId: 'fn:payment.service.ts:processPayment' }]);
    const repo = new ImpactRepository(db);

    await repo.collectImpact(
      {
        id: 'fn:payment.service.ts:processPayment',
        type: 'Function',
        label: 'processPayment',
        properties: {},
      },
      2,
      100,
    );
    const { params } = await runWork(executeRead, 1, []);
    expect(params.entryIds).toEqual(['fn:payment.service.ts:processPayment']);
  });

  it('skips CALLS for node types without function semantics', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([]);
    const repo = new ImpactRepository(db);

    const paths = await repo.collectImpact(
      { id: 'test:x', type: 'Test', label: 'x', properties: {} },
      2,
      100,
    );
    expect(paths).toEqual([]);
    expect(executeRead).not.toHaveBeenCalled();
  });

  it('normalizes call paths into entity chains with owners and via', async () => {
    const { db, executeRead } = createMockDb();
    executeRead
      .mockResolvedValueOnce([{ fnId: 'fn:payment.service.ts:processPayment' }]) // entry fns
      .mockResolvedValueOnce([
        {
          fnIds: ['fn:order.service.ts:retryPendingCheckout', 'fn:checkout.service.ts:processCheckout', 'fn:payment.service.ts:processPayment'],
          relTypes: ['CALLS', 'CALLS'],
          hops: { low: 2, high: 0, toNumber: () => 2 },
        },
      ]) // call paths
      .mockResolvedValueOnce([
        {
          fnId: 'fn:order.service.ts:retryPendingCheckout',
          fnName: 'retryPendingCheckout',
          fileId: 'file:order.service.ts',
          fileName: 'order.service.ts',
          classIds: ['class:order.service.ts:OrderService'],
          classNames: ['OrderService'],
        },
        {
          fnId: 'fn:checkout.service.ts:processCheckout',
          fnName: 'processCheckout',
          fileId: 'file:checkout.service.ts',
          fileName: 'checkout.service.ts',
          classIds: ['class:checkout.service.ts:CheckoutService'],
          classNames: ['CheckoutService'],
        },
        {
          fnId: 'fn:payment.service.ts:processPayment',
          fnName: 'processPayment',
          fileId: 'file:payment.service.ts',
          fileName: 'payment.service.ts',
          classIds: ['class:payment.service.ts:PaymentService'],
          classNames: ['PaymentService'],
        },
      ]); // owners

    executeRead.mockResolvedValue([]); // EXTENDS channel: no class paths
    const repo = new ImpactRepository(db);
    const paths = await repo.collectImpact(classNode, 2, 100);

    expect(paths).toHaveLength(1);
    expect(paths[0].hops).toBe(2);
    expect(paths[0].target).toEqual({
      id: 'class:order.service.ts:OrderService',
      type: 'Class',
      label: 'OrderService',
    });
    expect(paths[0].nodes.map((n) => n.id)).toEqual([
      'class:order.service.ts:OrderService',
      'class:checkout.service.ts:CheckoutService',
      'class:apps/api/services/payment.service.ts:PaymentService',
    ]);
    expect(paths[0].relTypes).toEqual(['CALLS', 'CALLS']);
    expect(paths[0].relationship).toBe('CALLS');
    expect(paths[0].via).toEqual({
      id: 'fn:order.service.ts:retryPendingCheckout',
      type: 'Function',
      label: 'retryPendingCheckout',
    });
  });

  it('collapses consecutive same-entity hops (functions in one file)', async () => {
    const { db, executeRead } = createMockDb();
    executeRead
      .mockResolvedValueOnce([{ fnId: 'fn:payment.service.ts:processPayment' }])
      .mockResolvedValueOnce([
        {
          fnIds: ['fn:checkout.service.ts:validateCart', 'fn:checkout.service.ts:processCheckout', 'fn:payment.service.ts:processPayment'],
          relTypes: ['CALLS', 'CALLS'],
          hops: { low: 2, high: 0, toNumber: () => 2 },
        },
      ])
      .mockResolvedValueOnce([
        {
          fnId: 'fn:checkout.service.ts:validateCart',
          fnName: 'validateCart',
          fileId: 'file:checkout.service.ts',
          fileName: 'checkout.service.ts',
          classIds: ['class:checkout.service.ts:CheckoutService'],
          classNames: ['CheckoutService'],
        },
        {
          fnId: 'fn:checkout.service.ts:processCheckout',
          fnName: 'processCheckout',
          fileId: 'file:checkout.service.ts',
          fileName: 'checkout.service.ts',
          classIds: ['class:checkout.service.ts:CheckoutService'],
          classNames: ['CheckoutService'],
        },
        {
          fnId: 'fn:payment.service.ts:processPayment',
          fnName: 'processPayment',
          fileId: 'file:payment.service.ts',
          fileName: 'payment.service.ts',
          classIds: ['class:payment.service.ts:PaymentService'],
          classNames: ['PaymentService'],
        },
      ]);

    executeRead.mockResolvedValue([]); // EXTENDS channel: no class paths
    const repo = new ImpactRepository(db);
    const paths = await repo.collectImpact(classNode, 2, 100);

    expect(paths).toHaveLength(1);
    expect(paths[0].hops).toBe(1);
    expect(paths[0].nodes.map((n) => n.id)).toEqual([
      'class:checkout.service.ts:CheckoutService',
      'class:apps/api/services/payment.service.ts:PaymentService',
    ]);
  });

  it('drops chains that collapse to only the root (self-call noise)', async () => {
    const { db, executeRead } = createMockDb();
    executeRead
      .mockResolvedValueOnce([{ fnId: 'fn:payment.service.ts:processPayment' }])
      .mockResolvedValueOnce([
        {
          fnIds: ['fn:payment.service.ts:createPaymentIntent', 'fn:payment.service.ts:processPayment'],
          relTypes: ['CALLS'],
          hops: { low: 1, high: 0, toNumber: () => 1 },
        },
      ])
      .mockResolvedValueOnce([
        {
          fnId: 'fn:payment.service.ts:createPaymentIntent',
          fnName: 'createPaymentIntent',
          fileId: 'file:payment.service.ts',
          fileName: 'payment.service.ts',
          classIds: ['class:payment.service.ts:PaymentService'],
          classNames: ['PaymentService'],
        },
        {
          fnId: 'fn:payment.service.ts:processPayment',
          fnName: 'processPayment',
          fileId: 'file:payment.service.ts',
          fileName: 'payment.service.ts',
          classIds: ['class:payment.service.ts:PaymentService'],
          classNames: ['PaymentService'],
        },
      ]);

    executeRead.mockResolvedValue([]); // EXTENDS channel: no class paths
    const repo = new ImpactRepository(db);
    const paths = await repo.collectImpact(classNode, 2, 100);
    expect(paths).toEqual([]);
  });

  it('runs IMPORTS traversal for File roots with file-level paths', async () => {
    const { db, executeRead } = createMockDb();
    executeRead
      .mockResolvedValueOnce([{ fnId: 'fn:payment.service.ts:processPayment' }]) // entry fns
      .mockResolvedValueOnce([]) // call paths
      .mockResolvedValueOnce([
        {
          fileIds: ['file:checkout.service.ts', 'file:payment.service.ts'],
          relTypes: ['IMPORTS'],
          hops: { low: 1, high: 0, toNumber: () => 1 },
        },
      ]) // imports paths
      .mockResolvedValueOnce([
        { n: { id: 'file:checkout.service.ts', name: 'checkout.service.ts' }, nodeType: 'File' },
        { n: { id: 'file:payment.service.ts', name: 'payment.service.ts' }, nodeType: 'File' },
      ]); // node refs

    const repo = new ImpactRepository(db);
    const paths = await repo.collectImpact(
      { id: 'file:payment.service.ts', type: 'File', label: 'payment.service.ts', properties: {} },
      2,
      100,
    );

    expect(paths).toHaveLength(1);
    expect(paths[0].target).toEqual({
      id: 'file:checkout.service.ts',
      type: 'File',
      label: 'checkout.service.ts',
    });
    expect(paths[0].hops).toBe(1);
    expect(paths[0].relationship).toBe('IMPORTS');
    expect(paths[0].nodes.map((n) => n.id)).toEqual([
      'file:checkout.service.ts',
      'file:payment.service.ts',
    ]);
  });

  it('runs EXTENDS traversal for Class roots with class-level paths', async () => {
    const { db, executeRead } = createMockDb();
    executeRead
      .mockResolvedValueOnce([{ fnId: 'fn:errors.ts:toAppError' }]) // entry fns
      .mockResolvedValueOnce([]) // call paths
      .mockResolvedValueOnce([
        {
          classIds: ['class:errors.ts:ValidationError', 'class:errors.ts:AppError'],
          relTypes: ['EXTENDS'],
          hops: { low: 1, high: 0, toNumber: () => 1 },
        },
      ]) // extends paths
      .mockResolvedValueOnce([
        { n: { id: 'class:errors.ts:ValidationError', name: 'ValidationError' }, nodeType: 'Class' },
        { n: { id: 'class:errors.ts:AppError', name: 'AppError' }, nodeType: 'Class' },
      ]);

    const repo = new ImpactRepository(db);
    const paths = await repo.collectImpact(
      { id: 'class:errors.ts:AppError', type: 'Class', label: 'AppError', properties: {} },
      2,
      100,
    );

    expect(paths).toHaveLength(1);
    expect(paths[0].target).toEqual({
      id: 'class:errors.ts:ValidationError',
      type: 'Class',
      label: 'ValidationError',
    });
    expect(paths[0].relationship).toBe('EXTENDS');
  });
});
