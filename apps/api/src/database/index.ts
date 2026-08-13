/**
 * Database layer public surface. Future graph repositories and services
 * import from `../database` — they should never need driver internals.
 */
export { DatabaseModule } from './database.module';
export { DatabaseService } from './database.service';
export { DATABASE_DRIVER } from './database.constants';
export {
  DatabaseConfigurationError,
  DatabaseConnectionError,
  DatabaseError,
  DatabaseErrorKind,
  DatabaseQueryError,
  DatabaseTimeoutError,
  DatabaseTransactionError,
  databaseErrorMessage,
} from './database.errors';
export type { DatabaseOperationOptions, DatabaseTransaction, QueryParams } from './database.types';
