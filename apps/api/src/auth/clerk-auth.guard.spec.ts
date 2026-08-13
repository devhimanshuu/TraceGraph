import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ClerkAuthGuard, type TokenVerifier } from './clerk-auth.guard';

function createContext(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function createGuard(options: { verifier?: TokenVerifier | null; isPublic?: boolean } = {}) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(options.isPublic ?? false);
  const guard = new ClerkAuthGuard(reflector, options.verifier ?? null);
  return guard;
}

describe('ClerkAuthGuard', () => {
  it('allows public routes without a token', async () => {
    const guard = createGuard({ isPublic: true });
    await expect(guard.canActivate(createContext({ headers: {} }))).resolves.toBe(true);
  });

  it('rejects a request with no Authorization header', async () => {
    const guard = createGuard({ verifier: async () => ({ sub: 'u' }) });
    await expect(guard.canActivate(createContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const guard = createGuard({ verifier: async () => ({ sub: 'u' }) });
    await expect(
      guard.canActivate(createContext({ headers: { authorization: 'Basic abc' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed when no verifier is configured (no CLERK_SECRET_KEY)', async () => {
    const guard = createGuard({ verifier: null });
    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer whatever' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token the verifier cannot validate', async () => {
    const guard = createGuard({
      verifier: async () => {
        throw new Error('token invalid');
      },
    });
    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer expired-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches verified claims to the request and allows access', async () => {
    const guard = createGuard({
      verifier: async () => ({ sub: 'user_test', userId: 'user_test' }),
    });
    const request: Request & { user?: unknown } = {
      headers: { authorization: 'Bearer valid-token' },
    } as Request;
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 'user_test', userId: 'user_test' });
  });

  it('treats an empty Bearer value as missing', async () => {
    const guard = createGuard({ verifier: async () => ({ sub: 'u' }) });
    await expect(
      guard.canActivate(createContext({ headers: { authorization: 'Bearer   ' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
