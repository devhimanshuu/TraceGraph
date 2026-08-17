import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { GitHubAuthService } from './github-auth.service';
import { SessionService } from './session.service';

const AUTH_CONFIG = {
  webAppUrl: 'http://localhost:3001',
  githubClientId: 'client-id',
  githubClientSecret: 'client-secret',
  sessionSecret: 'session-secret',
  sessionTtlDays: 7,
};

describe('AuthController (OAuth callback redirect)', () => {
  let controller: AuthController;
  let github: {
    configured: boolean;
    exchangeCode: jest.Mock;
    fetchUser: jest.Mock;
  };
  let sessions: { configured: boolean; createSession: jest.Mock; revoke: jest.Mock };
  let res: { setHeader: jest.Mock; redirect: jest.Mock };

  beforeEach(async () => {
    github = {
      configured: true,
      exchangeCode: jest.fn().mockResolvedValue('gh-token'),
      fetchUser: jest.fn().mockResolvedValue({
        id: '42',
        login: 'octocat',
        name: 'Octo Cat',
        avatarUrl: '',
      }),
    };
    sessions = {
      configured: true,
      createSession: jest.fn().mockResolvedValue('signed-session-token'),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    res = { setHeader: jest.fn(), redirect: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(AUTH_CONFIG) } },
        { provide: GitHubAuthService, useValue: github },
        { provide: SessionService, useValue: sessions },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  const req = (code: string, state: string, cookie: string | null): Request =>
    ({
      query: { code, state },
      headers: cookie ? { cookie } : {},
    }) as unknown as Request;

  it('sends a successful sign-in straight to /dashboard?auth=success', async () => {
    await controller.callback(
      req('code-1', 'state-1', 'tg_oauth_state=state-1'),
      res as unknown as Response,
    );

    expect(github.exchangeCode).toHaveBeenCalledWith('code-1');
    expect(sessions.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: '42', login: 'octocat' }),
      'gh-token',
    );
    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3001/dashboard?auth=success');
    // The session cookie is set for the browser bootstrap.
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('tg_session=signed-session-token'),
    );
  });

  it('rejects a mismatched CSRF state and stays on the landing page with an error', async () => {
    await controller.callback(
      req('code-1', 'wrong-state', 'tg_oauth_state=expected-state'),
      res as unknown as Response,
    );

    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3001/?auth_error=state');
    expect(github.exchangeCode).not.toHaveBeenCalled();
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it('redirects to the landing page with an error when OAuth is unconfigured', async () => {
    github.configured = false;
    await controller.callback(
      req('code-1', 'state-1', 'tg_oauth_state=state-1'),
      res as unknown as Response,
    );

    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3001/?auth_error=not_configured');
  });

  it('clears the session cookie and revokes the token on logout', async () => {
    const req = {
      headers: { authorization: 'Bearer signed-session-token' },
    } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    await controller.logout(req, res);

    expect(sessions.revoke).toHaveBeenCalledWith('signed-session-token');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('tg_session=; Max-Age=0'),
    );
  });

  it('still clears the cookie when server-side revocation fails (database down)', async () => {
    sessions.revoke = jest.fn().mockRejectedValue(new Error('CognoDB unavailable'));
    const req = {
      headers: { authorization: 'Bearer signed-session-token' },
    } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    // Must resolve (never 500) and still clear the browser session cookie.
    await expect(controller.logout(req, res)).resolves.toBeUndefined();
    expect(sessions.revoke).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('tg_session=; Max-Age=0'),
    );
  });
});
