import * as Joi from 'joi';

/**
 * Joi schema for the environment. The application fails fast at boot with a
 * readable message when required values are missing or invalid — no silent
 * defaults for credentials.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  CORS_ORIGIN: Joi.string()
    .required()
    .custom((value, helpers) => {
      const origins = String(value)
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
      if (origins.length === 0) {
        return helpers.error('any.required');
      }
      if (origins.some((origin) => origin === '*')) {
        // Joi's types require LanguageMessages here, but plain strings are
        // accepted at runtime — cast is intentional.
        return helpers.message('Wildcard CORS origin "*" is not allowed' as never);
      }
      // IMPORTANT: must return a string. @nestjs/config v4 only writes
      // string/number/boolean values back to process.env — arrays are silently
      // dropped, which would leave configuration.ts unable to read the value.
      return origins.join(',');
    }, 'CORS origin validation'),
  COGNODB_URI: Joi.string()
    .uri({ scheme: ['bolt', 'bolt+s', 'neo4j', 'neo4j+s'] })
    .required(),
  COGNODB_USERNAME: Joi.string().required(),
  COGNODB_PASSWORD: Joi.string().required(),
  DB_CONNECT_RETRIES: Joi.number().integer().min(1).max(10).default(3),
  DB_CONNECT_RETRY_DELAY_MS: Joi.number().integer().min(0).max(10_000).default(500),
  // 0 disables the safety-net timeout.
  DB_CONNECT_TIMEOUT_MS: Joi.number().integer().min(0).max(60_000).default(5_000),
  DB_QUERY_TIMEOUT_MS: Joi.number().integer().min(0).max(120_000).default(10_000),
  LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
}).options({ allowUnknown: true });

/**
 * Validates an environment object (used at boot by ConfigModule and directly
 * by unit tests). Throws a single readable error listing all problems.
 */
export function validateEnv(env: NodeJS.ProcessEnv): void {
  const { error } = envValidationSchema.validate(env, { abortEarly: false });
  if (error) {
    const details = error.details.map((detail) => detail.message).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
}
