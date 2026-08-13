import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { type Driver } from 'neo4j-driver';
import type { AppConfig } from '../config/configuration';
import { DATABASE_DRIVER } from './database.constants';
import { DatabaseService } from './database.service';

/**
 * Creates the official Neo4j driver from validated configuration.
 *
 * Note: `neo4j.driver()` is lazy — it does not connect until first use, so
 * creating it here (module init) is cheap. The driver is a DI singleton:
 * created once, reused for the application lifetime, closed on shutdown.
 */
function createDriver(config: AppConfig): Driver {
  const { uri, username, password } = config.cognodb;
  return neo4j.driver(uri, neo4j.auth.basic(username, password), {
    // Hard upper bound on establishing a single connection (avoid infinite waits).
    connectionTimeout: config.database.connectTimeoutMs,
    // Recycle long-lived connections so server-side drops don't linger.
    maxConnectionLifetime: 60 * 60 * 1_000,
  });
}

/**
 * Global database module: the single entry point to CognoDB for every domain
 * module. Marked @Global so future graph repositories can inject
 * DatabaseService without importing the module everywhere.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_DRIVER,
      useFactory: (configService: ConfigService): Driver =>
        createDriver(configService.getOrThrow<AppConfig>('app')),
      inject: [ConfigService],
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
