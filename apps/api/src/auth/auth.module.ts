import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { verifyToken as clerkVerifyToken } from '@clerk/backend';
import type { AppConfig } from '../config/configuration';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { CLERK_VERIFY_TOKEN } from './auth.constants';

/**
 * Authentication module — Clerk session verification for the whole API.
 *
 * The verifier is created lazily from `CLERK_SECRET_KEY`; when the key is
 * absent the provider resolves to `null` and the guard fails closed with 401.
 */
@Module({
  providers: [
    {
      provide: CLERK_VERIFY_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secretKey = config.get<AppConfig>('app')?.clerkSecretKey ?? '';
        if (!secretKey) {
          return null;
        }
        return (token: string) => clerkVerifyToken(token, { secretKey });
      },
    },
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
  ],
  exports: [CLERK_VERIFY_TOKEN],
})
export class AuthModule {}
