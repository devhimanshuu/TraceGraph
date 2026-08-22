/**
 * Repository Source — abstraction for where repository files come from.
 *
 * The indexing pipeline never cares whether files came from GitHub, a local
 * directory, or a future S3 bucket. It only sees a SourceWorkspace.
 */
import { Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  readFile,
  readdir,
  stat,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve, relative, posix, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import type { RepositorySourceType } from '@tracegraph/shared';

const execFileAsync = promisify(execFile);

const logger = new Logger('RepositorySource');

// ── Source Workspace ─────────────────────────────────────────────────────────

export interface SourceWorkspace {
  /** Absolute path to the root of the extracted/cloned repository. */
  root: string;
  /** Clean up the workspace after indexing. */
  cleanup: () => Promise<void>;
  /** Default branch name. */
  defaultBranch: string;
  /** Repository description. */
  description: string;
  /** Primary language. */
  language: string;
}

/** Discovered file with metadata. */
export interface DiscoveredFile {
  /** Repo-relative path (forward slashes). */
  path: string;
  /** Absolute path on disk. */
  absolutePath: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Classification. */
  classification: 'SOURCE' | 'TEST' | 'CONFIG' | 'DOCUMENTATION' | 'GENERATED' | 'BINARY' | 'UNKNOWN';
}

// ── Ignore rules ─────────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', 'target', 'vendor',
  '__pycache__', '.venv', 'venv', '.next', 'out', 'tmp', '.cache', '.turbo',
  '.nx', '.yarn', '.pnp', 'Pods', '.gradle', '.maven', '.idea', '.vscode',
  '.tox', 'egg-info', '.eggs', 'pkg',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.woff', '.woff2', '.ttf', '.eot',
  '.lock', '.sum', '.min.js', '.min.css',
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi',
  '.go',
  '.java',
  '.rs',
  '.php', '.phtml',
  '.cs',
  '.rb',
  '.swift',
  '.kt', '.kts',
  '.scala',
  '.sh', '.bash', '.zsh',
  '.sql',
  '.graphql', '.gql',
  '.yaml', '.yml', '.toml', '.json', '.jsonc',
  '.md', '.mdx', '.rst', '.txt',
  '.css', '.scss', '.less',
  '.html', '.htm', '.vue', '.svelte',
  '.proto',
]);

const TEST_PATTERNS = /\.(spec|test|tests|_test|_spec)\./i;

// ── URL validation ───────────────────────────────────────────────────────────

export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  // Support multiple URL formats
  const patterns = [
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
    /^github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
    /^([^/]+)\/([^/]+)$/, // owner/repo shorthand
  ];

  for (const pattern of patterns) {
    const match = url.trim().match(pattern);
    if (match) {
      const owner = match[1];
      const repo = match[2].replace(/\.git$/, '');
      // Basic validation
      if (/^[A-Za-z0-9._-]+$/.test(owner) && /^[A-Za-z0-9._-]+$/.test(repo)) {
        return { owner, repo };
      }
    }
  }
  return null;
}

// ── Source implementations ───────────────────────────────────────────────────

