/**
 * TEMPORARY — mints an audit session into the shared CognoDB (no HTTP bind)
 * and prints the bearer token. Reuses the exact SessionService path the API
 * validates against. Usage: npx ts-node scripts/mint-session.ts (from apps/api)
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '../src/config/config.module';
import { DatabaseModule } from '../src/database';
import { AuthModule } from '../src/auth/auth.module';
import { SessionService } from '../src/auth/session.service';

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, DatabaseModule, AuthModule],
  }).compile();

  const sessions = moduleRef.get(SessionService);
  const token = await sessions.createSession(
    { id: 'audit-user', login: 'auditor', name: 'Audit User', avatarUrl: '' },
    '',
  );
  console.log(`TG_AUDIT_TOKEN=${token}`);
  await moduleRef.close();
}

main().catch((err) => {
  console.error('mint failed:', err);
  process.exitCode = 1;
});
