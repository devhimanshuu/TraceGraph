import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { type Driver, type Session } from 'neo4j-driver';
import type { AppConfig } from '../config/configuration';
import { DatabaseUnavailableException, type QueryParams } from './database.types';

/**
 * DatabaseService is the only place in the API that talks to the Neo4j
 * driver / CognoDB. It owns the driver lifecycle, connectivity verification,
 * and the mapping of driver errors into the application's database exception.
 *
 * The database layer knows nothing about HTTP or frontend concerns — domain
 * services and graph repositories consume this service.
 *
 * Degraded-mode behavior: if CognoDB is unreachable at startup the application
 * still boots and serves /api/health with database status "down" — the driver
 * re-verifies connectivity lazily on every call.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  private driver: Driver | null = null;
  private connected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connectWithRetry();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      this.connected = false;
      this.logger.log('CognoDB driver closed');
    }
  }

  private get config(): AppConfig {
    return this.configService.getOrThrow<AppConfig>('app');
  }

  private createDriver(): Driver {
    const { uri, username, password } = this.config.cognodb;
    return neo4j.driver(uri, neo4j.auth.basic(username, password), {
      connectionTimeout: 5_000,
      maxConnectionLifetime: 60 * 60 * 1_000,
    });
  }

  private getDriver(): Driver {
    if (!this.driver) {
      this.driver = this.createDriver();
    }
    return this.driver;
  }

  private async connectWithRetry(): Promise<void> {
    const { retries, retryDelayMs } = this.config.database;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        this.driver = this.createDriver();
        await this.driver.verifyConnectivity();
        this.connected = true;
        this.logger.log('Connected to CognoDB');
        return;
      } catch {
        this.connected = false;
        this.logger.warn(
          `CognoDB connectivity check failed (attempt ${attempt}/${retries}) — ` +
            'starting in degraded mode if this is the final attempt',
        );
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }
  }

  /** True if the last connectivity check succeeded. */
  isHealthy(): boolean {
    return this.connected;
  }

  /**
   * Verifies connectivity to CognoDB (used by the health endpoint). Throws
   * DatabaseUnavailableException on failure — callers must handle it.
   */
  async verifyConnectivity(): Promise<void> {
    try {
      await this.getDriver().verifyConnectivity();
      this.connected = true;
    } catch {
      this.connected = false;
      throw new DatabaseUnavailableException();
    }
  }

  /**
   * Runs a read query and returns the raw records. No application Cypher
   * lives here — graph repositories pass fully-parameterized statements in.
   */
  async read<T = Record<string, unknown>>(cypher: string, params?: QueryParams): Promise<T[]> {
    return this.run<T>(cypher, params, 'READ');
  }

  /** Runs a write query (see `read`). */
  async write<T = Record<string, unknown>>(cypher: string, params?: QueryParams): Promise<T[]> {
    return this.run<T>(cypher, params, 'WRITE');
  }

  private async run<T>(
    cypher: string,
    params: QueryParams | undefined,
    mode: 'READ' | 'WRITE',
  ): Promise<T[]> {
    const session = this.getSession(mode);
    try {
      const result = await session.run(cypher, params ?? {});
      return result.records.map((record) => record.toObject() as T);
    } catch (err) {
      // Log full detail server-side; clients only ever see a sanitized 503.
      this.logger.error(
        `CognoDB query failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new DatabaseUnavailableException();
    } finally {
      await session.close();
    }
  }

  private getSession(mode: 'READ' | 'WRITE'): Session {
    return this.getDriver().session({
      defaultAccessMode: mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE,
    });
  }
}