async function prepareGithubPublicSource(
  sourceUrl: string,
): Promise<SourceWorkspace> {
  const parsed = parseGithubUrl(sourceUrl);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${sourceUrl}`);
  }

  const { owner, repo } = parsed;
  const fullName = `${owner}/${repo}`;
  const dir = await mkdtemp(join(tmpdir(), 'tracegraph-idx-'));

  logger.log(`Cloning ${fullName} to ${dir}`);

  try {
    // Shallow clone — only the latest commit, no history
    await execFileAsync('git', [
      'clone',
      '--depth', '1',
      '--single-branch',
      `https://github.com/${fullName}.git`,
      join(dir, 'repo'),
    ], {
      timeout: 120_000, // 2 min max
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });

    const repoDir = join(dir, 'repo');

    // Get default branch from git
    let defaultBranch = 'main';
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: repoDir,
      });
      defaultBranch = stdout.trim();
    } catch {
      // Fallback to main
    }

    // Get repo metadata via GitHub API (public, no auth needed)
    let description = '';
    let language = '';
    try {
      const response = await fetch(
        `https://api.github.com/repos/${fullName}`,
        { headers: { Accept: 'application/vnd.github.v3+json' } },
      );
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        description = String(data.description ?? '');
        language = String(data.language ?? '');
      }
    } catch {
      // Metadata fetch failure is non-fatal
    }

    return {
      root: repoDir,
      defaultBranch,
      description,
      language,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  } catch (err) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `Failed to clone repository ${fullName}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function prepareLocalSource(
  sourceUrl: string,
): Promise<SourceWorkspace> {
  // Local path: validate it exists and is a directory
  const localPath = resolve(sourceUrl.replace(/^file:\/\//, ''));
  try {
    const s = await stat(localPath);
    if (!s.isDirectory()) {
      throw new Error(`Path is not a directory: ${localPath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Directory not found: ${localPath}`);
    }
    throw err;
  }

  return {
    root: localPath,
    defaultBranch: 'local',
    description: `Local repository: ${localPath}`,
    language: '',
    cleanup: async () => { /* Do not delete local directories */ },
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function prepareSource(
  sourceType: RepositorySourceType,
  sourceUrl: string,
): Promise<SourceWorkspace> {
  switch (sourceType) {
    case 'GITHUB_PUBLIC':
      return prepareGithubPublicSource(sourceUrl);
    case 'LOCAL':
      return prepareLocalSource(sourceUrl);
    default:
      throw new Error(`Unsupported source type: ${sourceType}`);
  }
}

/**
 * Discover all files in the workspace, applying ignore rules.
 * Returns files with their classification and metadata.
 */
export async function discoverFiles(
  root: string,
  maxFiles: number = 10_000,
  maxFileSize: number = 5_000_000,
): Promise<DiscoveredFile[]> {
  const files: DiscoveredFile[] = [];
  await walkDir(root, root, files, maxFiles, maxFileSize);
  return files;
}

async function walkDir(
  current: string,
  root: string,
  files: DiscoveredFile[],
  maxFiles: number,
  maxFileSize: number,
): Promise<void> {
  if (files.length >= maxFiles) return;

  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return; // Permission error or not a directory
  }

  for (const entry of entries) {
    if (files.length >= maxFiles) return;

    // Skip ignored directories
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      await walkDir(join(current, entry.name), root, files, maxFiles, maxFileSize);
      continue;
    }

    if (!entry.isFile()) continue;

    const absPath = join(current, entry.name);
    const relPath = normalize(posix.join(
      ...relative(root, absPath).split(/[/\\]/),
    ));

    try {
      const s = await stat(absPath);
      if (s.size === 0 || s.size > maxFileSize) continue;

      const classification = classifyFile(entry.name);
      if (classification === 'BINARY') continue;

      files.push({
        path: relPath,
        absolutePath: absPath,
        sizeBytes: s.size,
        classification,
      });
    } catch {
      continue;
    }
  }
}

function classifyFile(filename: string): DiscoveredFile['classification'] {
  const lower = filename.toLowerCase();
  const ext = lower.includes('.') ? '.' + lower.split('.').pop() : '';

  if (BINARY_EXTENSIONS.has(ext)) return 'BINARY';
  if (TEST_PATTERNS.test(filename)) return 'TEST';
  if (SOURCE_EXTENSIONS.has(ext)) return 'SOURCE';

  // Documentation
  if (['.md', '.mdx', '.rst', '.txt', '.adoc'].includes(ext)) return 'DOCUMENTATION';

  // Config files
  if ([
    '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
    '.env', '.editorconfig', '.prettierrc', '.eslintrc',
  ].includes(ext) || [
    'dockerfile', 'makefile', 'gemfile', 'rakefile',
    '.gitignore', '.dockerignore', '.npmrc', '.nvmrc',
  ].includes(lower)) return 'CONFIG';

  return 'UNKNOWN';
}

/**
 * Compute content hash for a file.
 */
export async function computeContentHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Read file content safely.
 */
export async function readFileContent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}
