import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { GithubImportResult } from '@tracegraph/shared';
import { posix } from 'node:path';
import { DatabaseService } from '../database/database.service';
import { GraphRepository } from '../graph/graph.repository';
import { GithubApiService } from './github-api.service';
import { collectRepoFiles, extractRepo, type RepoFile } from './repo-extractor';
import { parseFile, type ParsedFile, type ParsedSymbol } from './repo-parser';

const NODE_LABELS = [
  'Repository',
  'Directory',
  'File',
  'Class',
  'Function',
  'Test',
  'Commit',
  'PullRequest',
  'Issue',
  'Developer',
] as const;

type EdgeType =
  | 'CONTAINS'
  | 'IMPORTS'
  | 'CALLS'
  | 'EXTENDS'
  | 'TESTS'
  | 'MODIFIES'
  | 'AUTHORED_BY'
  | 'RELATED_TO';

const BATCH_SIZE = 500;

interface Edge {
  from: string;
  to: string;
  /** Label of the source node — lets the write use the unique-constraint index. */
  fromLabel: string;
  /** Label of the target node — lets the write use the unique-constraint index. */
  toLabel: string;
  type: EdgeType;
  props?: Record<string, unknown>;
}

@Injectable()
export class GithubImportService {
  private readonly logger = new Logger(GithubImportService.name);

  constructor(
    private readonly api: GithubApiService,
    private readonly db: DatabaseService,
    private readonly graphRepository: GraphRepository,
  ) {}

  async importRepo(fullName: string, token?: string): Promise<GithubImportResult> {
    const startedAt = Date.now();
    const trimmed = fullName.trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
      throw new BadRequestException('Repository must be in the form owner/name.');
    }

    const meta = await this.api.getRepoMetadata(trimmed, token);
    const branch = String(meta.default_branch ?? 'main');
    const repoName = String(meta.name ?? trimmed.split('/').pop() ?? trimmed);
    const repoId = `repo:${trimmed}`;
    const description = String(meta.description ?? '');
    const language = String(meta.language ?? '');
    const createdAt = String(meta.created_at ?? new Date().toISOString());
    const updatedAt = String(meta.updated_at ?? createdAt);

    const before = await this.snapshotCounts();

