/** Metadata key marking a route as public (no session required). */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Provider token for the token-verification function. Injected so tests can
 * stub verification without touching Clerk's SDK.
 */
export const CLERK_VERIFY_TOKEN = Symbol('CLERK_VERIFY_TOKEN');
