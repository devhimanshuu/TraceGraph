/**
 * ParsingPipeline — orchestrates the full parse-to-graph flow.
 *
 * Repository → File Discovery → Language Detection → Parser Selection
 * → Tree-sitter Extraction → Normalized IR → Graph Writer → CognoDB
 */
import { Injectable, Logger } from '@nestjs/common';
import { readFile, readdir, stat, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { createHash } from 'node:crypto';
import * as tar from 'tar';
import type { ParseContext } from './parser.interface';
import { ParserRegistry } from './parser-registry';
import { GraphWriter } from './graph-writer';
import {
  detectLanguage,
  isParseableFile,
  shouldSkipFile,
} from './language';
import { ProgrammingLanguage } from './types';
import {
  DiagnosticSeverity,
  type BatchParseResult,
  type ParsedFileMeta,
  type ParsedSymbol,
  type ParsedRelationship,
  type ParserDiagnostic,
  type ParseResult,
} from './types';
import { resolveCrossLanguageDeps, type CrossLanguageContext } from './cross-language-resolver';
import { IncrementalSyncManager, type FileDelta } from './incremental-sync-manager';

/** Directories to always ignore during file discovery. */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out',
  '.cache', '.turbo', '.nx', '.venv', '__pycache__', 'target',
  '.idea', '.vscode', '.yarn', '.pnp', 'vendor',
  'vendor', 'Pods', '.gradle', '.maven',
]);

/** Hard limits for demo-scale imports. */
const MAX_FILES = 5_000;
const MAX_FILE_BYTES = 5_000_000;
const PARSE_MAX_BYTES = 500_000;

@Injectable()
export class ParsingPipeline {
  private readonly logger = new Logger(ParsingPipeline.name);

  constructor(
    private readonly registry: ParserRegistry,
    private readonly writer: GraphWriter,
    private readonly incrementalSync: IncrementalSyncManager,
  ) {}

  /**
   * Parse a repository from a tarball (GitHub-style).
   * Returns the full batch parse result + graph persistence stats.
   */
  async parseFromTarball(
    tarball: Buffer,
    repoId: string,
    repoName: string,
    onProgress?: (stage: string, detail?: string) => void,
  ): Promise<{
    result: BatchParseResult;
    graphStats: { nodesCreated: number; relationshipsCreated: number };
  }> {
    const startedAt = Date.now();

    // Ensure registry is initialized
    await this.registry.initialize();

    // 1. Extract tarball
    onProgress?.('extracting', 'Extracting repository...');
    const { root, cleanup } = await this.extractTarball(tarball);

    try {
      // 2. Discover files
      onProgress?.('discovering', 'Discovering files...');
      const allFilePaths = await this.discoverFiles(root);
      this.logger.log(`Discovered ${allFilePaths.length} files`);

      // 3. Parse all files
      onProgress?.('parsing', `Parsing ${allFilePaths.length} files...`);
      const result = await this.parseAllFiles(root, allFilePaths);
      result.stats.parseDurationMs = Date.now() - startedAt;

      // 4. Persist to graph
      onProgress?.('persisting', 'Writing to graph database...');
      const graphStats = await this.writer.persistParseResult(result, repoId, repoName);

      this.logger.log(
        `Parse complete: ${result.stats.filesParsed} files, ` +
        `${result.stats.entitiesExtracted} entities, ` +
        `${result.stats.relationshipsExtracted} relationships, ` +
        `${result.stats.parseErrors} errors, ` +
        `${result.stats.parseDurationMs}ms`,
      );

      return { result, graphStats };
    } finally {
      await cleanup();
    }
  }

  /**
   * Parse files from a local directory path.
   */
  async parseFromDirectory(
    rootPath: string,
    repoId: string,
    repoName: string,
    onProgress?: (stage: string, detail?: string) => void,
  ): Promise<{
    result: BatchParseResult;
    graphStats: { nodesCreated: number; relationshipsCreated: number };
  }> {
    const startedAt = Date.now();
    await this.registry.initialize();

    onProgress?.('discovering', 'Discovering files...');
    const allFilePaths = await this.discoverFiles(rootPath);
    this.logger.log(`Discovered ${allFilePaths.length} files`);

    onProgress?.('parsing', `Parsing ${allFilePaths.length} files...`);
    const result = await this.parseAllFiles(rootPath, allFilePaths);
    result.stats.parseDurationMs = Date.now() - startedAt;

    onProgress?.('persisting', 'Writing to graph database...');
    const graphStats = await this.writer.persistParseResult(result, repoId, repoName);

    return { result, graphStats };
  }

