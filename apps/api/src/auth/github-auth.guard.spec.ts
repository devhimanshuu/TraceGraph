import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { GitHubAuthGuard } from './github-auth.guard';
import { SessionService, type SessionUser } from './session.service';

const USER: SessionUser = { id: '42', login: 'octocat', name: 'Octo Cat', avatarUrl: '' };

function createContext(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function createGuard(options: {
  sessions?: Partial<SessionService>;
  isPublic?: boolean;
} = {}) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(options.isPublic ?? false);
  const sessions = {
    configured: true,
    verify: async () => ({ user: USER, ghToken: 'gh' }),
    ...options.sessions,
  } as unknown as SessionService;
  return new GitHubAuthGuard(reflector, sessions);
}

describe('GitHubAuthGuard', () => {
  it('allows public routes without a token', async () => {
    const guard = createGuard({ isPublic: true });
    await expect(guard.canActivate(createContext({ headers: {} }))).resolves.toBe(true);
  });

  it('rejects a request with no Authorization header or cookie', async () => {
    const guard = createGuard();
    await expect(guard.canActivate(createContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const guard = createGuard();
    await expect(
      guard.canActivate(createContext({ headers: { authorization: 'Basic abc' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed when no SESSION_SECRET is configured', async () => {
    const guard = createGuard({ sessions: { configured: false } });
    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer whatever' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token the session service cannot verify', async () => {
    const guard = createGuard({ sessions: { verify: async () => null } });
    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer expired-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches verified identity to the request and allows access', async () => {
    const guard = createGuard();
    const request: Request & { user?: unknown } = {
      headers: { authorization: 'Bearer valid-token' },
    } as Request;
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toEqual(USER);
  });

  it('accepts the session cookie as an alternative to the bearer header', async () => {
    const guard = createGuard();
    const request: Request & { user?: unknown } = {
      headers: { cookie: 'tg_session=cookie-token; other=1' },
    } as Request;
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toEqual(USER);
  });

  it('treats an empty Bearer value as missing', async () => {
    const guard = createGuard();
    await expect(
      guard.canActivate(createContext({ headers: { authorization: 'Bearer   ' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
