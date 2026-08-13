/**
 * Database-layer types shared within the API.
 *
 * The public domain contracts (AppHealth, DatabaseHealth, ApiError, node and
 * relationship types) live in `@tracegraph/shared`.
 */

/** Parameter bag for Cypher queries. Values must be parameterized — never interpolated. */
export type QueryParams = Record<string, unknown>;

/**
 * A transaction-like handle handed to `executeRead`/`executeWrite`/
 * `executeTransaction` work callbacks. Future graph repositories call
 * `tx.run(cypher, params)` and receive normalized records; they never touch
 * driver session lifecycle.
 */
export interface DatabaseTransaction {
  run<T = Record<string, unknown>>(cypher: string, params?: QueryParams): Promise<T[]>;
}

/** Optional metadata/controls for a database operation. */
export interface DatabaseOperationOptions {
  /** Logical operation name — used in logs and error metadata. */
  name?: string;
  /**
   * Safety-net timeout in milliseconds. 0 or negative disables the timeout.
   * Defaults to `database.queryTimeoutMs` from configuration.
   */
  timeoutMs?: number;
}
