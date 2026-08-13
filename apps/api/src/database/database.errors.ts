/**
 * Database error taxonomy.
 *
 * Higher layers (services, exception filters) can distinguish configuration
 * problems from connectivity problems from query failures without touching
 * low-level driver error objects — and without ever leaking driver details
 * to API clients.
 */

export enum DatabaseErrorKind {
  /** Invalid or missing configuration (should normally fail fast at boot). */
  CONFIGURATION = 'CONFIGURATION',
  /** CognoDB unreachable / connection-level failure. */
  CONNECTION = 'CONNECTION',
  /** A Cypher statement failed (syntax, constraint, unsupported feature). */
  QUERY = 'QUERY',
  /** A transaction could not be committed/rolled back cleanly. */
  TRANSACTION = 'TRANSACTION',
  /** The operation exceeded its allotted time and was aborted. */
  TIMEOUT = 'TIMEOUT',
}

export interface DatabaseErrorOptions {
  /** Logical name of the failed operation (for server-side logs). */
  operation?: string;
  /** The original driver error, kept for diagnostics. */
  cause?: unknown;
}

export class DatabaseError extends Error {
  readonly kind: DatabaseErrorKind;
  readonly operation?: string;
  readonly cause?: unknown;

  constructor(kind: DatabaseErrorKind, message: string, options: DatabaseErrorOptions = {}) {
    super(message);
    this.name = 'DatabaseError';
    this.kind = kind;
    this.operation = options.operation;
    this.cause = options.cause;
  }
}

export class DatabaseConfigurationError extends DatabaseError {
  constructor(message: string, options: DatabaseErrorOptions = {}) {
    super(DatabaseErrorKind.CONFIGURATION, message, options);
    this.name = 'DatabaseConfigurationError';
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(message: string, options: DatabaseErrorOptions = {}) {
    super(DatabaseErrorKind.CONNECTION, message, options);
    this.name = 'DatabaseConnectionError';
  }
}

export class DatabaseQueryError extends DatabaseError {
  constructor(message: string, options: DatabaseErrorOptions = {}) {
    super(DatabaseErrorKind.QUERY, message, options);
    this.name = 'DatabaseQueryError';
  }
}

export class DatabaseTransactionError extends DatabaseError {
  constructor(message: string, options: DatabaseErrorOptions = {}) {
    super(DatabaseErrorKind.TRANSACTION, message, options);
    this.name = 'DatabaseTransactionError';
  }
}

export class DatabaseTimeoutError extends DatabaseError {
  constructor(message: string, options: DatabaseErrorOptions = {}) {
    super(DatabaseErrorKind.TIMEOUT, message, options);
    this.name = 'DatabaseTimeoutError';
  }
}

/**
 * Safe, human-readable, user-facing message per error kind. Never contains
 * driver messages, connection strings, credentials, or stack traces.
 */
const SAFE_MESSAGES: Record<DatabaseErrorKind, string> = {
  CONFIGURATION: 'The database is not configured correctly.',
  CONNECTION: 'Unable to connect to the code graph. Please try again later.',
  QUERY: 'A database operation failed.',
  TRANSACTION: 'A database operation failed.',
  TIMEOUT: 'The database request timed out. Please try again.',
};

export function databaseErrorMessage(kind: DatabaseErrorKind): string {
  return SAFE_MESSAGES[kind];
}
