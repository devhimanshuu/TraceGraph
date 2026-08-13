import type { DatabaseService } from '../database/database.service';
import { GraphRepository } from './graph.repository';

/**
 * Repository tests run against a mocked DatabaseService: the work callback is
 * captured and executed against a fake transaction, so the exact Cypher text
 * and parameters are asserted without a live database.
 */
function createMockDb() {
  const executeRead = jest.fn();
  const db = {
    executeRead,
    executeWrite: jest.fn(),
    executeTransaction: jest.fn(),
  } as unknown as DatabaseService;
  return { db, executeRead };
}

/** Neo4j Integer lookalike as returned by the driver after normalization. */
const int = (n: number): { low: number; high: number; toNumber: () => number } => ({
  low: n,
  high: 0,
  toNumber: () => n,
});

/** Runs a captured executeRead work callback with a fake transaction. */
async function runWork(
  executeRead: jest.Mock,
  index: number,
  rows: unknown[],
): Promise<{ cypher: string; params: Record<string, unknown> }> {
  const work = executeRead.mock.calls[index][0];
  const fakeTx = {
    run: jest.fn().mockResolvedValue(rows),
  };
  await work(fakeTx);
  const [cypher, params] = fakeTx.run.mock.calls[0];
  return { cypher, params };
}

