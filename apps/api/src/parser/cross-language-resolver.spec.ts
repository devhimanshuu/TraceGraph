/**
 * CrossLanguageResolver tests — verifies detection of cross-language
 * dependencies via exec/spawn/subprocess patterns, co-located modules,
 * and build system references.
 */
import { resolveCrossLanguageDeps, type CrossLanguageContext } from './cross-language-resolver';
import { ProgrammingLanguage, RelationshipKind } from './types';

function makeContext(
  files: Array<{ path: string; language: ProgrammingLanguage }>,
  sources: Record<string, string>,
): CrossLanguageContext {
  return {
    files: files.map((f) => ({
      path: f.path,
      language: f.language,
      extension: f.path.split('.').pop() ?? '',
      sizeBytes: 100,
      lineCount: 10,
      contentHash: 'abc123',
    })),
    symbols: [],
    parsedPaths: new Set(files.map((f) => f.path)),
    sources: new Map(Object.entries(sources)),
  };
}

describe('CrossLanguageResolver', () => {
  describe('TypeScript → Python (exec patterns)', () => {
    it('detects exec() calling python script', () => {
      const ctx = makeContext(
        [
          { path: 'src/runner.ts', language: ProgrammingLanguage.TYPESCRIPT },
          { path: 'scripts/process.py', language: ProgrammingLanguage.PYTHON },
        ],
        {
          'src/runner.ts': `import { execSync } from 'child_process';\nexecSync('python scripts/process.py');`,
          'scripts/process.py': 'print("hello")',
        },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      expect(rels.length).toBeGreaterThan(0);
      expect(rels.some((r) =>
        r.fromId === 'file:src/runner.ts' &&
        r.toId === 'file:scripts/process.py' &&
        r.kind === RelationshipKind.CROSS_LANGUAGE,
      )).toBe(true);
    });

    it('detects spawn() calling node script from Python', () => {
      const ctx = makeContext(
        [
          { path: 'src/orchestrator.py', language: ProgrammingLanguage.PYTHON },
          { path: 'tools/build.js', language: ProgrammingLanguage.JAVASCRIPT },
        ],
        {
          'src/orchestrator.py': `import subprocess\nsubprocess.run(['node', 'tools/build.js'])`,
          'tools/build.js': 'console.log("building")',
        },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      expect(rels.some((r) =>
        r.fromId === 'file:src/orchestrator.py' &&
        r.toId === 'file:tools/build.js' &&
        r.kind === RelationshipKind.CROSS_LANGUAGE,
      )).toBe(true);
    });
  });

  describe('Python → TypeScript (subprocess patterns)', () => {
    it('detects os.system() calling node', () => {
      const ctx = makeContext(
        [
          { path: 'scripts/deploy.py', language: ProgrammingLanguage.PYTHON },
          { path: 'tools/validate.ts', language: ProgrammingLanguage.TYPESCRIPT },
        ],
        {
          'scripts/deploy.py': `import os\nos.system('node tools/validate.ts')`,
          'tools/validate.ts': 'console.log("validating")',
        },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      expect(rels.some((r) =>
        r.fromId === 'file:scripts/deploy.py' &&
        r.toId === 'file:tools/validate.ts' &&
        r.kind === RelationshipKind.CROSS_LANGUAGE,
      )).toBe(true);
    });
  });

  describe('Go → Python (exec.Command patterns)', () => {
    it('detects exec.Command() calling python', () => {
      const ctx = makeContext(
        [
          { path: 'cmd/server.go', language: ProgrammingLanguage.GO },
          { path: 'scripts/seed.py', language: ProgrammingLanguage.PYTHON },
        ],
        {
          'cmd/server.go': `import "os/exec"\nfunc init() { exec.Command("python", "scripts/seed.py") }`,
          'scripts/seed.py': 'print("seeding")',
        },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      expect(rels.some((r) =>
        r.fromId === 'file:cmd/server.go' &&
        r.toId === 'file:scripts/seed.py' &&
        r.kind === RelationshipKind.CROSS_LANGUAGE,
      )).toBe(true);
    });
  });

  describe('Co-located same-name modules', () => {
    it('detects same-name files in different languages in the same directory', () => {
      const ctx = makeContext(
        [
          { path: 'services/payment.ts', language: ProgrammingLanguage.TYPESCRIPT },
          { path: 'services/payment.py', language: ProgrammingLanguage.PYTHON },
        ],
        {
          'services/payment.ts': 'export function processPayment() {}',
          'services/payment.py': 'def process_payment(): pass',
        },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      expect(rels.some((r) =>
        r.fromId === 'file:services/payment.ts' &&
        r.toId === 'file:services/payment.py' &&
        r.reason?.includes('co-located'),
      )).toBe(true);
    });

    it('does not add edges for same-language co-located files', () => {
      const ctx = makeContext(
        [
          { path: 'services/payment.ts', language: ProgrammingLanguage.TYPESCRIPT },
          { path: 'services/utils.ts', language: ProgrammingLanguage.TYPESCRIPT },
        ],
        {
          'services/payment.ts': 'export function processPayment() {}',
          'services/utils.ts': 'export function helper() {}',
        },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      expect(rels.filter((r) => r.kind === RelationshipKind.CROSS_LANGUAGE)).toHaveLength(0);
    });
  });

  describe('No false positives', () => {
    it('does not detect cross-language deps for isolated files', () => {
      const ctx = makeContext(
        [
          { path: 'src/app.ts', language: ProgrammingLanguage.TYPESCRIPT },
          { path: 'backend/server.py', language: ProgrammingLanguage.PYTHON },
        ],
        {
          'src/app.ts': 'const x = 1;',
          'backend/server.py': 'x = 1',
        },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      expect(rels.filter((r) => r.kind === RelationshipKind.CROSS_LANGUAGE)).toHaveLength(0);
    });

    it('does not add edges between files of the same language', () => {
      const ctx = makeContext(
        [
          { path: 'src/a.ts', language: ProgrammingLanguage.TYPESCRIPT },
          { path: 'src/b.ts', language: ProgrammingLanguage.TYPESCRIPT },
        ],
        {
          'src/a.ts': 'exec("node b.ts")',
          'src/b.ts': 'console.log("b")',
        },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      expect(rels.filter((r) => r.kind === RelationshipKind.CROSS_LANGUAGE)).toHaveLength(0);
    });

    it('returns empty for single-language repos', () => {
      const ctx = makeContext(
        [{ path: 'src/app.ts', language: ProgrammingLanguage.TYPESCRIPT }],
        { 'src/app.ts': 'const x = 1;' },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      expect(rels).toHaveLength(0);
    });
  });

  describe('Deduplication', () => {
    it('does not produce duplicate edges', () => {
      const ctx = makeContext(
        [
          { path: 'src/runner.ts', language: ProgrammingLanguage.TYPESCRIPT },
          { path: 'scripts/build.py', language: ProgrammingLanguage.PYTHON },
        ],
        {
          'src/runner.ts': `exec('python scripts/build.py')\nos.system('python scripts/build.py')`,
          'scripts/build.py': 'print("building")',
        },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      const crossRels = rels.filter((r) => r.kind === RelationshipKind.CROSS_LANGUAGE);
      // Should be exactly 1 edge, not duplicated
      expect(crossRels).toHaveLength(1);
    });
  });

  describe('Edge metadata', () => {
    it('includes line number and reason', () => {
      const ctx = makeContext(
        [
          { path: 'src/runner.ts', language: ProgrammingLanguage.TYPESCRIPT },
          { path: 'scripts/build.py', language: ProgrammingLanguage.PYTHON },
        ],
        {
          'src/runner.ts': `// Line 1 comment\nexec('python scripts/build.py')`,
          'scripts/build.py': 'print("building")',
        },
      );

      const rels = resolveCrossLanguageDeps(ctx);
      const edge = rels.find((r) =>
        r.fromId === 'file:src/runner.ts' && r.toId === 'file:scripts/build.py',
      );
      expect(edge).toBeDefined();
      expect(edge!.line).toBe(2);
      expect(edge!.reason).toBeTruthy();
      expect(edge!.resolution).toBe('partial');
    });
  });
});
