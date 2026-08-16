/**
 * SessionRepository — persists the server-side half of each session token
 * (the GitHub access token + expiry) as `TraceGraphSession` nodes.
 *
 * Sessions live in CognoDB, not process memory: the API runs on serverless
 * Lambda where instances are ephemeral and concurrent, so an in-memory store
 * loses sessions on cold start / scale-out — the browser's JWT would verify,
 * but the server-side record it points to would be gone (the "Your session
 * is invalid or has expired" 401 on the dashboard after a real login).
 *
 * The repository knows nothing about JWT signing or HTTP — it executes the
 * parameterized Cypher and maps records. All lifecycle policy (TTL, purge)
 * lives in SessionService.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { toNumber } from '../graph/mappers';
import {
  CREATE_SESSION,
  DELETE_SESSION_BY_SID,
  ENSURE_SESSION_CONSTRAINT,
  FIND_SESSION_BY_SID,
  PURGE_EXPIRED_SESSIONS,
} from './session.queries';

/** The server-side record behind one session token. */
export interface StoredSession {
  sid: string;
  ghToken: string;
  expiresAt: number;
  createdAt: number;
}

interface SessionRow {
  s?: Record<string, unknown>;
}

function toStoredSession(row: SessionRow): StoredSession | null {
  const s = row.s;
  if (!s || typeof s !== 'object') return null;
  const sid = String(s.sid ?? '');
  if (!sid) return null;
  return {
    sid,
    ghToken: String(s.ghToken ?? ''),
    expiresAt: toNumber(s.expiresAt),
    createdAt: toNumber(s.createdAt),
  };
}

@Injectable()
export class SessionRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Idempotent uniqueness constraint on sid (created before the first write). */
  async ensureConstraint(): Promise<void> {
    await this.db.executeWrite(
      (tx) => tx.run(ENSURE_SESSION_CONSTRAINT),
      { name: 'session-ensure-constraint' },
    );
  }

  /** Stores (or refreshes) the server-side session record. */
  async create(session: StoredSession): Promise<void> {
    await this.db.executeWrite(
      (tx) =>
        tx.run(CREATE_SESSION, {
          sid: session.sid,
          props: {
            ghToken: session.ghToken,
            expiresAt: session.expiresAt,
            createdAt: session.createdAt,
          },
        }),
      { name: 'session-create' },
    );
  }

  /** The stored session for a sid, or null. */
  async findBySid(sid: string): Promise<StoredSession | null> {
    const rows = await this.db.executeRead<SessionRow[]>(
      (tx) => tx.run<SessionRow>(FIND_SESSION_BY_SID, { sid }),
      { name: 'session-find-by-sid' },
    );
    return rows.length ? toStoredSession(rows[0]) : null;
  }

  /** Deletes a session record (revocation). */
  async deleteBySid(sid: string): Promise<void> {
    await this.db.executeWrite(
      (tx) => tx.run(DELETE_SESSION_BY_SID, { sid }),
      { name: 'session-delete-by-sid' },
    );
  }

  /** Sweeps expired session records (called opportunistically on login). */
  async purgeExpired(): Promise<void> {
    await this.db.executeWrite(
      (tx) => tx.run(PURGE_EXPIRED_SESSIONS, { now: Date.now() }),
      { name: 'session-purge-expired' },
    );
  }
}
