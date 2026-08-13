/**
 * Provider tokens for the database layer.
 *
 * Phase 2 exposes a single DatabaseService provider. The driver token is
 * reserved for later phases should any consumer need the raw Neo4j driver
 * directly (e.g. a seed script runner or multi-statement transactions).
 */
export const DATABASE_DRIVER = 'COGNODB_DRIVER';
