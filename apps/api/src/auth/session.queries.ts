/**
 * Session persistence queries — the server-side half of each session token.
 *
 * `TraceGraphSession` is deliberately NOT one of the TraceGraph domain labels
 * (Repository, File, Function, ...): the hosted CognoDB instance may be shared
 * with other domains, and sessions are runtime state, not code graph. The
 * label and constraint names keep that boundary explicit.
 */

/** Idempotent uniqueness on sid so concurrent logins can't duplicate a session. */
export const ENSURE_SESSION_CONSTRAINT = `
CREATE CONSTRAINT tg_tracegraphsession_sid IF NOT EXISTS
FOR (s:TraceGraphSession) REQUIRE s.sid IS UNIQUE
`;

/** Creates (or refreshes) the server-side session record. */
export const CREATE_SESSION = `
MERGE (s:TraceGraphSession {sid: $sid})
SET s += $props
RETURN properties(s) AS s
`;

/** Fetches a session record by id. */
export const FIND_SESSION_BY_SID = `
MATCH (s:TraceGraphSession {sid: $sid})
RETURN properties(s) AS s
`;

/** Deletes a session record (revocation). */
export const DELETE_SESSION_BY_SID = `
MATCH (s:TraceGraphSession {sid: $sid})
DELETE s
RETURN count(s) AS deleted
`;

/** Opportunistic sweep of expired session records. */
export const PURGE_EXPIRED_SESSIONS = `
MATCH (s:TraceGraphSession)
WHERE s.expiresAt < $now
DELETE s
RETURN count(s) AS deleted
`;
