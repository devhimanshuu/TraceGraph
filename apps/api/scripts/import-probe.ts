/**
 * Live import probe — exercises the real GitHub import pipeline against the
 * live CognoDB instance (no auth needed: public repos import anonymously).
 *
 *   Usage: npx ts-node scripts/import-probe.ts [owner/repo]
 */
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GithubImportService } from '../src/github/github-import.service';
import { GraphRepository } from '../src/graph/graph.repository';

async function main(): Promise<void> {
  const fullName = process.argv[2] ?? 'facebook/react';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const importer = app.get(GithubImportService);
  const graph = app.get(GraphRepository);

  const startedAt = Date.now();
  console.log(`[import-probe] importing ${fullName} …`);
  const result = await importer.importRepo(fullName, '');
  console.log(
    `[import-probe] done in ${Date.now() - startedAt}ms → ${JSON.stringify(result, null, 2)}`,
  );

  const counts = await graph.countNodesByLabel();
  console.log(`[import-probe] live label counts: ${JSON.stringify(counts)}`);

  await app.close();
}

main().catch((err) => {
  console.error('[import-probe] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