    let cleanup: (() => Promise<void>) | undefined;
    let repoFiles: RepoFile[] = [];
    try {
      // ── 1. Download + extract the source tree ────────────────────────────────
      const tarball = await this.api.downloadTarball(trimmed, branch, token);
      const extracted = await extractRepo(tarball);
      cleanup = extracted.cleanup;
      repoFiles = await collectRepoFiles(extracted.root);
      if (repoFiles.length === 0) {
        throw new BadRequestException('No importable files found in this repository.');
      }
      this.logger.log(`Imported ${repoFiles.length} files from ${trimmed}`);

      // ── 2. Parse source files ─────────────────────────────────────────────────
      const parsedByPath = new Map<string, ParsedFile>();
      for (const file of repoFiles) {
        if (!file.source) continue;
        const parsed = parseFile(file.path, file.source);
        if (parsed) parsedByPath.set(file.path, parsed);
      }

      // ── 3. Build the graph model ──────────────────────────────────────────────
      const nodes = new Map<string, { label: string; props: Record<string, unknown> }>();
      const edges: Edge[] = [];

      const addNode = (
        id: string,
        label: string,
        props: Record<string, unknown>,
      ): void => {
        if (!nodes.has(id)) nodes.set(id, { label, props });
      };

      /** Edge helper — resolves endpoint labels so writes stay indexed. */
      const addEdge = (
        from: string,
        to: string,
        type: EdgeType,
        props?: Record<string, unknown>,
      ): void => {
        const fromNode = nodes.get(from);
        const toNode = nodes.get(to);
        if (!fromNode || !toNode) return;
        edges.push({
          from,
          to,
          fromLabel: fromNode.label,
          toLabel: toNode.label,
          type,
          props,
        });
      };

      const fileSet = new Set(repoFiles.map((f) => f.path));

      // Repository
      addNode(repoId, 'Repository', {
        id: repoId,
        name: repoName,
        fullName: trimmed,
        description,
        language,
        defaultBranch: branch,
        createdAt,
        updatedAt,
      });

      // Directories + Files (+ containment edges)
      const dirSet = new Set<string>();
      for (const file of repoFiles) {
        const parts = file.path.split('/');
        const dirPath = parts.slice(0, -1);
        // Build the directory chain + repo/dir/file containment edges.
        let parent = repoId;
        let current = '';
        for (const part of dirPath) {
          current = current ? `${current}/${part}` : part;
          const dirId = `dir:${current}`;
          if (!dirSet.has(dirId)) {
            dirSet.add(dirId);
            addNode(dirId, 'Directory', {
              id: dirId,
              name: part,
              path: current,
            });
            addEdge(parent, dirId, 'CONTAINS');
          }
          parent = dirId;
        }
        const extension = file.path.includes('.')
          ? (file.path.split('.').pop() ?? '')
          : '';
        addNode(`file:${file.path}`, 'File', {
          id: `file:${file.path}`,
          name: file.path.split('/').pop() ?? file.path,
          path: file.path,
          extension,
          language: fileLanguage(file.path),
          linesOfCode: file.linesOfCode,
          category: fileCategory(file.path),
        });
        addEdge(parent, `file:${file.path}`, 'CONTAINS');
      }

      // Symbols (classes/functions) + file symbol indexes for resolution
      const symbolsByFile = new Map<string, Map<string, ParsedSymbol>>();
      const shortIndexByFile = new Map<string, Map<string, string[]>>();
      const importMapByFile = new Map<
        string,
        Map<string, { fileId: string; remote?: string }>
      >();
      const namespaceMapByFile = new Map<string, Map<string, string>>();

      for (const [path, parsed] of parsedByPath) {
        const fileId = `file:${path}`;
        const full = new Map<string, ParsedSymbol>();
        const short = new Map<string, string[]>();
        for (const symbol of parsed.symbols) {
          full.set(symbol.name, symbol);
          const list = short.get(symbol.shortName) ?? [];
          list.push(symbol.name);
          short.set(symbol.shortName, list);
          addNode(`fn:${path}:${symbol.name}`, symbol.kind === 'class' ? 'Class' : 'Function', {
            id: `fn:${path}:${symbol.name}`,
            name: symbol.name,
            ...(symbol.kind === 'class'
              ? {
                  filePath: path,
                  lineStart: symbol.lineStart,
                  lineEnd: symbol.lineEnd,
                }
              : {
                  signature: symbol.signature ?? symbol.name,
                  lineStart: symbol.lineStart,
                  lineEnd: symbol.lineEnd,
                  visibility: symbol.visibility,
                }),
          });
          addEdge(fileId, `fn:${path}:${symbol.name}`, 'CONTAINS');
        }
        symbolsByFile.set(path, full);
        shortIndexByFile.set(path, short);

        const importMap = new Map<string, { fileId: string; remote?: string }>();
        const nsMap = new Map<string, string>();
        const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        for (const imp of parsed.imports) {
          const resolved = resolveImportSpecifier(imp.specifier, dir, fileSet);
          if (!resolved) continue;
          if (imp.namespace) nsMap.set(imp.namespace, resolved);
          if (imp.defaultLocal) importMap.set(imp.defaultLocal, { fileId: resolved });
          for (const named of imp.imported) {
            importMap.set(named.local, { fileId: resolved, remote: named.remote });
          }
        }
        importMapByFile.set(path, importMap);
        namespaceMapByFile.set(path, nsMap);
      }

      // IMPORTS (file → file)
      for (const [path, parsed] of parsedByPath) {
        const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        const seen = new Set<string>();
        for (const imp of parsed.imports) {
          const resolved = resolveImportSpecifier(imp.specifier, dir, fileSet);
          if (resolved && !seen.has(resolved)) {
            seen.add(resolved);
            addEdge(`file:${path}`, `file:${resolved}`, 'IMPORTS');
          }
        }
      }

      // CALLS (function → function) — caller must be a known local function.
      for (const [path, parsed] of parsedByPath) {
        const seen = new Set<string>();
        for (const call of parsed.calls) {
          if (!call.caller) continue;
          const callerId = `fn:${path}:${call.caller}`;
          if (!symbolsByFile.get(path)?.has(call.caller)) continue;
          const target = this.resolveCall(path, call.callee, {
            symbolsByFile,
            shortIndexByFile,
            importMapByFile,
            namespaceMapByFile,
          });
          if (!target) continue;
          const key = `${callerId}|${target}`;
          if (seen.has(key)) continue;
          seen.add(key);
          addEdge(callerId, target, 'CALLS');
        }
      }

      // EXTENDS (class → class)
      for (const [path, parsed] of parsedByPath) {
        for (const ext of parsed.extends) {
          const parent = this.resolveSymbol(path, ext.parent, {
            symbolsByFile,
            shortIndexByFile,
            importMapByFile,
            namespaceMapByFile,
            classOnly: true,
          });
          if (!parent) continue;
          addEdge(`fn:${path}:${ext.className}`, parent, 'EXTENDS');
        }
      }

      // Tests: spec/test files → Test nodes + TESTS edges to matched source functions
      for (const file of repoFiles) {
        if (!/\.(spec|test)\.(ts|tsx|js|jsx)$/i.test(file.path)) continue;
        const sourcePath = matchSourceFile(file.path, fileSet);
        const testId = `test:${file.path}`;
        addNode(testId, 'Test', {
          id: testId,
          name: file.path.split('/').pop() ?? file.path,
          framework: detectFramework(file.source),
          filePath: file.path,
        });
        if (!sourcePath) continue;
        const sourceSymbols = symbolsByFile.get(sourcePath);
        if (!sourceSymbols) continue;
        // One TESTS edge per function in the matched source file.
        for (const symbol of sourceSymbols.values()) {
          if (symbol.kind === 'class') continue;
          addEdge(testId, `fn:${sourcePath}:${symbol.name}`, 'TESTS');
        }
      }

      // ── 4. History (commits / PRs / issues / developers) ──────────────────────
      const commits = await this.api.listCommits(trimmed, token);
      const commitShas = new Set<string>();
      for (const commit of commits.slice(0, 30)) {
        const sha = String(commit.sha ?? '');
        if (!sha) continue;
        commitShas.add(sha);
        const detail = commit.commit as Record<string, unknown> | undefined;
        const author = (detail?.author ?? {}) as Record<string, unknown>;
        addNode(`commit:${sha}`, 'Commit', {
          id: `commit:${sha}`,
          sha,
          message: String(detail?.message ?? ''),
          timestamp: String(author.date ?? new Date().toISOString()),
          branch,
        });
        const login = String(
          ((commit.author as Record<string, unknown> | undefined)?.login ?? ''),
        );
        if (login) {
          addNode(`dev:${login}`, 'Developer', {
            id: `dev:${login}`,
            username: login,
            name: String(author.name ?? login),
          });
          addEdge(`commit:${sha}`, `dev:${login}`, 'AUTHORED_BY');
        }
      }

      // MODIFIES edges (per-commit changed files, bounded to the top commits)
      for (const commit of commits.slice(0, 20)) {
        const sha = String(commit.sha ?? '');
        if (!sha) continue;
        try {
          const detail = await this.api.getCommit(trimmed, sha, token);
          const files = (detail.files ?? []) as Array<Record<string, unknown>>;
          for (const file of files) {
            const filePath = String(file.filename ?? '');
            if (fileSet.has(filePath)) {
              addEdge(`commit:${sha}`, `file:${filePath}`, 'MODIFIES');
            }
          }
        } catch {
          // A missing commit detail must not abort the import.
        }
      }

      // Pull requests + issue links
      const pulls = await this.api.listPulls(trimmed, token);
      const prByNumber = new Map<number, string>();
      for (const pr of pulls) {
        const number = Number(pr.number);
        if (!number) continue;
        const mergedAt = pr.merged_at;
        const prId = `pr:${number}`;
        prByNumber.set(number, prId);
        addNode(prId, 'PullRequest', {
          id: prId,
          number,
          title: String(pr.title ?? ''),
          status: pr.merged ? 'merged' : String(pr.state ?? 'open'),
          createdAt: String(pr.created_at ?? ''),
          ...(mergedAt ? { mergedAt: String(mergedAt) } : {}),
        });
        // Link PR → commits it merged (when we have them).
        const head = (pr.head ?? {}) as Record<string, unknown>;
        const headSha = String(head.sha ?? '');
        const mergeSha = String(pr.merge_commit_sha ?? '');
        for (const sha of [mergeSha, headSha]) {
          if (sha && commitShas.has(sha)) {
            addEdge(prId, `commit:${sha}`, 'CONTAINS');
          }
        }
      }

      const issues = await this.api.listIssues(trimmed, token);
      for (const issue of issues) {
        const number = Number(issue.number);
        if (!number) continue;
        addNode(`issue:${number}`, 'Issue', {
          id: `issue:${number}`,
          number,
          title: String(issue.title ?? ''),
          status: String(issue.state ?? 'open'),
          createdAt: String(issue.created_at ?? ''),
        });
        const linkedPr = prByNumber.get(number);
        if (linkedPr) {
          addEdge(`issue:${number}`, linkedPr, 'RELATED_TO');
        }
      }

      // ── 5. Persist ─────────────────────────────────────────────────────────────
      await this.ensureConstraints();
      await this.writeNodes(nodes);
      await this.writeEdges(edges);
      // The imported repository becomes the active one — the app surfaces it
      // everywhere (dashboard, graph root, history) until the user switches.
      await this.graphRepository.markRepositoryActive(repoId);
    } finally {
      if (cleanup) await cleanup();
    }

