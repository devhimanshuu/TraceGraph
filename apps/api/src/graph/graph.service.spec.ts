import { NotFoundException } from '@nestjs/common';
import { GraphRepository } from './graph.repository';
import { GraphService } from './graph.service';

describe('GraphService', () => {
  const node = { id: 'class:pp', type: 'Class' as const, label: 'PaymentService', properties: {} };
  const repo = {
    findNodeById: jest.fn(),
    findDefaultRepository: jest.fn(),
    findGraphNeighborhood: jest.fn(),
    findNodeRelationships: jest.fn(),
    buildRelationships: jest.fn(),
    findDependencyRows: jest.fn(),
    findDependentRows: jest.fn(),
    findTests: jest.fn(),
    traverseFromNode: jest.fn(),
    traverseIntoNode: jest.fn(),
    findRelationshipSummary: jest.fn(),
    search: jest.fn(),
  } as unknown as GraphRepository;
  const service = new GraphService(repo);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getNode returns the node when found', async () => {
    (repo.findNodeById as jest.Mock).mockResolvedValue(node);
    await expect(service.getNode('class:pp')).resolves.toEqual(node);
  });

  it('getNode throws NotFoundException for an unknown node', async () => {
    (repo.findNodeById as jest.Mock).mockResolvedValue(null);
    await expect(service.getNode('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getGraph resolves the default root to the repository when no rootId is given', async () => {
    (repo.findDefaultRepository as jest.Mock).mockResolvedValue(node);
    (repo.findNodeById as jest.Mock).mockResolvedValue(node);
    (repo.findGraphNeighborhood as jest.Mock).mockResolvedValue({
      root: node,
      depth: 2,
      nodes: [],
      edges: [],
    });

    const result = await service.getGraph({});
    expect(repo.findDefaultRepository).toHaveBeenCalled();
    expect(result.root.id).toBe('class:pp');
  });

  it('getGraph throws when the graph is empty (no repository)', async () => {
    (repo.findDefaultRepository as jest.Mock).mockResolvedValue(null);
    await expect(service.getGraph({})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getGraph clamps depth and passes default relationship types', async () => {
    (repo.findDefaultRepository as jest.Mock).mockResolvedValue(node);
    (repo.findNodeById as jest.Mock).mockResolvedValue(node);
    (repo.findGraphNeighborhood as jest.Mock).mockResolvedValue({
      root: node,
      depth: 2,
      nodes: [],
      edges: [],
    });

    await service.getGraph({ depth: 4 });
    expect(repo.findGraphNeighborhood).toHaveBeenCalledWith(node, 4, expect.any(Array), 200);
  });

  it('getRelationships throws 404 before querying for an unknown node', async () => {
    (repo.findNodeById as jest.Mock).mockResolvedValue(null);
    await expect(service.getRelationships('nope', 100)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findNodeRelationships).not.toHaveBeenCalled();
  });

  it('getDependencies maps class-level owner rows into targets with via', async () => {
    (repo.findNodeById as jest.Mock).mockResolvedValue(node);
    (repo.findDependencyRows as jest.Mock).mockResolvedValue([
      {
        callee: { id: 'fn:ct', name: 'createTransaction' },
        calleeFile: { id: 'file:pr.ts', name: 'payment.repository.ts' },
        owners: [{ id: 'class:pr.ts:PaymentRepository', name: 'PaymentRepository' }],
        relType: 'CALLS',
      },
    ]);

    const targets = await service.getDependencies('class:pp', 100);
    expect(targets[0]).toEqual({
      id: 'class:pr.ts:PaymentRepository',
      type: 'Class',
      label: 'PaymentRepository',
      relationshipType: 'CALLS',
      via: { id: 'fn:ct', type: 'Function', label: 'createTransaction' },
    });
  });

  it('getCallers is an alias for getDependents', async () => {
    (repo.findNodeById as jest.Mock).mockResolvedValue(node);
    (repo.findDependentRows as jest.Mock).mockResolvedValue([]);
    await service.getCallers('class:pp', 100);
    expect(repo.findDependentRows).toHaveBeenCalled();
  });

  it('traverse passes bounded depth and returns the root', async () => {
    (repo.findNodeById as jest.Mock).mockResolvedValue(node);
    (repo.traverseFromNode as jest.Mock).mockResolvedValue({
      root: { id: 'class:pp', type: 'Class', label: 'PaymentService' },
      depth: 2,
      nodes: [],
      edges: [],
      paths: [],
    });

    const result = await service.traverse('class:pp', { depth: 2 });
    expect(repo.traverseFromNode).toHaveBeenCalledWith(
      { id: 'class:pp', type: 'Class', label: 'PaymentService' },
      2,
      ['CALLS', 'IMPORTS', 'EXTENDS'],
      100,
    );
    expect(result.root.id).toBe('class:pp');
  });

  it('traverse with direction=in walks the dependents chain', async () => {
    (repo.findNodeById as jest.Mock).mockResolvedValue(node);
    const traverseIntoNode = jest.fn().mockResolvedValue({
      root: { id: 'class:pp', type: 'Class', label: 'PaymentService' },
      depth: 3,
      nodes: [],
      edges: [],
      paths: [],
    });
    (repo as unknown as { traverseIntoNode: jest.Mock }).traverseIntoNode = traverseIntoNode;

    await service.traverse('class:pp', { depth: 3, direction: 'in' });
    expect(traverseIntoNode).toHaveBeenCalledWith(
      { id: 'class:pp', type: 'Class', label: 'PaymentService' },
      3,
      ['CALLS', 'IMPORTS', 'EXTENDS'],
      100,
    );
    expect(repo.traverseFromNode).not.toHaveBeenCalled();
  });

  it('getRelationshipSummary 404s for an unknown node without querying', async () => {
    (repo.findNodeById as jest.Mock).mockResolvedValue(null);
    await expect(service.getRelationshipSummary('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect((repo as unknown as { findRelationshipSummary: jest.Mock }).findRelationshipSummary)
      .not.toHaveBeenCalled();
  });

  it('getRelationshipSummary returns category counts for the node', async () => {
    (repo.findNodeById as jest.Mock).mockResolvedValue(node);
    (repo as unknown as { findRelationshipSummary: jest.Mock }).findRelationshipSummary = jest
      .fn()
      .mockResolvedValue({
        relationships: 12,
        dependencies: 2,
        dependents: 4,
        callers: 4,
        callees: 2,
        tests: 8,
        commits: 3,
        pullRequests: 2,
        issues: 1,
      });

    const summary = await service.getRelationshipSummary('class:pp');
    expect(summary.dependencies).toBe(2);
    expect(summary.tests).toBe(8);
    expect(repo.findNodeById).toHaveBeenCalledWith('class:pp');
  });

  it('search delegates with the query and limit', async () => {
    (repo.search as jest.Mock).mockResolvedValue([]);
    await service.search('pay', 10);
    expect(repo.search).toHaveBeenCalledWith('pay', 10);
  });
});
