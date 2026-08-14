import { NotFoundException } from '@nestjs/common';
import type { GraphNode, ImpactSnapshot } from '@tracegraph/shared';
import type { GraphRepository } from '../graph/graph.repository';
import { ImpactHistoryService } from './impact-history.service';
import type { ImpactHistoryRepository } from './impact-history.repository';

const REPO: GraphNode = {
  id: 'repo:commerce-platform',
  type: 'Repository',
  label: 'commerce-platform',
  properties: { id: 'repo:commerce-platform', name: 'commerce-platform' },
};

function snapshot(partial: Partial<ImpactSnapshot> = {}): ImpactSnapshot {
  return {
    id: 'impact-snapshot:repo:commerce-platform:abc',
    nodeId: 'class:apps/api/services/payment.service.ts:PaymentService',
    label: 'PaymentService',
    type: 'Class',
    depth: 2,
    score: 'HIGH',
    direct: 2,
    indirect: 2,
    tests: 9,
    timestamp: 1000,
    repoId: REPO.id,
    repoName: REPO.label,
    analyzedBy: null,
    ...partial,
  };
}

function createMocks(overrides: { repo?: GraphNode | null; snapshots?: ImpactSnapshot[] } = {}) {
  const graphRepo = {
    findDefaultRepository: jest.fn(
      async (): Promise<GraphNode | null> =>
        overrides.repo === null ? null : (overrides.repo ?? REPO),
    ),
  } as unknown as GraphRepository;
  const repo = {
    findBySignature: jest.fn(async () => null),
    list: jest.fn(async () => overrides.snapshots ?? []),
    create: jest.fn(async (_repoId: string, s: ImpactSnapshot) => s),
    touch: jest.fn(async () => null),
    clear: jest.fn(async () => 0),
    trimTo: jest.fn(async () => 0),
  } as unknown as ImpactHistoryRepository;
  const service = new ImpactHistoryService(graphRepo, repo);
  return { service, graphRepo, repo };
}

const input = {
  nodeId: 'class:apps/api/services/payment.service.ts:PaymentService',
  label: 'PaymentService',
  type: 'Class' as const,
  depth: 2,
  score: 'HIGH' as const,
  direct: 2,
  indirect: 2,
  tests: 9,
};

describe('ImpactHistoryService', () => {
  it('lists snapshots for the repository, newest first', async () => {
    const s = snapshot();
    const { service, repo } = createMocks({ snapshots: [s] });
    const res = await service.list(50);
    expect(repo.list).toHaveBeenCalledWith(REPO.id, 50);
    expect(res).toEqual({
      repo: { id: REPO.id, type: 'Repository', label: 'commerce-platform' },
      snapshots: [s],
    });
  });

  it('404s when no repository is available', async () => {
    const { service } = createMocks({ repo: null });
    await expect(service.list(50)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a new snapshot, attributes the analyst, trims, and returns the ledger', async () => {
    const { service, repo } = createMocks({ snapshots: [] });
    const res = await service.record(input, { sub: 'user_123', name: 'Alex Morgan' });
    expect(repo.findBySignature).toHaveBeenCalledWith(REPO.id, {
      nodeId: input.nodeId,
      depth: 2,
      score: 'HIGH',
      direct: 2,
      indirect: 2,
      tests: 9,
    });
    expect(repo.create).toHaveBeenCalledTimes(1);
    const created = (repo.create as jest.Mock).mock.calls[0][1] as ImpactSnapshot;
    expect(created.id).toMatch(/^impact-snapshot:repo:commerce-platform:/);
    expect(created.timestamp).toBeGreaterThan(0);
    expect(created.repoId).toBe(REPO.id);
    expect(created.repoName).toBe('commerce-platform');
    expect(created.analyzedBy).toEqual({ username: 'user_123', name: 'Alex Morgan' });
    expect(repo.trimTo).toHaveBeenCalledWith(REPO.id, 50);
    expect(res.repo.id).toBe(REPO.id);
  });

  it('refreshes an unchanged re-run instead of creating a duplicate', async () => {
    const existing = snapshot({ timestamp: 1000 });
    const { service, repo } = createMocks({ snapshots: [existing] });
    (repo.findBySignature as jest.Mock).mockResolvedValue(existing);

    await service.record(input, { sub: 'user_123' });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.touch).toHaveBeenCalledWith(existing.id, expect.any(Number));
  });

  it('derives the analyst from the session claims, tolerating missing identity', async () => {
    const { service, repo } = createMocks({ snapshots: [] });
    await service.record(input, undefined);
    const created = (repo.create as jest.Mock).mock.calls[0][1] as ImpactSnapshot;
    expect(created.analyzedBy).toBeNull();
  });

  it('clears every snapshot for the repository', async () => {
    const { service, repo } = createMocks({ snapshots: [] });
    (repo.clear as jest.Mock).mockResolvedValue(3);
    await expect(service.clear()).resolves.toEqual({ deleted: 3 });
    expect(repo.clear).toHaveBeenCalledWith(REPO.id);
  });
});
