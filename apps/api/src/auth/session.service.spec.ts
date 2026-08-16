import { ConfigService } from '@nestjs/config';
import type { AuthConfig } from '../config/configuration';
import type { SessionRepository, StoredSession } from './session.repository';
import { SessionService } from './session.service';

const AUTH: AuthConfig = {
  githubClientId: '',
  githubClientSecret: '',
  githubRedirectUri: 'http://localhost:4000/api/auth/github/callback',
  sessionSecret: 'unit-test-secret',
  sessionTtlDays: 7,
  webAppUrl: 'http://localhost:3000',
};

/** In-memory stand-in for the CognoDB-backed SessionRepository. */
function createFakeRepository() {
  const store = new Map<string, StoredSession>();
  const repository = {
    store,
    ensureConstraint: jest.fn(async () => undefined),
    create: jest.fn(async (session: StoredSession) => {
      store.set(session.sid, session);
    }),
    findBySid: jest.fn(async (sid: string) => store.get(sid) ?? null),
    deleteBySid: jest.fn(async (sid: string) => {
      store.delete(sid);
    }),
    purgeExpired: jest.fn(async () => undefined),
  } as unknown as SessionRepository & { store: Map<string, StoredSession> };
  return repository;
}

function createService(auth: Partial<AuthConfig> = {}) {
  const config = {
    get: (key: string) => (key === 'auth' ? { ...AUTH, ...auth } : undefined),
  } as unknown as ConfigService;
  const repository = createFakeRepository();
  return { service: new SessionService(config, repository), repository };
}

const USER = { id: '42', login: 'octocat', name: 'Octo Cat', avatarUrl: 'https://x/a.png' };

describe('SessionService', () => {
  it('issues a token that verifies back to the identity and ghToken', async () => {
    const { service } = createService();
    const token = await service.createSession(USER, 'gh-token-abc');

    expect(token.split('.').length).toBe(3); // JWT shape

    const session = await service.verify(token);
    expect(session?.user).toEqual(USER);
    expect(session?.ghToken).toBe('gh-token-abc');
  });

  it('keeps the GitHub token server-side — it never appears in the JWT', async () => {
    const { service } = createService();
    const token = await service.createSession(USER, 'secret-gh-token');

    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(JSON.stringify(payload)).not.toContain('secret-gh-token');
    expect(JSON.stringify(payload)).not.toContain('ghToken');
  });

  it('rejects a tampered token', async () => {
    const { service } = createService();
    const token = await service.createSession(USER, 'gh');
    const tampered = `${token.slice(0, -3)}abc`;
    await expect(service.verify(tampered)).resolves.toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const { service: serviceA } = createService();
    const { service: serviceB } = createService({ sessionSecret: 'other-secret' });
    const token = await serviceA.createSession(USER, 'gh');
    await expect(serviceB.verify(token)).resolves.toBeNull();
  });

  it('fails closed when no SESSION_SECRET is configured', async () => {
    const { service } = createService({ sessionSecret: '' });
    expect(service.configured).toBe(false);
    await expect(service.createSession(USER, 'gh')).rejects.toThrow('AUTH_NOT_CONFIGURED');
    await expect(service.verify('anything')).resolves.toBeNull();
  });

  it('rejects an expired server-side session', async () => {
    const { service, repository } = createService();
    const token = await service.createSession(USER, 'gh');
    // Force the stored session past its expiry — verification must fail.
    const sid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sid;
    repository.store.get(sid)!.expiresAt = Date.now() - 1000;
    await expect(service.verify(token)).resolves.toBeNull();
  });

  it('rejects an unknown session id (valid signature, no server session)', async () => {
    const { service } = createService();
    const token = await service.createSession(USER, 'gh');
    await service.revoke(token);
    await expect(service.verify(token)).resolves.toBeNull();
  });

  it('persists the session to the repository and purges expired ones', async () => {
    const { service, repository } = createService();
    await service.createSession(USER, 'gh');
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.ensureConstraint).toHaveBeenCalledTimes(1);
    expect(repository.purgeExpired).toHaveBeenCalledTimes(1);
  });

  it('ignores garbage when revoking', async () => {
    const { service } = createService();
    await expect(service.revoke('not-a-token')).resolves.toBeUndefined();
  });
});