    const after = await this.snapshotCounts();

    return {
      fullName: trimmed,
      repositoryId: repoId,
      nodesCreated: Math.max(after.nodes - before.nodes, 0),
      relationshipsCreated: Math.max(after.relationships - before.relationships, 0),
      files: repoFiles.length,
      functions: Math.max(after.labels.Function - before.labels.Function, 0),
      classes: Math.max(after.labels.Class - before.labels.Class, 0),
      tests: Math.max(after.labels.Test - before.labels.Test, 0),
      commits: Math.max(after.labels.Commit - before.labels.Commit, 0),
      pullRequests: Math.max(after.labels.PullRequest - before.labels.PullRequest, 0),
      issues: Math.max(after.labels.Issue - before.labels.Issue, 0),
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Resolution helpers ───────────────────────────────────────────────────────

  private resolveCall(path: string, callee: string, ctx: ResolutionContext): string | null {
    const parts = callee.split('.');
    if (parts.length === 1) {
      const full = this.resolveShort(path, callee, ctx);
      return full ? `fn:${full.filePath}:${full.name}` : null;
    }
    if (parts.length !== 2) return null;
    const [obj, prop] = parts;
    if (obj === 'this') return null;

    // Same-file class method: `Bar.baz()`
    const local = this.resolveShort(path, obj, ctx);
    if (local && local.kind === 'class') {
      const method = `${obj}.${prop}`;
      const methodSymbol = this.symbolIn(path, method, ctx);
      return methodSymbol ? `fn:${path}:${method}` : null;
    }

    // Namespace import: `ns.helper()`
    const nsFile = ctx.namespaceMapByFile.get(path)?.get(obj);
    if (nsFile) {
      const target = this.resolveShort(nsFile, prop, ctx);
      return target ? `fn:${target.filePath}:${target.name}` : null;
    }

    // Imported default/named: `Foo.bar()` where Foo is an imported class
    const imported = ctx.importMapByFile.get(path)?.get(obj);
    if (imported) {
      const targetClass = this.resolveShort(imported.fileId, obj, ctx);
      if (targetClass && targetClass.kind === 'class') {
        const method = `${targetClass.name}.${prop}`;
        return this.symbolIn(targetClass.filePath, method, ctx)
          ? `fn:${targetClass.filePath}:${method}`
          : null;
      }
    }
    return null;
  }

  private resolveSymbol(
    path: string,
    raw: string,
    ctx: ResolutionContext & { classOnly?: boolean },
  ): string | null {
    const parts = raw.split('.');
    const name = parts[parts.length - 1] ?? raw;
    let resolved:
      | { filePath: string; name: string; kind: 'function' | 'class' | 'method' }
      | null = null;

    if (parts.length === 1) {
      resolved = this.resolveShort(path, name, ctx);
    } else {
      // Namespace / object-qualified: `ns.Base`
      const nsFile = ctx.namespaceMapByFile.get(path)?.get(parts[0]);
      if (nsFile) resolved = this.resolveShort(nsFile, name, ctx);
      if (!resolved) {
        const imported = ctx.importMapByFile.get(path)?.get(parts[0]);
        if (imported) resolved = this.resolveShort(imported.fileId, name, ctx);
      }
    }
    if (!resolved || (ctx.classOnly && resolved.kind !== 'class')) return null;
    return `fn:${resolved.filePath}:${resolved.name}`;
  }

  private resolveShort(
    path: string,
    short: string,
    ctx: ResolutionContext,
  ): { filePath: string; name: string; kind: 'function' | 'class' | 'method' } | null {
    const candidates = ctx.shortIndexByFile.get(path)?.get(short) ?? [];
    if (candidates.length === 0) return null;
    const full = ctx.symbolsByFile.get(path);
    if (!full) return null;
    // Prefer top-level functions, then a unique method.
    const fn = candidates.find((name) => full.get(name)?.kind === 'function');
    if (fn) return { filePath: path, name: fn, kind: 'function' };
    if (candidates.length === 1) {
      const symbol = full.get(candidates[0]);
      if (symbol) return { filePath: path, name: symbol.name, kind: symbol.kind };
    }
    return null;
  }

  private symbolIn(
    path: string,
    fullName: string,
    ctx: ResolutionContext,
  ): boolean {
    return Boolean(ctx.symbolsByFile.get(path)?.has(fullName));
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  private async ensureConstraints(): Promise<void> {
    for (const label of NODE_LABELS) {
      await this.db.executeWrite(
        (tx) =>
          tx.run(
            `CREATE CONSTRAINT tg_${label.toLowerCase()}_id IF NOT EXISTS FOR (n:\`${label}\`) REQUIRE n.id IS UNIQUE`,
          ),
        { name: `import-constraint-${label.toLowerCase()}` },
      );
    }
  }

  private async writeNodes(
    nodes: Map<string, { label: string; props: Record<string, unknown> }>,
  ): Promise<void> {
    for (const label of NODE_LABELS) {
      const rows = [...nodes.values()]
        .filter((n) => n.label === label)
        .map((n) => ({ id: n.props.id, props: n.props }));
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await this.db.executeWrite(
          (tx) =>
            tx.run(
              `UNWIND $rows AS row\nMERGE (n:\`${label}\` {id: row.id})\nSET n += row.props`,
              { rows: batch },
            ),
          { name: `import-nodes-${label.toLowerCase()}` },
        );
      }
    }
  }

  private async writeEdges(edges: Edge[]): Promise<void> {
    // Group by (type, fromLabel, toLabel) so every MATCH carries label hints
    // and resolves through the per-label unique constraints — unlabeled
    // `{id: ...}` scans time out once the graph grows past a few thousand nodes.
    const groups = new Map<string, Edge[]>();
    for (const edge of edges) {
      const key = `${edge.type}|${edge.fromLabel}|${edge.toLabel}`;
      const group = groups.get(key) ?? [];
      group.push(edge);
      groups.set(key, group);
    }

    for (const [key, group] of groups) {
      const [type, fromLabel, toLabel] = key.split('|') as [EdgeType, string, string];
      const rows = group.map((e) => ({ from: e.from, to: e.to, props: e.props ?? {} }));
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await this.db.executeWrite(
          (tx) =>
            tx.run(
              `UNWIND $rows AS row\nMATCH (a:\`${fromLabel}\` {id: row.from})\nMATCH (b:\`${toLabel}\` {id: row.to})\nMERGE (a)-[r:\`${type}\`]->(b)\nSET r += row.props`,
              { rows: batch },
            ),
          { name: `import-edges-${type.toLowerCase()}-${fromLabel.toLowerCase()}-${toLabel.toLowerCase()}` },
        );
      }
    }
  }

