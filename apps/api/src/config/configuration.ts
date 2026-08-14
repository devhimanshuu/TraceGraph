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
    /** Startup connectivity retry attempts before entering degraded mode. */
    retries: number;
    retryDelayMs: number;
    /** Hard bound on establishing a connection (ms). */
    connectTimeoutMs: number;
    /** Safety-net timeout for query execution (ms); 0 disables. */
    queryTimeoutMs: number;
  };
  logLevel: string;
}

/**
 * GitHub OAuth App + own-session configuration, read under the `auth`
 * namespace. Every credential is optional — an unconfigured instance fails
 * closed with 401 (never open, never degraded).
 */
export interface AuthConfig {
  githubClientId: string;
  githubClientSecret: string;
  /** Must match the registered GitHub OAuth App callback URL exactly. */
  githubRedirectUri: string;
  /** HMAC secret signing TraceGraph's own session tokens. */
  sessionSecret: string;
  sessionTtlDays: number;
  /** Where the OAuth callback bounces the browser after signing in. */
  webAppUrl: string;
}

/**
 * AI configuration, read under the `ai` namespace. All fields are
 * optional by design — the deterministic product runs perfectly with AI off.
 */
export interface AiConfig {
  /** Master switch — when false the app runs fully without AI (503, not a crash). */
  enabled: boolean;
  provider: 'groq';
  model: string;
  /** Resolved API key (AI_API_KEY takes precedence over GROQ_API_KEY). */
  apiKey: string;
  /** OpenAI-compatible base URL (Groq's endpoint by default). */
  baseUrl: string;
  maxTokens: number;
  timeoutMs: number;
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
      connectTimeoutMs: parseInt(process.env.DB_CONNECT_TIMEOUT_MS ?? '5000', 10),
      queryTimeoutMs: parseInt(process.env.DB_QUERY_TIMEOUT_MS ?? '10000', 10),
    },
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
});

/**
 * GitHub OAuth + session configuration (own auth), namespaced as `auth` so
 * consumers use `getOrThrow<AuthConfig>('auth')`. All credentials are
 * optional: the API fails closed with 401 until they are configured.
 */
export const authConfiguration = registerAs('auth', (): AuthConfig => {
  return {
    githubClientId: process.env.GITHUB_CLIENT_ID ?? '',
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    githubRedirectUri:
      process.env.GITHUB_OAUTH_REDIRECT_URI ??
      'http://localhost:4000/api/auth/github/callback',
    sessionSecret: process.env.SESSION_SECRET ?? '',
    sessionTtlDays: parseInt(process.env.SESSION_TTL_DAYS ?? '7', 10),
    webAppUrl: process.env.WEB_APP_URL ?? 'http://localhost:3000',
  };
});

/**
 * AI configuration, namespaced as `ai` so consumers use
 * `getOrThrow<AiConfig>('ai')`. All fields are optional by design — the
 * deterministic product runs perfectly with AI disabled (AI_ENABLED=false).
 */
export const aiConfiguration = registerAs('ai', (): AiConfig => {
  return {
    enabled: process.env.AI_ENABLED === 'true',
    provider: 'groq',
    model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
    // AI_API_KEY takes precedence when set.
    apiKey: process.env.AI_API_KEY || process.env.GROQ_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL ?? 'https://api.groq.com/openai/v1',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS ?? '1024', 10),
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS ?? '20000', 10),
  };
});
