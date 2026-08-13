/**
 * Thin bootstrap shared by the CLI database scripts (seed, clear, verify).
 *
 * These scripts run OUTSIDE the NestJS HTTP process, so instead of creating
 * their own Neo4j driver (which would duplicate connection configuration and
 * violate the "one database connection strategy" rule), they boot the real
 * NestJS ConfigModule + DatabaseModule and reuse the application's
 * DatabaseService. This keeps the scripts thin: the same validated
 * configuration, the same driver lifecycle, the same error translation.
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '../src/config/config.module';
import { DatabaseModule, DatabaseService } from '../src/database';

export interface DbBootstrap {
  db: DatabaseService;
  close: () => Promise<void>;
}

export async function bootstrapDb(): Promise<DbBootstrap> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, DatabaseModule],
  }).compile();

  // init() fires onModuleInit (driver connectivity verification) so that
  // close() later runs onModuleDestroy (driver shutdown) symmetrically.
  await moduleRef.init();

  const db = moduleRef.get(DatabaseService);
  return {
    db,
    close: async () => {
      await moduleRef.close();
    },
  };
}
