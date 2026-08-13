/**
 * Database-layer types shared within the API.
 *
 * The public domain contracts (AppHealth, DatabaseHealth, ApiError, node and
 * relationship types) live in `@tracegraph/shared`.
 */

/** Parameter bag for Cypher queries. Values must be parameterized — never interpolated. */
export type QueryParams = Record<string, unknown>;

/** Thrown by DatabaseService whenever CognoDB is unreachable or a query fails. */
export class DatabaseUnavailableException extends Error {
  constructor(message = 'CognoDB is unavailable') {
    super(message);
    this.name = 'DatabaseUnavailableException';
  }
}
