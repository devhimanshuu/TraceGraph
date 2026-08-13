import type { ApiError, AppHealth, DatabaseHealth } from '@tracegraph/shared';

/**
 * Central API client. All frontend → NestJS communication goes through here;
 * the frontend never talks to CognoDB directly (Phase 1 architecture rule).
 *
 * Base URL comes from NEXT_PUBLIC_API_URL. The localhost default is a
 * development convenience only — production deployments must set the
 * environment variable.
 */
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    throw new ApiRequestError('Network error while contacting the API', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    let error: ApiError | undefined;
    try {
      error = (await response.json()) as ApiError;
    } catch {
      // Non-JSON error body — fall through to the generic message.
    }
    throw new ApiRequestError(
      typeof error?.message === 'string' ? error.message : `Request failed (${response.status})`,
      response.status,
      error?.code ?? 'HTTP_ERROR',
    );
  }

  return (await response.json()) as T;
}

export const apiClient = {
  getAppHealth: () => request<AppHealth>('/health'),
  getDatabaseHealth: () => request<DatabaseHealth>('/health/database'),
};
