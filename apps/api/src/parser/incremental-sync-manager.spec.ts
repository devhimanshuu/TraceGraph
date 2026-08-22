/**
 * IncrementalSyncManager tests — verifies file delta computation,
 * content hash comparison, and edge cases (empty repos, large files, errors).
 */
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IncrementalSyncManager, type StoredFileHash } from './incremental-sync-manager';

// Mock DatabaseService
const mockExecuteRead = jest.fn();
const mockExecuteWrite = jest.fn();

jest.mock('../database/database.service', () => ({
  DatabaseService: jest.fn().mockImplementation(() => ({
    executeRead: mockExecuteRead,
    executeWrite: mockExecuteWrite,
  })),
}));

describe('IncrementalSyncManager', () => {
  let manager: IncrementalSyncManager;
  let tmpDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    jest.clearAllMocks();
    manager = new IncrementalSyncManager({
      executeRead: mockExecuteRead,
      executeWrite: mockExecuteWrite,
    } as any);

    tmpDir = await mkdtemp(join(tmpdir(), 'incr-sync-test-'));
    cleanup = () => rm(tmpDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('computeDelta', () => {
    it('detects all files as added when graph is empty', async () => {
      // Empty graph
      mockExecuteRead.mockResolvedValue([]);

      // Create some files
      await mkdir(join(tmpDir, 'src'), { recursive: true });
      await writeFile(join(tmpDir, 'src/app.ts'), 'const x = 1;');
      await writeFile(join(tmpDir, 'src/utils.ts'), 'export function helper() {}');

      const result = await manager.computeDelta('repo:test', tmpDir);

      expect(result.delta.added.length).toBeGreaterThan(0);
      expect(result.delta.changed).toHaveLength(0);
      expect(result.delta.removed).toHaveLength(0);
      expect(result.isEmpty).toBe(false);
    });

    it('detects unchanged files when content hashes match', async () => {
      const source = 'const x = 1;';
      const hash = createHash('sha256').update(source).digest('hex');

      // Graph has the same file with same hash
      mockExecuteRead.mockResolvedValue([{
        f: {
          properties: {
            id: 'file:src/app.ts',
            path: 'src/app.ts',
            contentHash: hash,
          },
        },
      }]);

      await mkdir(join(tmpDir, 'src'), { recursive: true });
      await writeFile(join(tmpDir, 'src/app.ts'), source);

      const result = await manager.computeDelta('repo:test', tmpDir);

      expect(result.delta.unchanged).toContain('src/app.ts');
      expect(result.delta.added).toHaveLength(0);
      expect(result.delta.changed).toHaveLength(0);
      expect(result.stats.unchanged).toBe(1);
    });

    it('detects changed files when content hashes differ', async () => {
      const oldHash = 'aaa111';
      const newSource = 'const x = 2; // changed!';
      const newHash = createHash('sha256').update(newSource).digest('hex');

      mockExecuteRead.mockResolvedValue([{
        f: {
          properties: {
            id: 'file:src/app.ts',
            path: 'src/app.ts',
            contentHash: oldHash,
          },
        },
      }]);

      await mkdir(join(tmpDir, 'src'), { recursive: true });
      await writeFile(join(tmpDir, 'src/app.ts'), newSource);

      const result = await manager.computeDelta('repo:test', tmpDir);

      expect(result.delta.changed).toContain('src/app.ts');
      expect(result.delta.added).toHaveLength(0);
      expect(result.stats.changed).toBe(1);
    });

    it('detects removed files (in graph but not on disk)', async () => {
      mockExecuteRead.mockResolvedValue([{
        f: {
          properties: {
            id: 'file:src/deleted.ts',
            path: 'src/deleted.ts',
            contentHash: 'abc123',
          },
        },
      }]);

      // No files on disk at all
      const result = await manager.computeDelta('repo:test', tmpDir);

      expect(result.delta.removed).toContain('src/deleted.ts');
      expect(result.delta.added).toHaveLength(0);
      expect(result.stats.removed).toBe(1);
    });

    it('computes mixed delta (added + changed + removed)', async () => {
      const kept = 'const kept = true;';
      const keptHash = createHash('sha256').update(kept).digest('hex');
      const changed = 'const changed = true;';

      mockExecuteRead.mockResolvedValue([
        {
          f: {
            properties: {
              id: 'file:src/kept.ts',
              path: 'src/kept.ts',
              contentHash: keptHash,
            },
          },
        },
        {
          f: {
            properties: {
              id: 'file:src/changed.ts',
              path: 'src/changed.ts',
              contentHash: 'old-hash',
            },
          },
        },
        {
          f: {
            properties: {
              id: 'file:src/removed.ts',
              path: 'src/removed.ts',
              contentHash: 'abc',
            },
          },
        },
      ]);

      await mkdir(join(tmpDir, 'src'), { recursive: true });
      await writeFile(join(tmpDir, 'src/kept.ts'), kept);
      await writeFile(join(tmpDir, 'src/changed.ts'), changed);
      await writeFile(join(tmpDir, 'src/new.ts'), 'brand new');

      const result = await manager.computeDelta('repo:test', tmpDir);

      expect(result.delta.unchanged).toContain('src/kept.ts');
      expect(result.delta.changed).toContain('src/changed.ts');
      expect(result.delta.added).toContain('src/new.ts');
      expect(result.delta.removed).toContain('src/removed.ts');
      expect(result.stats.added).toBe(1);
      expect(result.stats.changed).toBe(1);
      expect(result.stats.removed).toBe(1);
      expect(result.stats.unchanged).toBe(1);
    });

    it('returns correct stats', async () => {
      mockExecuteRead.mockResolvedValue([]);

      await mkdir(join(tmpDir, 'src'), { recursive: true });
      await writeFile(join(tmpDir, 'src/a.ts'), 'a');
      await writeFile(join(tmpDir, 'src/b.ts'), 'b');

      const result = await manager.computeDelta('repo:test', tmpDir);

      expect(result.stats.totalFilesOnDisk).toBe(2);
      expect(result.stats.totalFilesInGraph).toBe(0);
      expect(result.stats.deltaComputeMs).toBeGreaterThanOrEqual(0);
    });

    it('handles empty repository', async () => {
      mockExecuteRead.mockResolvedValue([]);

      const result = await manager.computeDelta('repo:empty', tmpDir);

      expect(result.delta.added).toHaveLength(0);
      expect(result.delta.changed).toHaveLength(0);
      expect(result.delta.removed).toHaveLength(0);
      expect(result.isEmpty).toBe(true);
    });

    it('handles graph query failure gracefully', async () => {
      mockExecuteRead.mockRejectedValue(new Error('DB connection failed'));

      await mkdir(join(tmpDir, 'src'), { recursive: true });
      await writeFile(join(tmpDir, 'src/app.ts'), 'x');

      // Should not throw — falls back to empty stored hashes
      const result = await manager.computeDelta('repo:test', tmpDir);
      expect(result.delta.added.length).toBeGreaterThan(0);
    });

    it('includes computedAt timestamp', async () => {
      mockExecuteRead.mockResolvedValue([]);
      const result = await manager.computeDelta('repo:test', tmpDir);
      expect(result.delta.computedAt).toBeTruthy();
      expect(new Date(result.delta.computedAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe('getStoredHashes', () => {
    it('returns stored hashes from the graph', async () => {
      mockExecuteRead.mockResolvedValue([
        {
          f: {
            properties: {
              id: 'file:src/a.ts',
              path: 'src/a.ts',
              contentHash: 'hash-a',
            },
          },
        },
        {
          f: {
            properties: {
              id: 'file:src/b.py',
              path: 'src/b.py',
              contentHash: 'hash-b',
            },
          },
        },
      ]);

      const hashes = await manager.getStoredHashes('repo:test');

      expect(hashes).toHaveLength(2);
      expect(hashes[0].path).toBe('src/a.ts');
      expect(hashes[0].contentHash).toBe('hash-a');
      expect(hashes[1].path).toBe('src/b.py');
    });

    it('returns empty array on error', async () => {
      mockExecuteRead.mockRejectedValue(new Error('timeout'));
      const hashes = await manager.getStoredHashes('repo:test');
      expect(hashes).toEqual([]);
    });
  });

  describe('getContentHashes', () => {
    it('computes SHA-256 hashes for files', async () => {
      await mkdir(join(tmpDir, 'src'), { recursive: true });
      await writeFile(join(tmpDir, 'src/a.ts'), 'hello');
      await writeFile(join(tmpDir, 'src/b.ts'), 'world');

      const hashes = await manager.getContentHashes(tmpDir, ['src/a.ts', 'src/b.ts']);

      expect(hashes.size).toBe(2);
      const expectedA = createHash('sha256').update('hello').digest('hex');
      expect(hashes.get('src/a.ts')).toBe(expectedA);
    });

    it('handles missing files gracefully', async () => {
      const hashes = await manager.getContentHashes(tmpDir, ['nonexistent.ts']);
      expect(hashes.size).toBe(1);
      expect(hashes.get('nonexistent.ts')).toContain('error');
    });
  });
});
