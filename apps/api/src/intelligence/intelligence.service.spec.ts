import { NotFoundException } from '@nestjs/common';
import type {
  GraphNode,
  GraphNodeRef,
  ImpactedEntity,
  TestCoverage,
} from '@tracegraph/shared';
import type { GraphRepository } from '../graph/graph.repository';
import type { ImpactRepository, ImpactEntityRow } from '../impact/impact.repository';
import { IntelligenceService } from './intelligence.service';
import type { IntelligenceRepository } from './intelligence.repository';

const REPO: GraphNode = {
  id: 'repo:commerce-platform',
  type: 'Repository',
  label: 'commerce-platform',
  properties: {},
};
const PAYMENT_FILE: GraphNode = {
  id: 'file:apps/api/services/payment.service.ts',
  type: 'File',
  label: 'payment.service.ts',
  properties: { path: 'apps/api/services/payment.service.ts' },
};
const CHECKOUT_FILE: GraphNode = {
  id: 'file:apps/api/services/checkout.service.ts',
  type: 'File',
  label: 'checkout.service.ts',
  properties: { path: 'apps/api/services/checkout.service.ts' },
};
const ORDER_FILE: GraphNode = {
  id: 'file:apps/api/services/order.service.ts',
  type: 'File',
  label: 'order.service.ts',
  properties: { path: 'apps/api/services/order.service.ts' },
};
const CHECKOUT_REF: GraphNodeRef = {
  id: CHECKOUT_FILE.id,
  type: 'File',
  label: 'checkout.service.ts',
};
const ORDER_REF: GraphNodeRef = { id: ORDER_FILE.id, type: 'File', label: 'order.service.ts' };

function row(partial: Partial<ImpactEntityRow>): ImpactEntityRow {
  return {
    target: CHECKOUT_REF,
    hops: 1,
    relationship: 'IMPORTS',
    nodes: [CHECKOUT_REF, { id: PAYMENT_FILE.id, type: 'File', label: 'payment.service.ts' }],
    relTypes: ['IMPORTS'],
    ...partial,
  };
}

function createMocks(overrides: {
  files?: Record<string, GraphNode | null>;
  impactRows?: ImpactEntityRow[];
  tests?: TestCoverage[];
  testRows?: Array<{ coverage: TestCoverage; entityId: string }>;
} = {}) {
  const nodeById = new Map<string, GraphNode | null>(
    Object.entries(overrides.files ?? { [PAYMENT_FILE.id]: PAYMENT_FILE, [CHECKOUT_FILE.id]: CHECKOUT_FILE }),
  );
  const graphRepo = {
    findDefaultRepository: jest.fn(async () => REPO),
    findNodeById: jest.fn(async (id: string) => nodeById.get(id) ?? null),
    findTests: jest.fn(async (): Promise<TestCoverage[]> => overrides.tests ?? []),
  } as unknown as GraphRepository;
  const impactRepo = {
    collectImpact: jest.fn(async () => overrides.impactRows ?? []),
  } as unknown as ImpactRepository;
  const intelligenceRepo = {
    findOrphans: jest.fn(async () => []),
    findImportCycles: jest.fn(async () => []),
    findExtendsCycles: jest.fn(async () => []),
    findGodModules: jest.fn(async () => []),
    findFragileEntities: jest.fn(async () => []),
    findTestGaps: jest.fn(async () => []),
    findTestsForEntityIds: jest.fn(async () => overrides.testRows ?? []),
    findRepoKnowledge: jest.fn(async () => []),
    findEntityKnowledge: jest.fn(async () => []),
  } as unknown as IntelligenceRepository;
  const service = new IntelligenceService(intelligenceRepo, impactRepo, graphRepo);
  return { service, graphRepo, impactRepo, intelligenceRepo };
}

function testCoverage(id: string, name: string): TestCoverage {
  return {
    id,
    name,
    framework: 'jest',
    filePath: 'payment.spec.ts',
    target: { id: 'fn:process', type: 'Function', label: 'process' },
  };
}

