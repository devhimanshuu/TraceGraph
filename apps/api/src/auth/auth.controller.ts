import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthConfig } from '../config/configuration';
import { Public } from './public.decorator';
import { GitHubAuthService } from './github-auth.service';
import { SESSION_COOKIE } from './github-auth.guard';
import { clearCookie, extractSessionToken, readCookie, setCookie } from './cookies';
import { SessionService, type SessionUser } from './session.service';

/** CSRF state cookie — single-use, short-lived. */
const STATE_COOKIE = 'tg_oauth_state';
const STATE_TTL_SECONDS = 600;

/**
 * GitHub OAuth + session endpoints. All routes are public: the login entry
 * redirects to GitHub, the callback exchanges the code for a session, and
 * /session lets the browser bootstrap its bearer token from the httpOnly
 * cookie. Everything else stays behind the global guard.
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly github: GitHubAuthService,
    private readonly sessions: SessionService,
  ) {}

  private get authConfig(): AuthConfig {
    return this.config.get<AuthConfig>('auth') ?? ({} as AuthConfig);
  }

  /** Kicks off the GitHub OAuth flow (server-side redirect). */
  @Public()
  @Get('github/login')
  login(@Res({ passthrough: true }) res: Response): void {
    if (!this.github.configured || !this.sessions.configured) {
      res.redirect(`${this.authConfig.webAppUrl}/?auth_error=not_configured`);
      return;
    }
    const state = randomUUID();
    setCookie(res, STATE_COOKIE, state, {
      maxAge: STATE_TTL_SECONDS,
      httpOnly: true,
      sameSite: 'lax',
    });
    res.redirect(this.github.getAuthorizeUrl(state));
  }

  /** GitHub redirects here after the user approves. Exchanges code → session. */
  @Public()
  @Get('github/callback')
  async callback(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const expectedState = readCookie(req, STATE_COOKIE);
    // The state cookie is single-use — consume it regardless of the outcome.
    clearCookie(res, STATE_COOKIE);

    if (!code || !state || !expectedState || state !== expectedState) {
      this.logger.warn('Rejecting GitHub callback: missing or mismatched state.');
      res.redirect(`${this.authConfig.webAppUrl}/?auth_error=state`);
      return;
    }
    if (!this.github.configured || !this.sessions.configured) {
      res.redirect(`${this.authConfig.webAppUrl}/?auth_error=not_configured`);
      return;
    }

    try {
      const ghToken = await this.github.exchangeCode(code);
      const user = await this.github.fetchUser(ghToken);
      const token = await this.sessions.createSession(user, ghToken);
      setCookie(res, SESSION_COOKIE, token, {
        maxAge: (this.authConfig.sessionTtlDays ?? 7) * 86_400,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      res.redirect(`${this.authConfig.webAppUrl}/?auth=success`);
    } catch (err) {
      this.logger.error(
        `GitHub OAuth callback failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      res.redirect(`${this.authConfig.webAppUrl}/?auth_error=provider`);
    }
  }

  /**
   * Returns the signed-in user plus the bearer token. The browser calls this
   * right after the OAuth callback (cookie bootstrap) or with its stored
   * bearer token to validate a returning session.
   */
  @Public()
  @Get('session')
  async session(@Req() req: Request): Promise<{ user: SessionUser; token: string }> {
    const token = extractSessionToken(req, SESSION_COOKIE);
    if (!token) {
      throw new UnauthorizedException('A valid session is required to access this resource.');
    }
    const session = await this.sessions.verify(token);
    if (!session) {
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }
    return { user: session.user, token };
  }

  /** Revokes the session and clears the cookie. Client discards its token. */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = extractSessionToken(req, SESSION_COOKIE);
    if (token) {
      await this.sessions.revoke(token);
    }
    clearCookie(res, SESSION_COOKIE);
  }
}
