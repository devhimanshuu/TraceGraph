import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './auth.constants';
import { extractSessionToken } from './cookies';
import { SessionService } from './session.service';

/** Name of the httpOnly session cookie set by the OAuth callback. */
export const SESSION_COOKIE = 'tg_session';

/**
 * Global authentication guard. Every route requires a valid TraceGraph
 * session token (`Authorization: Bearer` or the `tg_session` cookie) unless
 * it carries `@Public()`.
 *
 * Fail-closed semantics: a missing token, an unparseable token, a failed
 * signature check, an expired/unknown session, or an unconfigured
 * SESSION_SECRET all yield `401 Unauthorized` — the API never silently
 * serves data without a session.
 */
@Injectable()
export class GitHubAuthGuard implements CanActivate {
  private readonly logger = new Logger(GitHubAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
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
    const token = extractSessionToken(request, SESSION_COOKIE);

    if (!token) {
      throw new UnauthorizedException('A valid session is required to access this resource.');
    }

    if (!this.sessions.configured) {
      // No SESSION_SECRET configured — deny rather than degrade silently.
      this.logger.warn('Rejecting authenticated request: SESSION_SECRET is not configured.');
      throw new UnauthorizedException('Authentication is not configured on this instance.');
    }

    const session = await this.sessions.verify(token);
    if (!session) {
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }

    // Attach the verified identity for downstream handlers/services.
    (request as Request & { user?: unknown }).user = session.user;
    return true;
  }
}
