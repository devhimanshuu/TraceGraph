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
  // GitHub OAuth App + own-session auth. Every credential is optional — an
  // unconfigured instance fails closed with 401 (never open, never degraded).
  GITHUB_CLIENT_ID: Joi.string().allow('').optional(),
  GITHUB_CLIENT_SECRET: Joi.string().allow('').optional(),
  GITHUB_OAUTH_REDIRECT_URI: Joi.string().uri().optional(),
  SESSION_SECRET: Joi.string().allow('').optional(),
  SESSION_TTL_DAYS: Joi.number().integer().min(1).max(30).default(7),
  WEB_APP_URL: Joi.string().uri().default('http://localhost:3000'),
  // AI explanation (Phase 10). Everything is optional so the deterministic
  // product runs perfectly without any LLM configuration.
  AI_ENABLED: Joi.boolean().default(false),
  AI_PROVIDER: Joi.string().valid('groq').default('groq'),
  AI_MODEL: Joi.string().default('llama-3.3-70b-versatile'),
  // Either AI_API_KEY or the pre-existing GROQ_API_KEY may be used. Never
  // required — an unconfigured provider degrades to a clean 503, not a crash.
  AI_API_KEY: Joi.string().allow('').optional(),
  GROQ_API_KEY: Joi.string().allow('').optional(),
  AI_BASE_URL: Joi.string().uri().optional(),
  AI_MAX_TOKENS: Joi.number().integer().min(1).max(8192).default(1024),
  AI_TIMEOUT_MS: Joi.number().integer().min(100).max(120_000).default(20_000),
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
