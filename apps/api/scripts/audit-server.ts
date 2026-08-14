/**
 * Audit server — the normal TraceGraph API plus one pre-minted session, so a
 * browser can walk through every authenticated page without completing the
 * GitHub OAuth dance (the preview webview can't sign in to GitHub).
 *
 * Prints the session cookie value to stdout once ready:
 *   TG_AUDIT_COOKIE=tg_session=<token>
 *
 * Usage: PORT=4000 npx ts-node scripts/audit-server.ts
 */
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { SessionService } from '../src/auth/session.service';
import type { AppConfig } from '../src/config/configuration';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
  configureApp(app, config);

  const sessions = app.get(SessionService);
  const token = await sessions.createSession(
    { id: 'audit-user', login: 'auditor', name: 'Audit User', avatarUrl: '' },
    '',
  );

  await app.listen(config.port);
  console.log(`TG_AUDIT_COOKIE=tg_session=${token}`);
  console.log(`[audit-server] listening on :${config.port} — audit session ready`);
}

void main();
