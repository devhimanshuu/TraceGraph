import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  /** Explicit list of allowed browser origins (never '*'). */
  corsOrigins: string[];
  cognodb: {
    uri: string;
    username: string;
    password: string;
  };
  database: {
    retries: number;
    retryDelayMs: number;
  };
  logLevel: string;
}

/**
 * Loads the typed application configuration from environment variables,
 * namespaced as `app` (so consumers use `getOrThrow<AppConfig>('app')`).
 * The Joi schema in `env.validation.ts` guarantees the required values exist
 * and are well-formed before this loader runs.
 */
export default registerAs('app', (): AppConfig => {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '4000', 10),
    corsOrigins: (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    cognodb: {
      uri: process.env.COGNODB_URI ?? '',
      username: process.env.COGNODB_USERNAME ?? '',
      password: process.env.COGNODB_PASSWORD ?? '',
    },
    database: {
      retries: parseInt(process.env.DB_CONNECT_RETRIES ?? '3', 10),
      retryDelayMs: parseInt(process.env.DB_CONNECT_RETRY_DELAY_MS ?? '500', 10),
    },
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
});