describe('IntelligenceService', () => {
  it('404s when no repository exists', async () => {
    const { service, graphRepo } = createMocks();
    (graphRepo.findDefaultRepository as jest.Mock).mockResolvedValue(null);
    await expect(service.getOrphans(50)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('blast radius', () => {
    it('classifies direct and indirect dependents with fact-based reasons', async () => {
      const { service, impactRepo } = createMocks({
        impactRows: [
          row({ target: CHECKOUT_REF, hops: 1 }),
          row({
            target: ORDER_REF,
            hops: 2,
            nodes: [ORDER_REF, CHECKOUT_REF, { id: PAYMENT_FILE.id, type: 'File', label: 'payment.service.ts' }],
            relTypes: ['IMPORTS', 'IMPORTS'],
          }),
        ],
      });
      const res = await service.blastRadius({ files: ['apps/api/services/payment.service.ts'] });
      expect(res.summary.changed).toBe(1);
      expect(res.summary.direct).toBe(1);
      expect(res.summary.indirect).toBe(1);
      expect(res.directImpact[0]).toMatchObject({
        label: 'checkout.service.ts',
        impactType: 'DIRECT',
        distance: 1,
      });
      expect(res.directImpact[0].reason).toBe('checkout.service.ts directly imports payment.service.ts.');
      expect(res.indirectImpact[0].reason).toBe(
        'order.service.ts depends on checkout.service.ts, which imports payment.service.ts.',
      );
      expect(impactRepo.collectImpact).toHaveBeenCalledTimes(1);
    });

    it('deduplicates by entity id keeping the minimum distance', async () => {
      const { service } = createMocks({
        impactRows: [
          row({ target: ORDER_REF, hops: 2, nodes: [ORDER_REF, CHECKOUT_REF, { id: PAYMENT_FILE.id, type: 'File', label: 'payment.service.ts' }] }),
          row({
            target: ORDER_REF,
            hops: 3,
            nodes: [ORDER_REF, CHECKOUT_REF, CHECKOUT_REF, { id: PAYMENT_FILE.id, type: 'File', label: 'payment.service.ts' }],
          }),
        ],
      });
      const res = await service.blastRadius({ files: ['apps/api/services/payment.service.ts'] });
      expect(res.indirectImpact).toHaveLength(1);
      expect(res.indirectImpact[0].distance).toBe(2);
    });

    it('never lists the changed files themselves as impacted (cycle guard)', async () => {
      const { service } = createMocks({
        impactRows: [
          row({ target: CHECKOUT_REF, hops: 1 }),
          row({ target: { id: PAYMENT_FILE.id, type: 'File', label: 'payment.service.ts' }, hops: 2 }),
        ],
      });
      const res = await service.blastRadius({ files: ['apps/api/services/payment.service.ts'] });
      expect(res.summary.direct).toBe(1);
      expect(res.directImpact.map((e: ImpactedEntity) => e.id)).toEqual([CHECKOUT_REF.id]);
    });

    it('tracks unresolved paths (new files, docs) without failing', async () => {
      const { service } = createMocks({
        files: {
          [PAYMENT_FILE.id]: PAYMENT_FILE,
          'file:docs/architecture.md': null,
          'file:README.md': null,
        },
      });
      const res = await service.blastRadius({
        files: ['apps/api/services/payment.service.ts', 'README.md', 'docs/architecture.md'],
      });
      expect(res.summary.changed).toBe(1);
      expect(res.unresolved).toEqual(['README.md', 'docs/architecture.md']);
    });

    it('normalizes diff prefixes and blob URLs before matching', async () => {
      const { service } = createMocks();
      const res = await service.blastRadius({
        files: [
          'a/apps/api/services/payment.service.ts',
          'https://github.com/acme/commerce-platform/blob/main/apps/api/services/payment.service.ts',
        ],
      });
      expect(res.summary.changed).toBe(1);
      expect(res.changed[0].id).toBe(PAYMENT_FILE.id);
    });

    it('scores MEDIUM for a one-hop impact with light test coverage', async () => {
      const { service } = createMocks({
        impactRows: [row({ target: CHECKOUT_REF, hops: 1 })],
        tests: [testCoverage('test:1', 'one test')],
      });
      const res = await service.blastRadius({ files: ['apps/api/services/payment.service.ts'], depth: 3 });
      expect(res.summary.score).toBe('MEDIUM');
      expect(res.summary.scoreReasons).toContain('1 direct dependent');
      expect(res.summary.scoreReasons).toContain('Impact reaches 1 of 3 requested hops');
      expect(res.summary.scoreReasons).toContain('1 potentially affected test');
    });

    it('runs one impact traversal per changed file', async () => {
      const { service, impactRepo } = createMocks({
        files: { [PAYMENT_FILE.id]: PAYMENT_FILE, [CHECKOUT_FILE.id]: CHECKOUT_FILE },
      });
      await service.blastRadius({
        files: ['apps/api/services/payment.service.ts', 'apps/api/services/checkout.service.ts'],
      });
      expect(impactRepo.collectImpact).toHaveBeenCalledTimes(2);
    });
  });

  describe('tests for change', () => {
    it('ranks tests by changed-surface coverage, weighting direct covers double', async () => {
      const { service } = createMocks({
        impactRows: [row({ target: CHECKOUT_REF, hops: 1 })],
        testRows: [
          { coverage: testCoverage('test:direct', 'guards changed file'), entityId: PAYMENT_FILE.id },
          { coverage: testCoverage('test:direct', 'guards changed file'), entityId: CHECKOUT_FILE.id },
          { coverage: testCoverage('test:indirect', 'guards dependent'), entityId: CHECKOUT_FILE.id },
        ],
      });
      const res = await service.testsForChange({ entityIds: ['apps/api/services/payment.service.ts'] });
      expect(res.changed.map((c) => c.id)).toEqual([PAYMENT_FILE.id]);
      const byName = new Map(res.tests.map((t) => [t.name, t]));
      expect(byName.get('guards changed file')).toMatchObject({ covers: 2, directlyCovers: 1, risk: 3 });
      expect(byName.get('guards dependent')).toMatchObject({ covers: 1, directlyCovers: 0, risk: 1 });
      expect(res.tests[0].name).toBe('guards changed file');
    });

    it('accepts full node ids as well as paths', async () => {
      const { service } = createMocks({ files: { [PAYMENT_FILE.id]: PAYMENT_FILE } });
      const res = await service.testsForChange({ entityIds: ['file:apps/api/services/payment.service.ts'] });
      expect(res.changed.map((c) => c.id)).toEqual([PAYMENT_FILE.id]);
    });

    it('reports unresolved ids separately', async () => {
      const { service } = createMocks({ files: { [PAYMENT_FILE.id]: PAYMENT_FILE } });
      const res = await service.testsForChange({
        entityIds: ['apps/api/services/payment.service.ts', 'apps/api/not-there.ts'],
      });
      expect(res.unresolved).toEqual(['apps/api/not-there.ts']);
    });
  });

  describe('orphans', () => {
    it('filters manifests, docs and test files from the dead-code list', async () => {
      const { service, intelligenceRepo } = createMocks();
      (intelligenceRepo.findOrphans as jest.Mock).mockResolvedValue([
        { id: 'file:src/legacy.ts', type: 'File', label: 'legacy.ts', incomingDependencies: 0, hasTests: false, commits: 3 },
        { id: 'file:README.md', type: 'File', label: 'README.md', incomingDependencies: 0, hasTests: false, commits: 6 },
        { id: 'file:package.json', type: 'File', label: 'package.json', incomingDependencies: 0, hasTests: false, commits: 5 },
        { id: 'file:src/legacy.test.ts', type: 'File', label: 'legacy.test.ts', incomingDependencies: 0, hasTests: false, commits: 2 },
      ]);
      const res = await service.getOrphans(50);
      expect(res.orphans).toHaveLength(1);
      expect(res.orphans[0].id).toBe('file:src/legacy.ts');
    });
  });

  describe('knowledge', () => {
    it('scopes to the entity when it exists', async () => {
      const { service, intelligenceRepo } = createMocks({
        files: { [PAYMENT_FILE.id]: PAYMENT_FILE },
      });
      const owners = [
        {
          developer: { id: 'dev:alex', type: 'Developer' as const, label: 'alex' },
          commits: 14,
          lastCommit: '2026-03-05T08:45:00.000Z',
        },
      ];
      (intelligenceRepo.findEntityKnowledge as jest.Mock).mockResolvedValue(owners);
      const res = await service.getKnowledge(PAYMENT_FILE.id, 5);
      expect(res.entity?.id).toBe(PAYMENT_FILE.id);
      expect(res.owners).toHaveLength(1);
      expect(intelligenceRepo.findEntityKnowledge).toHaveBeenCalledWith(PAYMENT_FILE.id, 5);
      expect(intelligenceRepo.findRepoKnowledge).not.toHaveBeenCalled();
    });

    it('falls back to repo-wide knowledge for unknown entities', async () => {
      const { service, intelligenceRepo } = createMocks({ files: {} });
      const res = await service.getKnowledge('file:missing.ts', 5);
      expect(res.entity).toBeNull();
      expect(intelligenceRepo.findRepoKnowledge).toHaveBeenCalledWith(REPO.id, 5);
    });
  });
});
