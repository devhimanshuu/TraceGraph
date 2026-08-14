import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import type { ApiError, ImpactSnapshot } from '@tracegraph/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { AppConfig } from '../src/config/configuration';
import { SessionService } from '../src/auth/session.service';
import { GraphRepository } from '../src/graph/graph.repository';
import { ImpactHistoryRepository } from '../src/impact-history/impact-history.repository';
import { createFakeGraphRepository } from './helpers/fake-graph-repository';

process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.COGNODB_URI = 'bolt://127.0.0.1:1';
process.env.COGNODB_USERNAME = 'test-user';
process.env.COGNODB_PASSWORD = 'test-password';
process.env.DB_CONNECT_RETRIES = '1';
process.env.DB_CONNECT_RETRY_DELAY_MS = '10';
process.env.DB_CONNECT_TIMEOUT_MS = '100';
process.env.DB_QUERY_TIMEOUT_MS = '1000';
process.env.SESSION_SECRET = '';

const REPO_ID = 'repo:commerce-platform';

const SNAPSHOT_BODY = {
  nodeId: 'class:apps/api/services/payment.service.ts:PaymentService',
  label: 'PaymentService',
  type: 'Class',
  depth: 2,
  score: 'HIGH',
  direct: 2,
  indirect: 2,
  tests: 9,
};

describe('Impact History API (e2e, in-memory fakes)', () => {
  let app: INestApplication;
  let server: Server;
  const store: ImpactSnapshot[] = [];

  const authed = (method: 'get' | 'post' | 'delete', path: string, body?: unknown) => {
    const req = request(server)[method](path);
    if (body !== undefined) req.send(body as object);
    return req.set('Authorization', 'Bearer test-token');
  };

  const fakeRepo = {
    findBySignature: jest.fn(
      async (
        repoId: string,
        sig: {
          nodeId: string;
          depth: number;
          score: string;
          direct: number;
          indirect: number;
          tests: number;
        },
      ) =>
        store.find(
          (s) =>
            s.repoId === repoId &&
            s.nodeId === sig.nodeId &&
            s.depth === sig.depth &&
            s.score === sig.score &&
            s.direct === sig.direct &&
            s.indirect === sig.indirect &&
            s.tests === sig.tests,
        ) ?? null,
    ),
    list: jest.fn(async (repoId: string, limit: number) =>
      store
        .filter((s) => s.repoId === repoId)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit),
    ),
    create: jest.fn(async (_repoId: string, s: ImpactSnapshot) => {
      store.push(s);
      return s;
    }),
    touch: jest.fn(async (id: string, timestamp: number) => {
      const s = store.find((x) => x.id === id);
      if (s) s.timestamp = timestamp;
      return s ?? null;
    }),
    clear: jest.fn(async (repoId: string) => {
      const before = store.length;
      const kept = store.filter((s) => s.repoId !== repoId);
      store.length = 0;
      store.push(...kept);
      return before - kept.length;
    }),
    trimTo: jest.fn(async () => 0),
  } as unknown as ImpactHistoryRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GraphRepository)
      .useValue(createFakeGraphRepository())
      .overrideProvider(ImpactHistoryRepository)
      .useValue(fakeRepo)
      .overrideProvider(SessionService)
      .useValue({
        configured: true,
        verify: async () => ({
          user: { id: 'user_test', login: 'test-user', name: 'Test User', avatarUrl: '' },
          ghToken: 'test-gh-token',
        }),
      })
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

  beforeEach(() => {
    store.length = 0;
    jest.clearAllMocks();
  });

  describe('GET /api/impact-history', () => {
    it('returns an empty ledger with the repository context', async () => {
      const res = await authed('get', '/api/impact-history').expect(200);
      expect(res.body).toEqual({
        repo: { id: REPO_ID, type: 'Repository', label: 'commerce-platform' },
        snapshots: [],
      });
    });

    it('requires a session (fail-closed)', async () => {
      await request(server).get('/api/impact-history').expect(401);
    });
  });

  describe('POST /api/impact-history', () => {
    it('records a snapshot tied to the repository and returns the ledger', async () => {
      const res = await authed('post', '/api/impact-history', SNAPSHOT_BODY).expect(201);
      expect(res.body.repo.id).toBe(REPO_ID);
      expect(res.body.snapshots).toHaveLength(1);
      const snap = res.body.snapshots[0] as ImpactSnapshot;
      expect(snap).toMatchObject({
        nodeId: SNAPSHOT_BODY.nodeId,
        label: 'PaymentService',
        type: 'Class',
        depth: 2,
        score: 'HIGH',
        direct: 2,
        indirect: 2,
        tests: 9,
        repoId: REPO_ID,
        repoName: 'commerce-platform',
        analyzedBy: { username: 'test-user', name: 'Test User' },
      });
      expect(typeof snap.id).toBe('string');
      expect(snap.timestamp).toBeGreaterThan(0);
    });

    it('deduplicates an unchanged re-run (single snapshot, timestamp refreshed)', async () => {
      await authed('post', '/api/impact-history', SNAPSHOT_BODY).expect(201);
      const second = await authed('post', '/api/impact-history', SNAPSHOT_BODY).expect(201);
      expect(second.body.snapshots).toHaveLength(1);
    });

    it('prepends a new version when the analysis changes (deeper depth)', async () => {
      await authed('post', '/api/impact-history', SNAPSHOT_BODY).expect(201);
      const deeper = await authed('post', '/api/impact-history', {
        ...SNAPSHOT_BODY,
        depth: 3,
      }).expect(201);
      expect(deeper.body.snapshots).toHaveLength(2);
      expect(deeper.body.snapshots.map((s: ImpactSnapshot) => s.depth)).toEqual([3, 2]);
    });

    it('rejects an invalid body with 400', async () => {
      const res = await authed('post', '/api/impact-history', {
        ...SNAPSHOT_BODY,
        depth: 9,
      }).expect(400);
      expect((res.body as ApiError).code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown fields (whitelist)', async () => {
      await authed('post', '/api/impact-history', {
        ...SNAPSHOT_BODY,
        repoId: 'spoofed',
      }).expect(400);
    });
  });

  describe('DELETE /api/impact-history', () => {
    it('clears every snapshot for the repository', async () => {
      await authed('post', '/api/impact-history', SNAPSHOT_BODY).expect(201);
      await authed('post', '/api/impact-history', { ...SNAPSHOT_BODY, depth: 3 }).expect(201);

      const res = await authed('delete', '/api/impact-history').expect(200);
      expect(res.body).toEqual({ deleted: 2 });

      const list = await authed('get', '/api/impact-history').expect(200);
      expect(list.body.snapshots).toEqual([]);
    });
  });
});
