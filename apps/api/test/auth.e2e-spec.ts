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
import { createFakeGraphRepository } from './helpers/fake-graph-repository';

// A fake (non-empty) key puts the guard in real verification mode: without a
// valid Clerk-signed token every protected route must fail closed with 401.
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.COGNODB_URI = 'bolt://127.0.0.1:1';
process.env.COGNODB_USERNAME = 'test-user';
process.env.COGNODB_PASSWORD = 'test-password';
process.env.DB_CONNECT_RETRIES = '1';
process.env.DB_CONNECT_RETRY_DELAY_MS = '10';
process.env.DB_CONNECT_TIMEOUT_MS = '100';
process.env.DB_QUERY_TIMEOUT_MS = '1000';
process.env.CLERK_SECRET_KEY = 'sk_test_fake-for-auth-tests';

describe('Authentication (e2e, fail-closed)', () => {
  let app: INestApplication;
  let server: Server;

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
  }, 15_000);

  afterAll(async () => {
    await app.close();
  });

  it('health endpoints remain public', async () => {
    await request(server).get('/api/health').expect(200);
    await request(server).get('/api/health/database').expect(200);
  });

  it('rejects requests without an Authorization header', async () => {
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
      .set('Authorization', 'Bearer not-a-real-clerk-token')
      .expect(401);
    expect((res.body as ApiError).code).toBe('UNAUTHORIZED');
  });

  it('applies the guard to graph and traversal routes too', async () => {
    await request(server).get('/api/nodes/anything').expect(401);
    await request(server).get('/api/graph').expect(401);
    await request(server).get('/api/search?q=pay').expect(401);
  });
});