describe('GraphRepository', () => {
  it('findNodeById returns null when the node does not exist', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([]);
    const repo = new GraphRepository(db);

    await expect(repo.findNodeById('missing')).resolves.toBeNull();
    expect(executeRead).toHaveBeenCalledTimes(1);
  });

  it('findNodeById maps a row into a GraphNode', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([
      {
        n: { id: 'fn:x', name: 'processPayment', lineStart: 20 },
        nodeType: 'Function',
      },
    ]);
    const repo = new GraphRepository(db);

    const node = await repo.findNodeById('fn:x');
    expect(node).toEqual({
      id: 'fn:x',
      type: 'Function',
      label: 'processPayment',
      properties: { id: 'fn:x', name: 'processPayment', lineStart: 20 },
    });
  });

  it('findNodeRelationships runs outgoing and incoming queries and maps refs', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValueOnce([
      {
        relType: 'CALLS',
        relProps: { count: 1 },
        targetId: 'fn:callee',
        targetType: 'Function',
        targetName: 'charge',
      },
    ]);
    executeRead.mockResolvedValueOnce([
      {
        relType: 'CALLS',
        relProps: {},
        sourceId: 'fn:caller',
        sourceType: 'Function',
        sourceName: 'processCheckout',
      },
    ]);
    const repo = new GraphRepository(db);

    const rows = await repo.findNodeRelationships('fn:x', 50);
    const node = { id: 'fn:x', type: 'Function' as const, label: 'x', properties: {} };
    const result = repo.buildRelationships(node, rows.incoming, rows.outgoing);

    expect(result.outgoing[0].target).toEqual({
      id: 'fn:callee',
      type: 'Function',
      label: 'charge',
    });
    expect(result.incoming[0].source).toEqual({
      id: 'fn:caller',
      type: 'Function',
      label: 'processCheckout',
    });
    expect(result.incoming[0].type).toBe('CALLS');
    expect(executeRead).toHaveBeenCalledTimes(2);
  });

  it('findDependencyRows routes Function → CALLS callees with parameters', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([
      { n: { id: 'fn:callee', name: 'charge' }, nodeType: 'Function', relType: 'CALLS' },
    ]);
    const repo = new GraphRepository(db);

    const rows = await repo.findDependencyRows(
      { id: 'fn:caller', type: 'Function', label: 'caller', properties: {} },
      25,
    );
    const { cypher, params } = await runWork(executeRead, 0, []);

    expect(cypher).toContain('MATCH (fn:Function {id: $id})-[r:CALLS]->(callee:Function)');
    expect(params).toEqual({ id: 'fn:caller', limit: 25 });
    expect(rows).toHaveLength(1);
  });

  it('findDependencyRows routes File → IMPORTS', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([]);
    const repo = new GraphRepository(db);

    await repo.findDependencyRows(
      { id: 'file:a.ts', type: 'File', label: 'a', properties: {} },
      25,
    );
    const { cypher } = await runWork(executeRead, 0, []);
    expect(cypher).toContain('MATCH (f:File {id: $id})-[r:IMPORTS]->(target:File)');
  });

  it('findDependencyRows routes Class → EXTENDS + CALLS owners (two queries)', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValueOnce([]); // extends
    executeRead.mockResolvedValueOnce([
      {
        callee: { id: 'fn:callee', name: 'createTransaction' },
        calleeFile: { id: 'file:payment.repository.ts', name: 'payment.repository.ts' },
        owners: [
          { id: 'class:payment.repository.ts:PaymentRepository', name: 'PaymentRepository' },
        ],
        relType: 'CALLS',
      },
    ]);
    const repo = new GraphRepository(db);

    const rows = await repo.findDependencyRows(
      { id: 'class:x', type: 'Class', label: 'X', properties: {} },
      25,
    );
    expect(rows).toHaveLength(1);
    expect(executeRead).toHaveBeenCalledTimes(2);
    const second = executeRead.mock.calls[1][0];
    const fakeTx = { run: jest.fn().mockResolvedValue([]) };
    await second(fakeTx);
    expect(fakeTx.run.mock.calls[0][0]).toContain('RETURN DISTINCT properties(callee)');
    expect(fakeTx.run.mock.calls[0][1]).toEqual({ id: 'class:x', limit: 25 });
  });

  it('traverseFromNode builds a literal depth bound and deduplicates', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([
      {
        target: { id: 'fn:a', name: 'a' },
        nodeType: 'Function',
        hops: int(2),
        nodeIds: ['fn:root', 'fn:mid', 'fn:a'],
        relTypes: ['CALLS', 'CALLS'],
        relProps: [{}, { count: 3 }],
      },
      {
        target: { id: 'fn:a', name: 'a' },
        nodeType: 'Function',
        hops: int(1),
        nodeIds: ['fn:root', 'fn:a'],
        relTypes: ['CALLS'],
        relProps: [{}],
      },
    ]);
    const repo = new GraphRepository(db);

    const result = await repo.traverseFromNode(
      { id: 'fn:root', type: 'Function', label: 'root' },
      3,
      ['CALLS', 'IMPORTS'],
      100,
    );

    const { cypher, params } = await runWork(executeRead, 0, []);
    expect(cypher).toContain('-[:CALLS|IMPORTS*1..3]->');
    expect(cypher).toContain('LIMIT 100');
    expect(params).toEqual({ rootId: 'fn:root' });

    // Dedup: fn:a keeps the MINIMUM hop distance (1, not 2).
    expect(result.nodes.find((n) => n.id === 'fn:a')?.hops).toBe(1);
    // Three distinct (source,type,target) triples → three edges.
    expect(result.edges).toHaveLength(3);
    expect(result.edges[1].properties).toEqual({ count: 3 });
    expect(result.paths).toHaveLength(2);
    expect(result.paths[1].nodes).toEqual(['fn:root', 'fn:a']);
  });

  it('findTests routes Function → direct TESTS query', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([
      {
        t: {
          id: 'test:x',
          name: 'processPayment succeeds',
          framework: 'jest',
          filePath: 'payment.service.spec.ts',
        },
        fn: { id: 'fn:pp', name: 'processPayment' },
      },
    ]);
    const repo = new GraphRepository(db);

    const tests = await repo.findTests(
      { id: 'fn:pp', type: 'Function', label: 'processPayment', properties: {} },
      20,
    );
    const { cypher } = await runWork(executeRead, 0, []);
    expect(cypher).toContain('MATCH (t:Test)-[:TESTS]->(fn:Function {id: $id})');
    expect(tests[0]).toMatchObject({ id: 'test:x', name: 'processPayment succeeds' });
    expect(tests[0].target.label).toBe('processPayment');
  });

  it('findCommits maps commits with authors, newest first', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([
      {
        c: {
          sha: '8f21ac7',
          message: 'Add retry handling to payment flow',
          timestamp: '2025-03-05T08:45:00.000Z',
          branch: 'main',
        },
        d: { username: 'alex', name: 'Alex Morgan' },
      },
    ]);
    const repo = new GraphRepository(db);

    const commits = await repo.findCommits('file:x', 10);
    const { cypher } = await runWork(executeRead, 0, []);
    expect(cypher).toContain('(c:Commit)-[:MODIFIES]->(f)');
    expect(commits[0]).toMatchObject({
      sha: '8f21ac7',
      author: { username: 'alex', name: 'Alex Morgan' },
    });
  });

  it('search maps rows to node refs and parameterizes the query', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([
      { n: { id: 'class:p', name: 'PaymentService' }, nodeType: 'Class' },
    ]);
    const repo = new GraphRepository(db);

    const results = await repo.search('payment', 10);
    const { cypher, params } = await runWork(executeRead, 0, []);
    expect(cypher).toContain('CONTAINS toLower($q)');
    expect(params).toEqual({ q: 'payment', limit: 10 });
    expect(results[0]).toEqual({ id: 'class:p', type: 'Class', label: 'PaymentService' });
  });

  it('countNodesByLabel counts every TraceGraph label and normalizes Integers', async () => {
    const { db, executeRead } = createMockDb();
    executeRead.mockResolvedValue([{ count: int(37) }]);
    const repo = new GraphRepository(db);

    const counts = await repo.countNodesByLabel();
    expect(counts.File).toBe(37);
    expect(executeRead).toHaveBeenCalledTimes(10);
    expect(counts.Developer).toBe(37); // same mock value for every label
  });
});
