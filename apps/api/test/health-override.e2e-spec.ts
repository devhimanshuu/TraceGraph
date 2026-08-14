import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import neo4j, { Neo4jError } from 'neo4j-driver';
import type { Server } from 'http';
import request from 'supertest';
import type { DatabaseHealth } from '@tracegraph/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { AppConfig } from '../src/config/configuration';
import { DATABASE_DRIVER } from '../src/database';
import { createFakeDriver } from './helpers/fake-driver';

process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.COGNODB_URI = 'bolt://127.0.0.1:1';
process.env.COGNODB_USERNAME = 'test-user';
process.env.COGNODB_PASSWORD = 'test-password';
process.env.DB_CONNECT_RETRIES = '1';
process.env.DB_CONNECT_RETRY_DELAY_MS = '10';
process.env.SESSION_SECRET = '';

describe('Health endpoints with a mocked driver (no live CognoDB)', () => {
  describe('healthy database', () => {
    let app: INestApplication;
    let server: Server;

    beforeAll(async () => {
      const fake = createFakeDriver();
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DATABASE_DRIVER)
        .useValue(fake.driver)
        .compile();

      app = moduleRef.createNestApplication();
      const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
      configureApp(app, config);
      await app.init();
      server = app.getHttpServer();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/health/database reports up with a latency', async () => {
      const res = await request(server).get('/api/health/database').expect(200);
      const body = res.body as DatabaseHealth;
      expect(body.status).toBe('up');
      expect(typeof body.latencyMs).toBe('number');
      expect(body.error).toBeUndefined();
    });

    it('GET /api/health still reports the app as running', async () => {
      const res = await request(server).get('/api/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('tracegraph-api');
    });
  });

  describe('unavailable database', () => {
    let app: INestApplication;
    let server: Server;

    beforeAll(async () => {
      const fake = createFakeDriver({
        runError: new Neo4jError(
          'server unreachable',
          neo4j.error.SERVICE_UNAVAILABLE,
          '50XXX.00',
          'desc',
        ),
      });
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DATABASE_DRIVER)
        .useValue(fake.driver)
        .compile();

      app = moduleRef.createNestApplication();
      const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
      configureApp(app, config);
      await app.init();
      server = app.getHttpServer();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/health/database reports a sanitized down state', async () => {
      const res = await request(server).get('/api/health/database').expect(200);
      const body = res.body as DatabaseHealth;
      expect(body.status).toBe('down');
      expect(body.error).toBeTruthy();

      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('bolt://');
      expect(serialized).not.toContain('test-password');
      expect(serialized).not.toContain('server unreachable');
      expect(serialized).not.toContain('Neo4jError');
    });

    it('GET /api/health remains healthy (app liveness is independent of the DB)', async () => {
      const res = await request(server).get('/api/health').expect(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
