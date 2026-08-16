import type { SessionRepository, StoredSession } from '../../src/auth/session.repository';

/**
 * In-memory SessionRepository stand-in for e2e tests. Mirrors the real
 * repository's contract without touching CognoDB (unreachable in the test
 * environment) so real SessionService sign/verify flows stay genuine.
 */
export function createFakeSessionRepository(): SessionRepository {
  const store = new Map<string, StoredSession>();
  return {
    ensureConstraint: async () => undefined,
    create: async (session: StoredSession) => {
      store.set(session.sid, session);
    },
    findBySid: async (sid: string) => store.get(sid) ?? null,
    deleteBySid: async (sid: string) => {
      store.delete(sid);
    },
    purgeExpired: async () => undefined,
  } as unknown as SessionRepository;
}
