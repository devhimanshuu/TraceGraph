import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CLERK_VERIFY_TOKEN, IS_PUBLIC_KEY } from './auth.constants';

export type TokenVerifier = (token: string) => Promise<Record<string, unknown>>;

/**
 * Global authentication guard. Every route requires a valid Clerk session
 * token unless it carries `@Public()`.
 *
 * Fail-closed semantics: a missing `Authorization` header, an unparseable
 * token, a failed signature check, or an unconfigured verifier all yield
 * `401 Unauthorized` — the API never silently serves data without a session.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(CLERK_VERIFY_TOKEN) private readonly verifyToken: TokenVerifier | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('A valid session is required to access this resource.');
    }

    if (!this.verifyToken) {
      // No CLERK_SECRET_KEY configured — deny rather than degrade silently.
      this.logger.warn('Rejecting authenticated request: CLERK_SECRET_KEY is not configured.');
      throw new UnauthorizedException('Authentication is not configured on this instance.');
    }

    try {
      const claims = await this.verifyToken(token);
      // Attach the verified session claims for downstream handlers/services.
      (request as Request & { user?: unknown }).user = claims;
      return true;
    } catch {
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return null;
    }
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
  }
}
