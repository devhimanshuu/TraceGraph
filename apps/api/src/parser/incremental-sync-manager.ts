/**
 * IncrementalSyncManager — computes file-level deltas between the stored
 * graph state and a fresh parse, enabling incremental graph updates.
 *
 * Architecture:
 *   Fresh source files ─┐
 *                       ├──▶ computeDelta() ──▶ FileDelta
 *   Stored hashes ──────┘
 *
 *   FileDelta:
 *     added    — new files (not in graph)  → parse + persist
 *     changed  — different contentHash     → reparse + update
 *     removed  — in graph but not in src   → delete from graph
 *     unchanged — same hash                → skip (fast path)
 *
 * This is the ONLY module that decides WHAT needs reparsing.
 * The actual parsing and persistence are delegated to the pipeline and graph writer.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService } from '../database/database.service';
import {
  detectLanguage,
  isParseableFile,
  shouldSkipFile,
} from './language';
import type { ParsedFileMeta } from './types';
import { ProgrammingLanguage } from './types';

const logger = new Logger('IncrementalSyncManager');

// ── Types ────────────────────────────────────────────────────────────────

export interface StoredFileHash {
  /** The graph File node id, e.g. "file:src/app.ts" */
  nodeId: string;
  /** Repo-relative path */
  path: string;
  /** Stored SHA-256 content hash */
  contentHash: string;
}

export interface FileDelta {
  /** Files that exist on disk but not in the graph. */
  added: string[];
  /** Files whose content hash differs from the stored hash. */
  changed: string[];
  /** Files in the graph but no longer on disk. */
  removed: string[];
  /** Files with identical hashes — skipped entirely. */
  unchanged: string[];
  /** Snapshot timestamp for audit. */
  computedAt: string;
}

export interface IncrementalSyncResult {
  /** The computed delta. */
  delta: FileDelta;
  /** Whether the delta is empty (no changes). */
  isEmpty: boolean;
  /** Performance stats. */
  stats: {
    totalFilesOnDisk: number;
    totalFilesInGraph: number;
    added: number;
    changed: number;
    removed: number;
    unchanged: number;
    deltaComputeMs: number;
  };
}

// ── Module ───────────────────────────────────────────────────────────────

@Injectable()
export class IncrementalSyncManager {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Compute the delta between the stored graph state and the current
   * filesystem. This is a pure diff — it does NOT parse or persist anything.
   *
   * @param repoId  Graph Repository node id (e.g. "repo:owner/name")
   * @param root    Absolute path to the extracted source tree root
   * @returns       The file delta + stats
   */
  async computeDelta(
    repoId: string,
    root: string,
  ): Promise<IncrementalSyncResult> {
    const startedAt = Date.now();

    // 1. Fetch stored hashes from CognoDB
    const storedHashes = await this.fetchStoredHashes(repoId);
    const storedByPath = new Map(storedHashes.map((h) => [h.path, h]));

    // 2. Discover current files on disk
    const currentPaths = await this.discoverFiles(root);
    const currentPathSet = new Set(currentPaths);

    // 3. Compute content hashes for current files
    const currentHashes = await this.computeContentHashes(root, currentPaths);

    // 4. Diff
    const added: string[] = [];
    const changed: string[] = [];
    const unchanged: string[] = [];

    for (const path of currentPaths) {
      const stored = storedByPath.get(path);
      if (!stored) {
        added.push(path);
      } else if (stored.contentHash !== currentHashes.get(path)) {
        changed.push(path);
      } else {
        unchanged.push(path);
      }
    }

    const removed: string[] = [];
    for (const [path, stored] of storedByPath) {
      if (!currentPathSet.has(path)) {
        removed.push(path);
      }
    }

    const delta: FileDelta = {
      added,
      changed,
      removed,
      unchanged,
      computedAt: new Date().toISOString(),
    };

    const deltaComputeMs = Date.now() - startedAt;

    logger.log(
      `Delta computed in ${deltaComputeMs}ms: ` +
      `+${added.length} added, ~${changed.length} changed, ` +
      `-${removed.length} removed, =${unchanged.length} unchanged ` +
      `(of ${currentPaths.length} on disk, ${storedHashes.length} in graph)`,
    );

    return {
      delta,
      isEmpty: added.length === 0 && changed.length === 0 && removed.length === 0,
      stats: {
        totalFilesOnDisk: currentPaths.length,
        totalFilesInGraph: storedHashes.length,
        added: added.length,
        changed: changed.length,
        removed: removed.length,
        unchanged: unchanged.length,
        deltaComputeMs,
      },
    };
  }

