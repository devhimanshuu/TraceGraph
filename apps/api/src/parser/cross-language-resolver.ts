/**
 * CrossLanguageResolver — detects dependencies between files of different
 * programming languages in a polyglot repository.
 *
 * Patterns detected:
 * 1. **Process invocation**: `exec('python script.py')`, `subprocess.run(['node', 'app.js'])`
 *    `child_process.exec('go run main.go')`, `os.system('cargo build')`
 * 2. **Script references**: npm scripts in package.json that invoke other languages,
 *    Makefile targets, docker-compose services
 * 3. **Shared data**: JSON/YAML config files referenced by multiple languages
 * 4. **Shell scripts**: .sh/.bat files that orchestrate multi-language builds
 *
 * The resolver runs AFTER per-file parsing and adds CROSS_LANGUAGE edges to the
 * relationship graph. It never modifies individual file parse results.
 */
import { Logger } from '@nestjs/common';
import {
  ProgrammingLanguage,
  RelationshipKind,
  type ParsedFileMeta,
  type ParsedRelationship,
  type ParsedSymbol,
} from './types';

const logger = new Logger('CrossLanguageResolver');

// ── Process invocation patterns per language ──────────────────────────────

/**
 * Patterns that match process/command invocations referencing other files.
 * Each pattern captures the referenced file path (group 1).
 */
interface InvocationPattern {
  /** Language this pattern applies to. */
  language: ProgrammingLanguage;
  /** Regex with a capture group for the target file path. */
  regex: RegExp;
  /** Human-readable reason for the edge. */
  reason: string;
}

