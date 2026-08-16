import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { GitHubAuthGuard } from './github-auth.guard';
import { GitHubAuthService } from './github-auth.service';
import { SessionRepository } from './session.repository';
import { SessionService } from './session.service';

/**
 * Authentication module — GitHub OAuth sign-in issuing TraceGraph's own
 * signed session tokens. The global guard protects every route unless it
 * carries `@Public()`; verification fails closed when SESSION_SECRET or the
 * GitHub OAuth credentials are unconfigured.
 */
@Module({
  controllers: [AuthController],
  providers: [
    SessionService,
    SessionRepository,
    GitHubAuthService,
    {
      provide: APP_GUARD,
      useClass: GitHubAuthGuard,
    },
  ],
  exports: [SessionService],
})
export class AuthModule {}
