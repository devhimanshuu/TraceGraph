import type { Request, Response } from 'express';

export interface CookieOptions {
  /** Lifetime in seconds. */
  maxAge?: number;
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  path?: string;
}

/** Reads a single cookie from the raw Cookie header (no cookie-parser needed). */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) {
      continue;
    }
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Serializes a Set-Cookie header directly (no cookie-parser needed). */
export function setCookie(
  response: Response,
  name: string,
  value: string,
  options: CookieOptions = {},
): void {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);
  }
  if (options.secure) {
    parts.push('Secure');
  }
  parts.push(`Path=${options.path ?? '/'}`);
  response.setHeader('Set-Cookie', parts.join('; '));
}

/** Expires a cookie immediately. */
export function clearCookie(response: Response, name: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  setCookie(response, name, '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
  });
}

/**
 * Extracts the session token from a request: `Authorization: Bearer` first
 * (API tooling, tests, the browser after bootstrap), then the `tg_session`
 * cookie (OAuth callback bootstrap, server middleware gating).
 */
export function extractSessionToken(request: Request, cookieName: string): string | null {
  const header = request.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) {
      return token;
    }
  }
  return readCookie(request, cookieName);
}
