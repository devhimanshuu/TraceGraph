import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AuthConfig } from '../config/configuration';

/** Identity claims attached to every authenticated request. */
export interface SessionUser {
  /** GitHub user id. */
  id: string;
  /** GitHub handle. */
  login: string;
  /** Display name (falls back to the handle). */
  name: string;
  avatarUrl: string;
}

/** A fully verified session: identity + the backend-held GitHub token. */
export interface VerifiedSession {
  user: SessionUser;
  /** GitHub OAuth access token — server-side only, never returned to the browser. */
  ghToken: string;
}

interface StoredSession {
  ghToken: string;
  expiresAt: number;
}

/**
 * Minimal standard-conforming HS256 JWT (RFC 7519) built on `node:crypto` —
 * deliberately dependency-free so the CJS Jest environment and the Next.js
 * edge middleware (which verifies with `jose`) agree on the exact same format.
 */
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const body = base64url(JSON.stringify(payload));
  const data = `${HEADER}.${body}`;
  const signature = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [header, body, signature] = parts;
  const safe = /^[A-Za-z0-9_-]+$/;
  if (!safe.test(header) || !safe.test(body) || !safe.test(signature)) {
    return null;
  }
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const headerJson = JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg?: string };
    if (headerJson.alg !== 'HS256') {
      return null;
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;
    const exp = typeof payload.exp === 'number' ? payload.exp : 0;
    if (exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Issues and verifies TraceGraph's own session tokens (HS256 JWTs).
 *
 * The token the browser holds carries only identity claims plus a random
 * session id. The GitHub access token lives in an in-memory store keyed by
 * that id — it never reaches the browser ("token stays backend-only").
 *
 * Sessions are short-lived and die with the process; re-signing in is the
 * recovery path. Verification is fail-closed: a missing SESSION_SECRET, an
 * expired token, or an unknown session id all yield `null` (401) — never a
 * degraded allow.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<string, StoredSession>();

  constructor(private readonly config: ConfigService) {}

  private get authConfig(): AuthConfig {
    return this.config.get<AuthConfig>('auth') ?? ({} as AuthConfig);
  }

  private get secret(): string {
    return this.authConfig.sessionSecret;
  }

  /** False when SESSION_SECRET is unset — the guard fails closed. */
  get configured(): boolean {
    return this.secret.length > 0;
  }

  /** Signs a session token and stores the GitHub token server-side. */
  async createSession(user: SessionUser, ghToken: string): Promise<string> {
    if (!this.configured) {
      this.logger.warn('Refusing to create a session: SESSION_SECRET is not configured.');
      throw new Error('AUTH_NOT_CONFIGURED');
    }
    const sid = randomUUID();
    const ttlDays = this.authConfig.sessionTtlDays ?? 7;
    const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
    this.sessions.set(sid, { ghToken, expiresAt });

    const now = Math.floor(Date.now() / 1000);
    return signJwt(
      {
        sid,
        sub: user.id,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
        iat: now,
        exp: now + ttlDays * 24 * 60 * 60,
      },
      this.secret,
    );
  }

  /**
   * Verifies a session token end-to-end: signature, expiry, and the server
   * session store. Returns null for any failure — callers must 401.
   */
  async verify(token: string): Promise<VerifiedSession | null> {
    if (!this.configured) {
      return null;
    }
    const payload = verifyJwt(token, this.secret);
    if (!payload) {
      return null;
    }
    const sid = typeof payload.sid === 'string' ? payload.sid : '';
    if (!sid) {
      return null;
    }
    const stored = this.sessions.get(sid);
    if (!stored || stored.expiresAt < Date.now()) {
      return null;
    }
    return {
      user: {
        id: String(payload.sub ?? ''),
        login: String(payload.login ?? ''),
        name: String(payload.name ?? ''),
        avatarUrl: String(payload.avatarUrl ?? ''),
      },
      ghToken: stored.ghToken,
    };
  }

  /** Best-effort revocation — the token also dies at its expiry. */
  async revoke(token: string): Promise<void> {
    const payload = verifyJwt(token, this.secret);
    const sid = typeof payload?.sid === 'string' ? payload.sid : '';
    if (sid) {
      this.sessions.delete(sid);
    }
  }
}
