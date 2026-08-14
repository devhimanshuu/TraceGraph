import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, {
  Neo4jError,
  type Driver,
  type ManagedTransaction,
  type Session,
  type Transaction,
} from 'neo4j-driver';
import type { DatabaseHealth } from '@tracegraph/shared';
import type { AppConfig } from '../config/configuration';
import { DATABASE_DRIVER } from './database.constants';
import {
  DatabaseConnectionError,
  DatabaseError,
  DatabaseErrorKind,
  DatabaseQueryError,
  DatabaseTimeoutError,
  DatabaseTransactionError,
  databaseErrorMessage,
} from './database.errors';
import type { DatabaseOperationOptions, DatabaseTransaction, QueryParams } from './database.types';

/**
 * Minimal Cypher used only for connectivity verification (Task 12/20).
 * No application queries live in the database layer.
 */
const CONNECTIVITY_CHECK_QUERY = 'RETURN 1 AS ok';

/**
 * DatabaseService is the only place in the API that talks to the Neo4j
 * driver / CognoDB. It owns:
 *
 * - the driver lifecycle (created once by DI, closed on shutdown)
 * - connectivity verification (`verifyConnection`)
 * - session management (sessions are always released in `finally`)
 * - read/write/transaction execution abstractions for graph repositories
 * - translation of driver errors into the typed `DatabaseError` taxonomy
 *
 * Design notes:
 * - No application retry framework. The driver itself retries retryable
 *   transient failures inside `executeRead`/`executeWrite` with server
 *   coordination (safe — the server marks which failures are retryable), and
 *   writes are never auto-retried by this layer to avoid duplicate commits.
 * - Query timeouts are a safety net only: on timeout the session is released
 *   and a `DatabaseTimeoutError` is raised. No infinite waits.
 * - Degraded mode: if CognoDB is unreachable at startup the application still
 *   boots; `/api/health/database` reports "down" until connectivity returns.
 *
 * The database layer knows nothing about HTTP or frontend concerns — domain
 * services and graph repositories consume this service.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private connected = false;

  constructor(
    @Inject(DATABASE_DRIVER) private readonly driver: Driver,
    private readonly configService: ConfigService,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    this.logger.log('CognoDB driver initialized');
    const { retries, retryDelayMs } = this.config.database;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const health = await this.verifyConnection();
      if (health.status === 'up') {
        this.logger.log('CognoDB connectivity verified');
        return;
      }
      this.logger.warn(`CognoDB connectivity failed (attempt ${attempt}/${retries})`);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    this.logger.warn(
      'CognoDB is unavailable — starting in degraded mode; /api/health/database reports "down"',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  /** Closes the driver. Idempotent; called on shutdown and usable explicitly. */
  async close(): Promise<void> {
    await this.driver.close();
    this.connected = false;
    this.logger.log('CognoDB driver closed');
  }

  private get config(): AppConfig {
    return this.configService.getOrThrow<AppConfig>('app');
  }

  // ── Connectivity ─────────────────────────────────────────────────────────────

  /**
   * Structured connectivity check. Never throws; returns a sanitized result.
   * Exercises the full stack (auth, session, query) via `RETURN 1`.
   */
  async verifyConnection(): Promise<DatabaseHealth> {
    const started = performance.now();
    try {
      await this.executeRead((tx) => tx.run(CONNECTIVITY_CHECK_QUERY), {
        name: 'connectivity-check',
        timeoutMs: this.config.database.connectTimeoutMs,
      });
      this.connected = true;
      return { status: 'up', latencyMs: Math.round(performance.now() - started) };
    } catch (err) {
      this.connected = false;
      const kind = err instanceof DatabaseError ? err.kind : DatabaseErrorKind.CONNECTION;
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - started),
        error: databaseErrorMessage(kind),
      };
    }
  }

  // ── Execution abstractions ───────────────────────────────────────────────────

  /**
   * Runs read-only work inside a driver-managed read transaction. The driver
   * auto-commits on success and rolls back on error.
   */
  executeRead<T>(
    work: (tx: DatabaseTransaction) => Promise<T>,
    options?: DatabaseOperationOptions,
  ): Promise<T> {
    return this.runInSession('READ', options, (session) =>
      session.executeRead((tx) => work(this.wrapTransaction(tx, options))),
    );
  }

  /**
   * Runs read-write work inside a driver-managed write transaction. The driver
   * auto-commits on success and rolls back on error.
   */
  executeWrite<T>(
    work: (tx: DatabaseTransaction) => Promise<T>,
    options?: DatabaseOperationOptions,
  ): Promise<T> {
    return this.runInSession('WRITE', options, (session) =>
      session.executeWrite((tx) => work(this.wrapTransaction(tx, options))),
    );
  }

  /**
   * Explicit transaction: BEGIN → work → COMMIT, or ROLLBACK on failure.
   * Intended for bulk data operations / seeding, where many related writes must be
   * atomic. No driver-managed auto-retry (explicit control is the point).
   */
  executeTransaction<T>(
    work: (tx: DatabaseTransaction) => Promise<T>,
    options?: DatabaseOperationOptions,
  ): Promise<T> {
    const name = options?.name ?? 'transaction';
    return this.runInSession('WRITE', options, async (session) => {
      let tx: Transaction;
      try {
        tx = session.beginTransaction();
      } catch (err) {
        throw this.translateDriverError(err, name, 'transaction');
      }
      try {
        const result = await work(this.wrapTransaction(tx, options));
        // Commit errors are translated; tx.run errors were already translated
        // by the adapter. Errors thrown by the work callback itself propagate
        // untouched (they are never database errors).
        await tx.commit().catch((err) => {
          throw this.translateDriverError(err, name, 'transaction');
        });
        return result;
      } catch (err) {
        // Roll back best-effort; swallow failures of the rollback itself.
        await tx.rollback().catch(() => undefined);
        throw err;
      }
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  /** Adapts a driver transaction to the narrow `DatabaseTransaction` surface. */
  private wrapTransaction(
    tx: Transaction | ManagedTransaction,
    options?: DatabaseOperationOptions,
  ): DatabaseTransaction {
    const name = options?.name ?? 'anonymous';
    return {
      run: async <T>(cypher: string, params?: QueryParams): Promise<T[]> => {
        const started = performance.now();
        try {
          const result = await tx.run(cypher, params ?? {});
          const records = result.records.map((record) => record.toObject() as T);
          this.logger.debug(
            `[db] ${name} executed (${records.length} records, ${Math.round(performance.now() - started)}ms)`,
          );
          return records;
        } catch (err) {
          throw this.translateDriverError(err, name, 'query');
        }
      },
    };
  }

  /** Owns session acquisition, timeout safety-net, and guaranteed release. */
  private async runInSession<T>(
    mode: 'READ' | 'WRITE',
    options: DatabaseOperationOptions | undefined,
    operation: (session: Session) => Promise<T>,
  ): Promise<T> {
    const name = options?.name ?? 'anonymous';
    let session: Session;
    try {
      session = this.driver.session({
        defaultAccessMode: mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE,
      });
    } catch (err) {
      throw this.translateDriverError(err, name, mode === 'READ' ? 'read' : 'write');
    }

    const started = performance.now();
    try {
      return await this.withTimeout(operation(session), session, options?.timeoutMs, name);
    } catch (err) {
      const duration = Math.round(performance.now() - started);
      if (err instanceof DatabaseError) {
        this.logger.warn(
          `[db] ${name} failed (${duration}ms) kind=${err.kind} operation=${name} ` +
            `message=${err.message}`,
        );
      }
      // Non-database errors (e.g. a repository throwing NotFoundException inside
      // a work callback) propagate untouched — this layer never swallows them.
      throw err;
    } finally {
      // Sessions are ALWAYS released, even when queries or callbacks throw.
      await session.close();
    }
  }

  /**
   * Safety-net timeout around an in-flight operation. `0`/negative disables.
   * On timeout a DatabaseTimeoutError is raised; the enclosing runInSession
   * `finally` releases the session, which abandons the driver-side work. The
   * abandoned promise already has a rejection handler (attached by
   * Promise.race), so no unhandled rejection occurs.
   */
  private async withTimeout<T>(
    operation: Promise<T>,
    _session: Session,
    timeoutMs: number | undefined,
    name: string,
  ): Promise<T> {
    const effective = timeoutMs ?? this.config.database.queryTimeoutMs;
    if (!effective || effective <= 0) {
      return operation;
    }

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new DatabaseTimeoutError(`CognoDB operation "${name}" timed out after ${effective}ms`),
        );
      }, effective);
    });

    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Translates low-level driver errors into the typed `DatabaseError` taxonomy
   * so higher layers never see driver internals.
   */
  private translateDriverError(
    err: unknown,
    operation: string,
    action: 'read' | 'write' | 'transaction' | 'query',
  ): DatabaseError {
    if (err instanceof DatabaseError) {
      return err;
    }

    if (err instanceof Neo4jError) {
      const code = err.code ?? '';
      if (
        code === neo4j.error.SERVICE_UNAVAILABLE ||
        code === neo4j.error.SESSION_EXPIRED ||
        code === neo4j.error.PROTOCOL_ERROR
      ) {
        return new DatabaseConnectionError(`CognoDB connection failed during "${operation}"`, {
          operation,
          cause: err,
        });
      }
      // Server-side errors (Neo.ClientError.* / Neo.TransientError.* / Neo.DatabaseError.*)
      if (action === 'transaction') {
        return new DatabaseTransactionError(`CognoDB transaction "${operation}" failed`, {
          operation,
          cause: err,
        });
      }
      return new DatabaseQueryError(`CognoDB query "${operation}" failed`, {
        operation,
        cause: err,
      });
    }

    // Unknown error shape — treat as a query failure; the original is kept as
    // the cause for server-side diagnostics only.
    return new DatabaseQueryError(`CognoDB operation "${operation}" failed`, {
      operation,
      cause: err,
    });
  }
}
