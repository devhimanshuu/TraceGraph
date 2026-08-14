import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import type { ApiError } from '@tracegraph/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { AppConfig } from '../src/config/configuration';
import { GraphRepository } from '../src/graph/graph.repository';
import { SessionService } from '../src/auth/session.service';
import { createFakeGraphRepository } from './helpers/fake-graph-repository';

// A real SESSION_SECRET puts the guard in genuine verification mode: without
// a valid TraceGraph-signed token every protected route must fail closed 401.
// GitHub OAuth credentials are intentionally absent — the login entry must
// degrade to a readable redirect, not a crash.
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.COGNODB_URI = 'bolt://127.0.0.1:1';
process.env.COGNODB_USERNAME = 'test-user';
process.env.COGNODB_PASSWORD = 'test-password';
process.env.DB_CONNECT_RETRIES = '1';
process.env.DB_CONNECT_RETRY_DELAY_MS = '10';
process.env.DB_CONNECT_TIMEOUT_MS = '100';
process.env.DB_QUERY_TIMEOUT_MS = '1000';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.SESSION_TTL_DAYS = '7';
process.env.GITHUB_CLIENT_ID = '';
process.env.GITHUB_CLIENT_SECRET = '';
process.env.WEB_APP_URL = 'http://localhost:3000';

describe('Authentication (e2e, GitHub session)', () => {
  let app: INestApplication;
  let server: Server;
  let sessions: SessionService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GraphRepository)
      .useValue(createFakeGraphRepository())
      .compile();

    app = moduleRef.createNestApplication();
    const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
    configureApp(app, config);
    await app.init();
    server = app.getHttpServer();
    sessions = app.get(SessionService);
  }, 15_000);

  afterAll(async () => {
    await app.close();
  });

  it('health endpoints remain public', async () => {
    await request(server).get('/api/health').expect(200);
    await request(server).get('/api/health/database').expect(200);
  });

  it('rejects requests without an Authorization header or session cookie', async () => {
    const res = await request(server).get('/api/repository').expect(401);
    const body = res.body as ApiError;
    expect(body.statusCode).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed Authorization headers', async () => {
    await request(server)
      .get('/api/repository')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .expect(401);
    await request(server).get('/api/repository').set('Authorization', 'Bearer ').expect(401);
  });

  it('rejects tokens that cannot be verified', async () => {
    const res = await request(server)
      .get('/api/repository')
      .set('Authorization', 'Bearer not-a-real-session-token')
      .expect(401);
    expect((res.body as ApiError).code).toBe('UNAUTHORIZED');
  });

  it('applies the guard to graph, search, and traversal routes too', async () => {
    await request(server).get('/api/nodes/anything').expect(401);
    await request(server).get('/api/graph').expect(401);
    await request(server).get('/api/search?q=pay').expect(401);
  });

  it('bootstraps a session and reads it back from /auth/session', async () => {
    const token = await sessions.createSession(
      { id: '42', login: 'octocat', name: 'Octo Cat', avatarUrl: '' },
      'gh-token-123',
    );

    // Protected route accepts the signed bearer token.
    await request(server)
      .get('/api/repository')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // ...and the httpOnly session cookie (browser bootstrap path).
    await request(server).get('/api/repository').set('Cookie', `tg_session=${token}`).expect(200);

    // The session endpoint returns the identity + the token for storage.
    const res = await request(server)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({ user: { id: '42', login: 'octocat' }, token });
  });

  it('401s /auth/session without a session', async () => {
    await request(server).get('/api/auth/session').expect(401);
  });

  it('degrades the GitHub login redirect when OAuth is unconfigured', async () => {
    await request(server)
      .get('/api/auth/github/login')
      .redirects(0)
      .expect(302)
      .expect('Location', 'http://localhost:3000/?auth_error=not_configured');
  });

  it('revokes the session on logout', async () => {
    const token = await sessions.createSession(
      { id: '42', login: 'octocat', name: 'Octo Cat', avatarUrl: '' },
      'gh-token-123',
    );

    await request(server)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(server)
      .get('/api/repository')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});
