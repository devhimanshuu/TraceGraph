import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import * as tar from 'tar';

/** Directories never imported (vendor/build/generated). */
export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  '.cache',
  '.turbo',
  '.nx',
  '.venv',
  '__pycache__',
  'target',
  '.idea',
  '.vscode',
  '.yarn',
  '.pnp',
  'vendor',
]);

/** Hard bounds so imports stay demo-scale and the API call finishes. */
export const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 5_000_000;
/** Source files larger than this are counted but not symbol-parsed. */
const PARSE_MAX_BYTES = 500_000;

export interface RepoFile {
  /** Repo-relative path with forward slashes. */
  path: string;
  /** File content when it fits the parse budget. */
  source?: string;
  linesOfCode: number;
  sizeBytes: number;
}

/** Extracts a GitHub tarball into a fresh temp dir. */
export async function extractRepo(
  tarball: Buffer,
): Promise<{ dir: string; root: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'tracegraph-import-'));
  const tarballPath = join(dir, 'repo.tar.gz');
  await writeFile(tarballPath, tarball);
  await tar.x({ file: tarballPath, cwd: dir, preservePaths: false });

  // GitHub tarballs extract into a single `{name}-{sha}/` folder.
  const entries = await readdir(dir, { withFileTypes: true });
  const firstDir = entries.find((entry) => entry.isDirectory());
  const root = firstDir ? join(dir, firstDir.name) : dir;

  return { dir, root, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function walk(
  current: string,
  relative: string,
  files: RepoFile[],
): Promise<void> {
  if (files.length >= MAX_FILES) return;
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= MAX_FILES) return;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walk(
        join(current, entry.name),
        relative ? `${relative}/${entry.name}` : entry.name,
        files,
      );
      continue;
    }
    if (!entry.isFile()) continue;

    const abs = join(current, entry.name);
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    let sizeBytes = 0;
    try {
      sizeBytes = (await stat(abs)).size;
    } catch {
      continue;
    }
    if (sizeBytes > MAX_FILE_BYTES || sizeBytes === 0) {
      continue;
    }

    let source: string | undefined;
    let linesOfCode = 0;
    if (sizeBytes <= PARSE_MAX_BYTES) {
      try {
        source = await readFile(abs, 'utf8');
        linesOfCode = source.split('\n').length;
      } catch {
        continue;
      }
    }
    files.push({ path: posix.normalize(path), source, linesOfCode, sizeBytes });
  }
}

/** Recursively collects repo files (skipping ignored dirs, honoring caps). */
export async function collectRepoFiles(root: string): Promise<RepoFile[]> {
  const files: RepoFile[] = [];
  await walk(root, '', files);
  return files;
}