  /**
   * Get a pre-computed content hash map for a list of file paths.
   * Useful when the caller already has the file list and just needs hashes.
   */
  async getContentHashes(
    root: string,
    paths: string[],
  ): Promise<Map<string, string>> {
    return this.computeContentHashes(root, paths);
  }

  /**
   * Get stored hashes for a repository — exposed for the graph writer's
   * incremental persistence and for the CLI benchmark.
   */
  async getStoredHashes(repoId: string): Promise<StoredFileHash[]> {
    return this.fetchStoredHashes(repoId);
  }

  // ── Private: Stored hash retrieval ──────────────────────────────────────

  /**
   * Fetch all File nodes for a repository and return their paths + hashes.
   * Uses a single Cypher query that walks Repository → … → File.
   */
  private async fetchStoredHashes(repoId: string): Promise<StoredFileHash[]> {
    try {
      const rows = await this.db.executeRead<Array<{
        f?: Record<string, unknown>;
      }>>(
        (tx) => tx.run(
          `MATCH (r:Repository {id: $repoId})-[:CONTAINS*1..5]->(f:File)
           WHERE f.contentHash IS NOT NULL
           RETURN f`,
          { repoId },
        ),
        { name: 'incremental-fetch-hashes' },
      );

      return rows.map((row) => {
        const props = row.f && typeof row.f === 'object' && 'properties' in row.f
          ? (row.f as { properties: Record<string, unknown> }).properties
          : (row.f ?? {}) as Record<string, unknown>;
        return {
          nodeId: String(props.id ?? ''),
          path: String(props.path ?? ''),
          contentHash: String(props.contentHash ?? ''),
        };
      }).filter((h) => h.path && h.contentHash);
    } catch (err) {
      logger.warn(`Failed to fetch stored hashes for ${repoId}: ${(err as Error).message}`);
      return [];
    }
  }

  // ── Private: File discovery ─────────────────────────────────────────────

  private async discoverFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    await this.walk(root, '', files);
    return files;
  }

  private async walk(current: string, relative: string, files: string[]): Promise<void> {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= 5000) return;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.') continue;
        await this.walk(
          join(current, entry.name),
          relative ? `${relative}/${entry.name}` : entry.name,
          files,
        );
        continue;
      }
      if (!entry.isFile()) continue;
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      const normalized = path.replace(/\\/g, '/');
      try {
        const abs = join(current, entry.name);
        const s = await stat(abs);
        if (s.size > 5_000_000 || s.size === 0) continue;
      } catch {
        continue;
      }
      if (isParseableFile(normalized) && !shouldSkipFile(normalized)) {
        files.push(normalized);
      }
    }
  }

  // ── Private: Content hashing ────────────────────────────────────────────

  /**
   * Compute SHA-256 hashes for a batch of files. Only reads files under
   * the parse budget (500KB) to avoid I/O bloat on huge repos.
   */
  private async computeContentHashes(
    root: string,
    paths: string[],
  ): Promise<Map<string, string>> {
    const hashes = new Map<string, string>();
    const PARSE_MAX = 500_000;

    // Process in batches of 50 for concurrency control
    const BATCH = 50;
    for (let i = 0; i < paths.length; i += BATCH) {
      const batch = paths.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (path) => {
          const abs = join(root, path);
          const s = await stat(abs);
          if (s.size > PARSE_MAX) {
            // Large file: hash size + mtime as a proxy
            return { path, hash: `size:${s.size}:mtime:${s.mtimeMs}` };
          }
          const content = await readFile(abs, 'utf8');
          const hash = createHash('sha256').update(content).digest('hex');
          return { path, hash };
        }),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          hashes.set(result.value.path, result.value.hash);
        } else {
          // File read failure: treat as changed (will be reparsed)
          hashes.set(batch[j], `error:${result.reason}`);
        }
      }
    }

    return hashes;
  }
}

// ── Constants ────────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out',
  '.cache', '.turbo', '.nx', '.venv', '__pycache__', 'target',
  '.idea', '.vscode', '.yarn', '.pnp', 'vendor',
  'Pods', '.gradle', '.maven',
]);
