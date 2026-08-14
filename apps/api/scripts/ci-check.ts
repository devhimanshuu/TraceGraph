/**
 * CI check mode — `tracegraph check <changed files>`.
 *
 * Runs the deterministic blast-radius engine over a set of changed files and
 * prints what a PR touches: direct/indirect dependents, tests to run, and a
 * LOW/MEDIUM/HIGH risk summary. Exit code becomes 1 when the risk meets the
 * `--fail-on` threshold, so the check can gate a CI pipeline.
 *
 * Usage (from apps/api):
 *   npm run ci:check -- apps/api/src/impact/impact.service.ts apps/api/src/impact/impact.repository.ts
 *   npm run ci:check -- --depth 3 --fail-on high apps/api/src/services/payment.service.ts
 *   cat changed-files.txt | npm run ci:check -- --stdin
 *   npm run ci:check -- --json -- files...
 *
 * Reads apps/api/.env for the CognoDB connection (same as the app).
 * Deterministic and graph-driven — no AI, no network calls beyond CognoDB.
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '../src/config/config.module';
import { DatabaseModule } from '../src/database/database.module';
import { IntelligenceModule } from '../src/intelligence/intelligence.module';
import { IntelligenceService } from '../src/intelligence/intelligence.service';

interface CliOptions {
  depth: number;
  failOn: 'none' | 'medium' | 'high';
  json: boolean;
  stdin: boolean;
  files: string[];
}

const SCORE_ORDER: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { depth: 2, failOn: 'none', json: false, stdin: false, files: [] };
  let positional = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (positional) {
      options.files.push(arg);
      continue;
    }
    if (arg === '--') {
      positional = true;
      continue;
    }
    if (arg === '--stdin') {
      options.stdin = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--depth') {
      const value = Number(argv[i + 1]);
      if (Number.isInteger(value) && value >= 1 && value <= 4) options.depth = value;
      i += 1;
      continue;
    }
    if (arg === '--fail-on') {
      const value = argv[i + 1];
      if (value === 'medium' || value === 'high') options.failOn = value;
      i += 1;
      continue;
    }
    options.files.push(arg);
  }
  return options;
}

async function readStdin(): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const files = options.stdin ? await readStdin() : options.files;
  if (files.length === 0) {
    console.error('tracegraph check: no changed files provided. Pass paths or use --stdin.');
    process.exitCode = 2;
    return;
  }

  // ConfigModule (env) + DatabaseModule are global in the app root only; the
  // CLI's testing module must import them explicitly.
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, DatabaseModule, IntelligenceModule],
  }).compile();
  const service = moduleRef.get(IntelligenceService);

  try {
    const [blast, tests] = await Promise.all([
      service.blastRadius({ files, depth: options.depth }),
      service.testsForChange({ entityIds: files, depth: options.depth }),
    ]);

    if (options.json) {
      console.log(JSON.stringify({ blast, tests }, null, 2));
      await moduleRef.close();
      return;
    }

    const { summary } = blast;
    const lines = [
      `tracegraph check — ${summary.changed} file${summary.changed === 1 ? '' : 's'} changed`,
      `  dependents:   ${summary.direct} direct, ${summary.indirect} indirect`,
      `  tests to run: ${summary.tests} potentially affected`,
      `  risk:         ${summary.score}`,
      ...summary.scoreReasons.map((r) => `    • ${r}`),
    ];
    if (blast.unresolved.length > 0) {
      lines.push(`  unresolved:   ${blast.unresolved.length} path(s) not found in the graph (new/ignored files)`);
    }
    if (tests.tests.length > 0) {
      lines.push('  top tests:');
      for (const t of tests.tests.slice(0, 5)) {
        lines.push(`    • ${t.name} (${t.filePath}) — covers ${t.covers} affected, risk ${t.risk}`);
      }
    }
    console.log(lines.join('\n'));

    const threshold = options.failOn === 'high' ? 'HIGH' : options.failOn === 'medium' ? 'MEDIUM' : null;
    if (threshold && SCORE_ORDER[summary.score] >= SCORE_ORDER[threshold]) {
      console.error(`\ntracegraph check FAILED: risk ${summary.score} meets the --fail-on ${options.failOn} threshold.`);
      await moduleRef.close();
      process.exitCode = 1;
      return;
    }
    await moduleRef.close();
  } catch (err) {
    console.error('tracegraph check failed:', err instanceof Error ? err.message : err);
    await moduleRef.close();
    process.exitCode = 1;
  }
}

void main();
