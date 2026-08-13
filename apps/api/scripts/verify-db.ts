/**
 * Live CognoDB connectivity verification (Phase 3, Task 20).
 *
 * Runs a harmless `RETURN 1` through the real database layer (config →
 * driver → session → query) and exits 0/1 based on the result.
 *
 * Usage:  npm run db:check  (from apps/api or the repo root)
 *
 * Requires a valid apps/api/.env with COGNODB_URI/USERNAME/PASSWORD.
 * Does NOT create data, schema, or seed anything.
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '../src/config/config.module';
import { DatabaseModule, DatabaseService } from '../src/database';

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, DatabaseModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);

  console.log('Verifying CognoDB connectivity…');
  const health = await database.verifyConnection();
  console.log(JSON.stringify(health, null, 2));

  await moduleRef.close();

  if (health.status !== 'up') {
    console.error('CognoDB connectivity check FAILED.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('CognoDB connectivity check failed unexpectedly:', err);
  process.exitCode = 1;
});
