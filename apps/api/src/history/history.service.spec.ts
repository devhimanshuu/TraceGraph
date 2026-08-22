import { HistoryService } from './history.service';

describe('HistoryService', () => {
  const mockDb = {
    executeRead: jest.fn(),
    executeWrite: jest.fn(),
  } as any;

  const service = new HistoryService({ findCommits: jest.fn(), findPullRequests: jest.fn(), findIssues: jest.fn() } as any, { getNode: jest.fn() } as any, mockDb);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFileHistory', () => {
    it('returns timeline entries for a file', async () => {
      mockDb.executeRead.mockResolvedValueOnce([
        { c: { sha: 'abc123', message: 'Fix bug', timestamp: '2026-08-20T10:00:00Z', author: 'dev1' }, pr: { number: 42, title: 'PR 42' }, d: { login: 'alice' } },
      ]);
      mockDb.executeRead.mockResolvedValueOnce([{ count: { low: 1, high: 0 } }]);

      const result = await service.getFileHistory('file:src/app.ts', 10);

      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0].metadata.sha).toBe('abc123');
      expect(result.timeline[0].metadata.author).toBe('alice');
      expect(result.timeline[0].relatedIds).toContain('pr:42');
      expect(result.total).toBe(1);
    });

    it('returns empty timeline for unknown entity', async () => {
      mockDb.executeRead.mockResolvedValueOnce([]);
      mockDb.executeRead.mockResolvedValueOnce([{ count: { low: 0, high: 0 } }]);

      const result = await service.getFileHistory('file:unknown.ts', 10);

      expect(result.timeline).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getContributors', () => {
    it('returns contributors sorted by commit count', async () => {
      mockDb.executeRead.mockResolvedValueOnce([
        { d: { login: 'alice', name: 'Alice' }, commitCount: { low: 5, high: 0 }, lastCommitAt: '2026-08-20T10:00:00Z' },
        { d: { login: 'bob', name: 'Bob' }, commitCount: { low: 2, high: 0 }, lastCommitAt: '2026-08-18T10:00:00Z' },
      ]);

      const result = await service.getContributors('file:src/app.ts', 10);

      expect(result.contributors).toHaveLength(2);
      expect(result.contributors[0].username).toBe('alice');
      expect(result.contributors[0].commitCount).toBe(5);
    });
  });

  describe('getChangeFrequency', () => {
    it('returns change frequency metrics', async () => {
      mockDb.executeRead.mockResolvedValueOnce([
        { entityId: 'file:src/app.ts', total: { low: 24, high: 0 }, lastChangedAt: '2026-08-20T10:00:00Z', d7: { low: 3, high: 0 }, d30: { low: 8, high: 0 }, d90: { low: 20, high: 0 } },
      ]);
      mockDb.executeRead.mockResolvedValueOnce([
        { login: 'alice', count: { low: 12, high: 0 } },
        { login: 'bob', count: { low: 6, high: 0 } },
      ]);

      const result = await service.getChangeFrequency('file:src/app.ts');

      expect(result.totalChanges).toBe(24);
      expect(result.changesLast7Days).toBe(3);
      expect(result.changesLast30Days).toBe(8);
      expect(result.topContributors).toHaveLength(2);
      expect(result.topContributors[0].username).toBe('alice');
    });
  });

  describe('getChangeContext', () => {
    it('returns "why was this changed?" context', async () => {
      mockDb.executeRead.mockResolvedValueOnce([
        {
          c: { sha: 'abc123', message: 'Fix timeout', timestamp: '2026-08-20T10:00:00Z', author: 'dev1' },
          pr: { number: 42, title: 'Fix timeout handling' },
          issue: { number: 912, title: 'Checkout timeout' },
          d: { login: 'alice' },
        },
      ]);
      mockDb.executeRead.mockResolvedValueOnce([{ count: { low: 24, high: 0 } }]);
      mockDb.executeRead.mockResolvedValueOnce([{ login: 'alice', count: { low: 12, high: 0 } }]);
      mockDb.executeRead.mockResolvedValueOnce([{ ts: '2026-08-20T10:00:00Z' }]);

      const result = await service.getChangeContext('file:src/app.ts');

      expect(result.mostRecentChange).not.toBeNull();
      expect(result.mostRecentChange!.prNumber).toBe(42);
      expect(result.mostRecentChange!.issueNumber).toBe(912);
      expect(result.mostRecentChange!.issueTitle).toBe('Checkout timeout');
      expect(result.totalChanges).toBe(24);
      expect(result.recentContributors).toHaveLength(1);
    });

    it('returns null mostRecentChange for entities with no commits', async () => {
      mockDb.executeRead.mockResolvedValueOnce([]);
      mockDb.executeRead.mockResolvedValueOnce([{ count: { low: 0, high: 0 } }]);
      mockDb.executeRead.mockResolvedValueOnce([]);
      mockDb.executeRead.mockResolvedValueOnce([{ ts: null }]);

      const result = await service.getChangeContext('file:unknown.ts');

      expect(result.mostRecentChange).toBeNull();
      expect(result.totalChanges).toBe(0);
    });
  });

  describe('getChangeHeatmap', () => {
    it('returns heatmap entries with normalized intensities', async () => {
      mockDb.executeRead.mockResolvedValueOnce([
        { f: { path: 'src/app.ts', name: 'app.ts' }, count: { low: 24, high: 0 } },
        { f: { path: 'src/utils.ts', name: 'utils.ts' }, count: { low: 12, high: 0 } },
        { f: { path: 'src/config.ts', name: 'config.ts' }, count: { low: 3, high: 0 } },
      ]);

      const result = await service.getChangeHeatmap('repo:test', 30);

      expect(result.entries).toHaveLength(3);
      expect(result.maxChanges).toBe(24);
      expect(result.entries[0].normalizedIntensity).toBe(1);
      expect(result.entries[2].normalizedIntensity).toBeCloseTo(0.125, 1);
    });
  });
});