const INVOCATION_PATTERNS: InvocationPattern[] = [
  // ── TypeScript / JavaScript ────────────────────────────────────────────
  // execSync('python script.py'), exec('node app.js')
  {
    language: ProgrammingLanguage.TYPESCRIPT,
    regex: /(?:execSync|exec)\s*\(\s*['"`]((?:python|python3|node|npx|go|cargo|java|php|dotnet|ruby)\s+[\w./-]+\.(?:py|js|ts|go|rs|java|php|cs|rb))['"`]/g,
    reason: 'exec() invokes external language process',
  },
  // spawn('python', ['script.py'])
  {
    language: ProgrammingLanguage.TYPESCRIPT,
    regex: /(?:spawn|spawnSync|fork)\s*\(\s*['"`](python|python3|node|go|cargo|java|php|dotnet)['"`]\s*,\s*\[\s*['"`]([\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'spawn() invokes external language process',
  },
  // child_process.exec('...')
  {
    language: ProgrammingLanguage.TYPESCRIPT,
    regex: /child_process\.(?:exec|execSync|spawn|spawnSync)\s*\(\s*['"`]((?:python|python3|node|go|cargo|java|php|dotnet)\s+[\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'child_process invokes external language',
  },
  // subprocess references in string literals: 'python scripts/build.py'
  {
    language: ProgrammingLanguage.TYPESCRIPT,
    regex: /['"`]((?:python|python3|node|go|cargo|java|php|dotnet)\s+[\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'string references external language script',
  },

  // ── Python ─────────────────────────────────────────────────────────────
  // subprocess.run(['node', 'app.js']), os.system('go run main.go')
  {
    language: ProgrammingLanguage.PYTHON,
    regex: /subprocess\.\w+\s*\(\s*\[(?:\s*['"`](?:node|npx|python|python3|go|cargo|java|php|dotnet)['"`]\s*,\s*)?['"`]([\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'subprocess invokes external language',
  },
  // os.system('python script.py'), os.popen('node app.js')
  {
    language: ProgrammingLanguage.PYTHON,
    regex: /os\.(?:system|popen)\s*\(\s*['"`]((?:python|python3|node|go|cargo|java|php|dotnet)\s+[\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'os.system() invokes external language',
  },
  // Popen(['python', 'script.py'])
  {
    language: ProgrammingLanguage.PYTHON,
    regex: /Popen\s*\(\s*\[['"`](?:python|python3|node|go|cargo|java|php|dotnet)['"`]\s*,\s*['"`]([\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'Popen() invokes external language',
  },
  // Direct path reference: 'scripts/build.py'
  {
    language: ProgrammingLanguage.PYTHON,
    regex: /['"`]((?:scripts?|bin|tools?)\/[\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'references script path in another language',
  },

  // ── Go ─────────────────────────────────────────────────────────────────
  // exec.Command("python", "script.py")
  {
    language: ProgrammingLanguage.GO,
    regex: /exec\.Command\s*\(\s*['"`](python|python3|node|go|cargo|java|php|dotnet)['"`]\s*,\s*['"`]([\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'exec.Command() invokes external language',
  },
  // Direct path in string: "scripts/build.py"
  {
    language: ProgrammingLanguage.GO,
    regex: /['"`]((?:scripts?|bin|tools?)\/[\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'references script path in another language',
  },

  // ── Rust ───────────────────────────────────────────────────────────────
  // Command::new("python").arg("script.py")
  {
    language: ProgrammingLanguage.RUST,
    regex: /Command::new\s*\(\s*['"`](python|python3|node|go|cargo|java|php|dotnet)['"`]\s*\)\s*\.arg\s*\(\s*['"`]([\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'Command::new() invokes external language',
  },

  // ── Java ───────────────────────────────────────────────────────────────
  // Runtime.getRuntime().exec("python script.py")
  {
    language: ProgrammingLanguage.JAVA,
    regex: /Runtime\..*?\.exec\s*\(\s*['"`]((?:python|python3|node|go|cargo|java|php|dotnet)\s+[\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'Runtime.exec() invokes external language',
  },
  // ProcessBuilder("python", "script.py")
  {
    language: ProgrammingLanguage.JAVA,
    regex: /ProcessBuilder\s*\(\s*['"`](?:python|python3|node|go|cargo|java|php|dotnet)['"`]\s*,\s*['"`]([\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'ProcessBuilder invokes external language',
  },

  // ── PHP ────────────────────────────────────────────────────────────────
  // exec('python script.py'), shell_exec('node app.js'), system('go run main.go')
  {
    language: ProgrammingLanguage.PHP,
    regex: /(?:exec|shell_exec|system|passthru)\s*\(\s*['"`]((?:python|python3|node|go|cargo|java|php|dotnet)\s+[\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'shell exec() invokes external language',
  },
  // proc_open('python script.py')
  {
    language: ProgrammingLanguage.PHP,
    regex: /proc_open\s*\(\s*['"`]((?:python|python3|node|go|cargo|java|php|dotnet)\s+[\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'proc_open() invokes external language',
  },

  // ── C# ─────────────────────────────────────────────────────────────────
  // Process.Start("python", "script.py")
  {
    language: ProgrammingLanguage.CSHARP,
    regex: /Process\.Start\s*\(\s*['"`](?:python|python3|node|go|cargo|java|php|dotnet)['"`]\s*,\s*['"`]([\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))['"`]/g,
    reason: 'Process.Start() invokes external language',
  },

  // ── Shell scripts (any language context) ───────────────────────────────
  // Reference to shell scripts from any language
  {
    language: ProgrammingLanguage.UNKNOWN, // matches any file
    regex: /['"`]((?:[\w./-]*\/)?(?:build|deploy|setup|start|run|test|install|compile)[\w.-]*\.(?:sh|bat|cmd|ps1))['"`]/g,
    reason: 'references orchestration shell script',
  },
];

// ── Build file patterns ──────────────────────────────────────────────────

/**
 * Patterns in Makefile, docker-compose, package.json scripts that reference
 * other language files.
 */
interface BuildRefPattern {
  regex: RegExp;
  reason: string;
}

const BUILD_REF_PATTERNS: BuildRefPattern[] = [
  // Makefile: python scripts/build.py, go run cmd/server/main.go
  {
    regex: /(?:python|python3|node|go|cargo|java|php|dotnet)\s+([\w./-]+\.(?:py|js|ts|go|rs|java|php|cs))/g,
    reason: 'build system references external language script',
  },
  // Shell: ./scripts/process.py, bash tools/build.sh
  {
    regex: /(?:\.\/|bash\s+)([\w./-]+\.(?:py|js|ts|go|rs|java|php|cs|sh))/g,
    reason: 'shell invocation references external script',
  },
];

// ── Main resolver ────────────────────────────────────────────────────────

export interface CrossLanguageContext {
  /** All parsed file metadata (path → language mapping). */
  files: ParsedFileMeta[];
  /** All symbols extracted from all files. */
  symbols: ParsedSymbol[];
  /** File paths that were successfully parsed. */
  parsedPaths: Set<string>;
  /** Source content by file path (for pattern matching). */
  sources: Map<string, string>;
}

/**
 * Detect cross-language dependencies and return additional relationships.
 *
 * This runs AFTER individual file parsing and adds edges between files
 * of different languages that invoke or reference each other.
 */
export function resolveCrossLanguageDeps(
  ctx: CrossLanguageContext,
): ParsedRelationship[] {
  const relationships: ParsedRelationship[] = [];
  const seen = new Set<string>();

  // Build file metadata index
  const fileByPath = new Map(ctx.files.map((f) => [f.path, f]));

  for (const [filePath, source] of ctx.sources) {
    const sourceFile = fileByPath.get(filePath);
    if (!sourceFile) continue;
    const sourceLang = sourceFile.language;
    const sourceFileId = `file:${filePath}`;

    // Check invocation patterns
    for (const pattern of INVOCATION_PATTERNS) {
      if (pattern.language !== ProgrammingLanguage.UNKNOWN && pattern.language !== sourceLang) {
        continue;
      }

      // Reset regex lastIndex
      pattern.regex.lastIndex = 0;
      let m: RegExpExecArray | null;

      while ((m = pattern.regex.exec(source)) !== null) {
        // Extract the target file path from the captured groups
        const targetPath = extractTargetPath(m, source, filePath);
        if (!targetPath) continue;

        const targetFile = fileByPath.get(targetPath);
        if (!targetFile) continue;

        // Only add cross-language edges (different languages)
        if (targetFile.language === sourceLang) continue;

        const targetFileId = `file:${targetPath}`;
        const key = `${sourceFileId}|CROSS_LANGUAGE|${targetFileId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        relationships.push({
          fromId: sourceFileId,
          toId: targetFileId,
          kind: RelationshipKind.CROSS_LANGUAGE,
          resolution: 'partial',
          line: source.slice(0, m.index).split('\n').length,
          reason: pattern.reason,
        });
      }
    }

    // Check for references to scripts that aren't in the invocation patterns
    // (e.g., a TS file referencing a Python script path without exec)
    for (const pattern of BUILD_REF_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let m: RegExpExecArray | null;

      while ((m = pattern.regex.exec(source)) !== null) {
        const targetPath = normalizeScriptPath(m[1], filePath);
        if (!targetPath) continue;

        const targetFile = fileByPath.get(targetPath);
        if (!targetFile) continue;
        if (targetFile.language === sourceLang) continue;

        const targetFileId = `file:${targetPath}`;
        const key = `${sourceFileId}|CROSS_LANGUAGE|${targetFileId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        relationships.push({
          fromId: sourceFileId,
          toId: targetFileId,
          kind: RelationshipKind.CROSS_LANGUAGE,
          resolution: 'partial',
          line: source.slice(0, m.index).split('\n').length,
          reason: pattern.reason,
        });
      }
    }
  }

  // Detect shared config files referenced by multiple languages
  const configEdges = detectSharedConfigs(ctx, fileByPath, seen);
  relationships.push(...configEdges);

  logger.log(`Detected ${relationships.length} cross-language dependencies`);
  return relationships;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract the target file path from a regex match.
 * Handles various capture group positions depending on the pattern.
 */
function extractTargetPath(
  match: RegExpExecArray,
  source: string,
  fromPath: string,
): string | null {
  // Try each capture group
  for (let i = 1; i < match.length; i++) {
    const raw = match[i];
    if (!raw) continue;

    // If it contains a space, it's a command like "python script.py"
    const parts = raw.split(/\s+/);
    const candidate = parts.length > 1 ? parts[parts.length - 1] : parts[0];

    // Resolve relative to the source file's directory
    const resolved = normalizeScriptPath(candidate, fromPath);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * Normalize a script path. Tries repo-relative first, then relative to the
 * source file's directory (for `./` prefixed paths).
 */
function normalizeScriptPath(
  rawPath: string,
  fromPath: string,
): string | null {
  if (!rawPath) return null;

  // Skip absolute paths outside the repo
  if (rawPath.startsWith('/')) return null;

  // Strip leading ./
  const cleaned = rawPath.replace(/^\.\//, '');

  // If the path starts with a directory that looks like it's in the repo
  // root (scripts/, tools/, bin/, src/), treat it as repo-relative
  if (/^(?:scripts?|tools?|bin|src|lib|cmd|pkg|internal|app|backend|frontend|services?)\//i.test(cleaned)) {
    return cleaned || null;
  }

  // For relative paths (e.g., ./script.py), resolve relative to the source
  const fromDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const joined = fromDir ? `${fromDir}/${cleaned}` : cleaned;

  // Normalize and clean
  const normalized = joined
    .replace(/\/+/g, '/')
    .replace(/\/\.\//g, '/')
    .replace(/[^/]*\/\.\.\//g, '');

  // Must not escape the repo
  if (normalized.startsWith('..')) return null;

  return normalized || null;
}

/**
 * Detect shared configuration files (package.json, Makefile, docker-compose.yml,
 * etc.) that reference scripts from multiple languages.
 */
function detectSharedConfigs(
  ctx: CrossLanguageContext,
  fileByPath: Map<string, ParsedFileMeta>,
  seen: Set<string>,
): ParsedRelationship[] {
  const relationships: ParsedRelationship[] = [];

  // Build a map of directory → languages present
  const dirLanguages = new Map<string, Set<ProgrammingLanguage>>();
  for (const file of ctx.files) {
    const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    if (!dir) continue;
    const langs = dirLanguages.get(dir) ?? new Set();
    langs.add(file.language);
    dirLanguages.set(dir, langs);
  }

  // Find directories with multiple languages → add implicit CROSS_LANGUAGE edges
  // between the files in those directories (they're part of the same service)
  for (const [dir, langs] of dirLanguages) {
    if (langs.size < 2) continue;

    // Only for directories with a small number of files (to avoid noise)
    const dirFiles = ctx.files.filter((f) => {
      const fDir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
      return fDir === dir;
    });

    if (dirFiles.length > 20) continue; // Too many files, skip

    // For each pair of files in different languages, add a cross-language edge
    // if they share the same base name (e.g., payment.ts and payment.py)
    const byBaseName = new Map<string, ParsedFileMeta[]>();
    for (const file of dirFiles) {
      const baseName = file.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
      const list = byBaseName.get(baseName) ?? [];
      list.push(file);
      byBaseName.set(baseName, list);
    }

    for (const [, files] of byBaseName) {
      if (files.length < 2) continue;
      const hasMultipleLanguages = new Set(files.map((f) => f.language)).size > 1;
      if (!hasMultipleLanguages) continue;

      // Add cross-language edges between files of different languages
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          if (files[i].language === files[j].language) continue;
          const key1 = `file:${files[i].path}|CROSS_LANGUAGE|file:${files[j].path}`;
          const key2 = `file:${files[j].path}|CROSS_LANGUAGE|file:${files[i].path}`;
          if (seen.has(key1) || seen.has(key2)) continue;
          seen.add(key1);

          relationships.push({
            fromId: `file:${files[i].path}`,
            toId: `file:${files[j].path}`,
            kind: RelationshipKind.CROSS_LANGUAGE,
            resolution: 'partial',
            reason: `co-located same-name modules in different languages`,
          });
        }
      }
    }
  }

  return relationships;
}
