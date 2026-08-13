import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import type { ApiError, AppHealth, DatabaseHealth } from '@tracegraph/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { AppConfig } from '../src/config/configuration';

// Use an unreachable endpoint so boot and health tests exercise the degraded
// path without real credentials, and so no real credentials can ever leak
// into test output. These values override anything in .env (process env wins).
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.COGNODB_URI = 'bolt://127.0.0.1:1';
process.env.COGNODB_USERNAME = 'test-user';
process.env.COGNODB_PASSWORD = 'test-password';
process.env.DB_CONNECT_RETRIES = '1';
process.env.DB_CONNECT_RETRY_DELAY_MS = '10';
// Short connection/query timeouts so tests never wait on real network timeouts.
process.env.DB_CONNECT_TIMEOUT_MS = '100';
process.env.DB_QUERY_TIMEOUT_MS = '1000';

describe('AppModule (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
    configureApp(app, config);
    await app.init();
    server = app.getHttpServer();
  }, 15_000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns app health', async () => {
    const res = await request(server).get('/api/health').expect(200);
    const body = res.body as AppHealth;
    expect(body.status).toBe('ok');
    expect(body.service).toBe('tracegraph-api');
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.version).toBe('string');
  });

  it('GET /api/health/database reports down without leaking credentials', async () => {
    const res = await request(server).get('/api/health/database').expect(200);
    const body = res.body as DatabaseHealth;
    expect(body.status).toBe('down');
    expect(typeof body.latencyMs).toBe('number');

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('test-password');
    expect(serialized).not.toContain('bolt://');
    expect(serialized).not.toContain('test-user');
  });

  it('sets CORS headers for a configured origin', async () => {
    const res = await request(server)
      .get('/api/health')
      .set('Origin', 'http://localhost:3000')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not send CORS headers for a disallowed origin', async () => {
    const res = await request(server)
      .get('/api/health')
      .set('Origin', 'http://evil.example')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns a standardized 404 error shape for unknown routes', async () => {
    const res = await request(server).get('/api/does-not-exist').expect(404);
    const body = res.body as ApiError;
    expect(body.statusCode).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.path).toBe('string');
  });
});
