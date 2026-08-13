/**
 * Provider token for the Neo4j driver singleton.
 *
 * The DatabaseModule provides the driver (created once from validated
 * configuration) under this token; DatabaseService consumes it. Consumers can
 * override this provider in tests with a mock driver.
 */
export const DATABASE_DRIVER = 'COGNODB_DRIVER';