  private async snapshotCounts(): Promise<{
    labels: Record<string, number>;
    nodes: number;
    relationships: number;
  }> {
    const [labels, relationships] = await Promise.all([
      this.graphRepository.countNodesByLabel(),
      this.graphRepository.countTraceGraphRelationships(),
    ]);
    const nodes = Object.values(labels).reduce((sum, n) => sum + n, 0);
    return { labels, nodes, relationships };
  }
}

interface ResolutionContext {
  symbolsByFile: Map<string, Map<string, ParsedSymbol>>;
  shortIndexByFile: Map<string, Map<string, string[]>>;
  importMapByFile: Map<string, Map<string, { fileId: string; remote?: string }>>;
  namespaceMapByFile: Map<string, Map<string, string>>;
}

// ── Standalone helpers ─────────────────────────────────────────────────────────

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

function resolveImportSpecifier(specifier: string, fromDir: string, fileSet: Set<string>): string | null {
  if (!specifier.startsWith('.')) return null; // package/external — skip
  const base = posix.normalize(fromDir ? posix.join(fromDir, specifier) : specifier);
  if (base === '.' || base.startsWith('..')) return null; // escaped the repo
  const candidates = [
    base,
    ...SOURCE_EXTS.map((ext) => `${base}${ext}`),
    ...SOURCE_EXTS.map((ext) => `${base}/index${ext}`),
  ];
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

function matchSourceFile(testPath: string, fileSet: Set<string>): string | null {
  const base = testPath.replace(/\.(spec|test)\.(ts|tsx|js|jsx)$/i, '');
  const candidates = [
    base,
    ...SOURCE_EXTS.map((ext) => `${base}${ext}`),
    ...SOURCE_EXTS.map((ext) => `${base}/index${ext}`),
  ];
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

function detectFramework(source?: string): string {
  if (!source) return 'unknown';
  if (/from ['"]vitest['"]|vitest\/config/.test(source)) return 'vitest';
  if (/from ['"]@jest-environment|jest\.mock|jest\.fn/.test(source)) return 'jest';
  if (/from ['"]@angular\/core\/testing['"]/.test(source)) return 'jasmine';
  if (/require\(['"]vitest['"]\)/.test(source)) return 'vitest';
  return 'jest';
}

function fileLanguage(path: string): string {
  if (/\.tsx?$/.test(path)) return 'TypeScript';
  if (/\.jsx?$/.test(path)) return 'JavaScript';
  if (/\.json$/.test(path)) return 'JSON';
  if (/\.css$/.test(path)) return 'CSS';
  if (/\.(md|mdx)$/.test(path)) return 'Markdown';
  return 'Other';
}

function fileCategory(path: string): string {
  const lower = path.toLowerCase();
  if (/(^|\/)test\/|\.(spec|test)\./.test(lower)) return 'test';
  if (/(^|\/)(controllers?|services?|repositories?|models?|pages?)\//.test(lower)) return 'model';
  if (/\.page\./.test(lower)) return 'page';
  return 'utility';
}


