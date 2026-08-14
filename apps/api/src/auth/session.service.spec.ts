import { ConfigService } from '@nestjs/config';
import type { AuthConfig } from '../config/configuration';
import { SessionService } from './session.service';

const AUTH: AuthConfig = {
  githubClientId: '',
  githubClientSecret: '',
  githubRedirectUri: 'http://localhost:4000/api/auth/github/callback',
  sessionSecret: 'unit-test-secret',
  sessionTtlDays: 7,
  webAppUrl: 'http://localhost:3000',
};

function createService(auth: Partial<AuthConfig> = {}): SessionService {
  const config = {
    get: (key: string) => (key === 'auth' ? { ...AUTH, ...auth } : undefined),
  } as unknown as ConfigService;
  return new SessionService(config);
}

const USER = { id: '42', login: 'octocat', name: 'Octo Cat', avatarUrl: 'https://x/a.png' };

describe('SessionService', () => {
  it('issues a token that verifies back to the identity and ghToken', async () => {
    const service = createService();
    const token = await service.createSession(USER, 'gh-token-abc');

    expect(token.split('.').length).toBe(3); // JWT shape

    const session = await service.verify(token);
    expect(session?.user).toEqual(USER);
    expect(session?.ghToken).toBe('gh-token-abc');
  });

  it('keeps the GitHub token server-side — it never appears in the JWT', async () => {
    const service = createService();
    const token = await service.createSession(USER, 'secret-gh-token');

    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(JSON.stringify(payload)).not.toContain('secret-gh-token');
    expect(JSON.stringify(payload)).not.toContain('ghToken');
  });

  it('rejects a tampered token', async () => {
    const service = createService();
    const token = await service.createSession(USER, 'gh');
    const tampered = `${token.slice(0, -3)}abc`;
    await expect(service.verify(tampered)).resolves.toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const serviceA = createService();
    const serviceB = createService({ sessionSecret: 'other-secret' });
    const token = await serviceA.createSession(USER, 'gh');
    await expect(serviceB.verify(token)).resolves.toBeNull();
  });

  it('fails closed when no SESSION_SECRET is configured', async () => {
    const service = createService({ sessionSecret: '' });
    expect(service.configured).toBe(false);
    await expect(service.createSession(USER, 'gh')).rejects.toThrow('AUTH_NOT_CONFIGURED');
    await expect(service.verify('anything')).resolves.toBeNull();
  });

  it('rejects an expired server-side session', async () => {
    const service = createService();
    const token = await service.createSession(USER, 'gh');
    // Force the stored session past its expiry — verification must fail.
    const sid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sid;
    (service as unknown as {
      sessions: Map<string, { ghToken: string; expiresAt: number }>;
    }).sessions.set(sid, {
      ghToken: 'gh',
      expiresAt: Date.now() - 1000,
    });
    await expect(service.verify(token)).resolves.toBeNull();
  });

  it('rejects an unknown session id (valid signature, no server session)', async () => {
    const service = createService();
    const token = await service.createSession(USER, 'gh');
    await service.revoke(token);
    await expect(service.verify(token)).resolves.toBeNull();
  });

  it('ignores garbage when revoking', async () => {
    const service = createService();
    await expect(service.revoke('not-a-token')).resolves.toBeUndefined();
  });
});