  /**
   * Incremental parse — computes a file delta via content hashes, then only
   * re-parses added/changed files and deletes removed ones from the graph.
   *
   * Returns the delta, the incremental parse result, and graph persistence stats.
   * If the delta is empty, no parsing or persistence is performed.
   */
  async incrementalParse(
    root: string,
    repoId: string,
    repoName: string,
    onProgress?: (stage: string, detail?: string) => void,
  ): Promise<{
    delta: FileDelta;
    result: BatchParseResult | null;
    graphStats: { nodesCreated: number; relationshipsCreated: number; nodesRemoved: number } | null;
    skipped: boolean;
  }> {
    const startedAt = Date.now();
    await this.registry.initialize();

    // 1. Compute delta
    onProgress?.('diffing', 'Comparing file hashes...');
    const { delta, stats } = await this.incrementalSync.computeDelta(repoId, root);

    if (delta.added.length === 0 && delta.changed.length === 0 && delta.removed.length === 0) {
      this.logger.log(`Incremental sync: nothing changed (${delta.unchanged.length} files unchanged)`);
      return { delta, result: null, graphStats: null, skipped: true };
    }

    this.logger.log(
      `Incremental sync delta: +${delta.added.length} added, ` +
      `~${delta.changed.length} changed, -${delta.removed.length} removed`,
    );

    // 2. Parse only added + changed files
    const filesToParse = [...delta.added, ...delta.changed];
    onProgress?.('parsing', `Reparsing ${filesToParse.length} changed files...`);
    const result = await this.parseAllFiles(root, filesToParse);

    // 3. Persist incrementally (upsert added/changed, delete removed)
    onProgress?.('persisting', 'Updating graph...');
    const graphStats = await this.writer.persistIncremental(
      result, delta.removed, repoId, repoName,
    );

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `Incremental sync complete in ${durationMs}ms: ` +
      `${result.stats.filesParsed} files reparsed, ` +
      `${result.stats.entitiesExtracted} entities, ` +
      `${graphStats.nodesRemoved} nodes removed`,
    );

    return { delta, result, graphStats, skipped: false };
  }

  // ── File discovery ──────────────────────────────────────────────────────

  private async discoverFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    await this.walk(root, '', files);
    return files;
  }

  private async walk(current: string, relative: string, files: string[]): Promise<void> {
    if (files.length >= MAX_FILES) return;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
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
      const normalized = posix.normalize(path);
      try {
        const abs = join(current, entry.name);
        const s = await stat(abs);
        if (s.size > MAX_FILE_BYTES || s.size === 0) continue;
      } catch {
        continue;
      }
      if (isParseableFile(normalized) && !shouldSkipFile(normalized)) {
        files.push(normalized);
      }
    }
  }

  // ── Parsing ──────────────────────────────────────────────────────────────

  private async parseAllFiles(root: string, filePaths: string[]): Promise<BatchParseResult> {
    const allSymbols: ParsedSymbol[] = [];
    const allRelationships: ParsedRelationship[] = [];
    const allDiagnostics: ParserDiagnostic[] = [];
    const parsedFiles: ParsedFileMeta[] = [];
    const langDist: Record<string, number> = {};
    const sourceByPath = new Map<string, string>();
    let filesParsed = 0;
    let filesFailed = 0;
    let filesSkipped = 0;

    const fileIds = new Map<string, string>();
    for (const p of filePaths) fileIds.set(p, `file:${p}`);

    for (const filePath of filePaths) {
      const language = detectLanguage(filePath);
      langDist[language] = (langDist[language] ?? 0) + 1;

      const adapter = this.registry.getAdapterForFile(filePath);
      if (!adapter) {
        filesSkipped++;
        continue;
      }

      try {
        const abs = join(root, filePath);
        const s = await stat(abs);
        if (s.size > PARSE_MAX_BYTES) {
          filesSkipped++;
          continue;
        }

        const source = await readFile(abs, 'utf8');
        sourceByPath.set(filePath, source);
        const context: ParseContext = {
          filePath,
          source,
          allFilePaths: filePaths,
          fileIds,
        };

        const result: ParseResult = adapter.parse(context);

        parsedFiles.push(result.file);
        allSymbols.push(...result.symbols);
        allRelationships.push(...result.relationships);
        allDiagnostics.push(...result.diagnostics);
        filesParsed++;
      } catch (err) {
        allDiagnostics.push({
          file: filePath,
          language,
          severity: DiagnosticSeverity.ERROR,
          message: `Failed to read/parse: ${(err as Error).message}`,
          parser: adapter.constructor.name,
        });
        filesFailed++;
      }
    }

    // ── Cross-language dependency resolution ──────────────────────────────
    // Runs AFTER per-file parsing to detect inter-language edges.
    const crossLangSources = new Map<string, string>();
    for (const [filePath, source] of sourceByPath) {
      crossLangSources.set(filePath, source);
    }
    const crossLangCtx: CrossLanguageContext = {
      files: parsedFiles,
      symbols: allSymbols,
      parsedPaths: new Set(parsedFiles.map((f) => f.path)),
      sources: crossLangSources,
    };
    const crossLangRels = resolveCrossLanguageDeps(crossLangCtx);
    allRelationships.push(...crossLangRels);

    return {
      files: parsedFiles,
      symbols: allSymbols,
      relationships: allRelationships,
      diagnostics: allDiagnostics,
      languageDistribution: langDist,
      stats: {
        filesDiscovered: filePaths.length,
        filesParsed,
        filesFailed,
        filesSkipped,
        entitiesExtracted: allSymbols.length,
        relationshipsExtracted: allRelationships.length,
        parseErrors: allDiagnostics.filter((d) => d.severity === DiagnosticSeverity.ERROR).length,
        parseDurationMs: 0, // Set by caller
      },
    };
  }

  // ── Tarball extraction ──────────────────────────────────────────────────

  private async extractTarball(tarball: Buffer): Promise<{
    root: string;
    cleanup: () => Promise<void>;
  }> {
    const dir = await mkdtemp(join(tmpdir(), 'tracegraph-parse-'));
    const tarballPath = join(dir, 'repo.tar.gz');
    await writeFile(tarballPath, tarball);
    await tar.x({ file: tarballPath, cwd: dir, preservePaths: false });

    const entries = await readdir(dir, { withFileTypes: true });
    const firstDir = entries.find((e) => e.isDirectory());
    const root = firstDir ? join(dir, firstDir.name) : dir;

    return { root, cleanup: () => rm(dir, { recursive: true, force: true }) };
  }
}
