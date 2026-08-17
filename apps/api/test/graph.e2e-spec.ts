import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import type { ApiError } from '@tracegraph/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { AppConfig } from '../src/config/configuration';
import { SessionService } from '../src/auth/session.service';
import { GraphRepository } from '../src/graph/graph.repository';
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
// No SESSION_SECRET in tests — the guard would fail closed. The verifier is
// stubbed below so the API contract tests exercise the real endpoints.
process.env.SESSION_SECRET = '';

const PAYMENT_SERVICE_ID = 'class:apps/api/services/payment.service.ts:PaymentService';
const ENCODED_PAYMENT_ID = encodeURIComponent(PAYMENT_SERVICE_ID);

describe('Graph API (e2e, in-memory repository)', () => {
  let app: INestApplication;
  let server: Server;

  /** Authed GET — the guard requires a (stubbed) session token. */
  const authedGet = (path: string) =>
    request(server).get(path).set('Authorization', 'Bearer test-token');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GraphRepository)
      .useValue(createFakeGraphRepository())
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

  describe('GET /api/repository', () => {
    it('returns the repository overview with statistics', async () => {
      const res = await authedGet('/api/repository').expect(200);
      expect(res.body.name).toBe('commerce-platform');
      expect(res.body.stats.files).toBe(37);
      expect(res.body.stats.commits).toBe(24);
      expect(res.body.relationshipCount).toBe(348);
    });

    it('GET /api/repository/activity returns recent commits, PRs and issues', async () => {
      const res = await authedGet('/api/repository/activity?limit=5').expect(200);
      expect(res.body.commits[0]).toMatchObject({ sha: '8f21ac7', author: { username: 'alex' } });
      expect(res.body.pullRequests[0].number).toBe(421);
      expect(res.body.issues[0].number).toBe(912);
    });

    it('GET /api/repository/components returns core components with dependents', async () => {
      const res = await authedGet('/api/repository/components?limit=5').expect(200);
      expect(res.body[0]).toMatchObject({
        label: 'PaymentService',
        type: 'Class',
        dependents: 6,
      });
    });

    it('rejects an invalid limit on activity with 400', async () => {
      const res = await authedGet('/api/repository/activity?limit=0').expect(400);
      expect((res.body as ApiError).code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/nodes?id=', () => {
    it('returns a node by encoded id', async () => {
      const res = await authedGet(`/api/nodes?id=${ENCODED_PAYMENT_ID}`).expect(200);
      expect(res.body).toMatchObject({
        id: PAYMENT_SERVICE_ID,
        type: 'Class',
        label: 'PaymentService',
      });
    });

    it('returns 404 with the standard error shape for an unknown node', async () => {
      const res = await authedGet('/api/nodes?id=missing').expect(404);
      const body = res.body as ApiError;
      expect(body.code).toBe('NOT_FOUND');
      expect(body.statusCode).toBe(404);
      expect(typeof body.timestamp).toBe('string');
    });
  });

  describe('GET /api/nodes/relationships?id=', () => {
    it('returns incoming and outgoing relationships with endpoint refs', async () => {
      const res = await authedGet(`/api/nodes/relationships?id=${ENCODED_PAYMENT_ID}`).expect(200);
      expect(res.body.node.id).toBe(PAYMENT_SERVICE_ID);
      expect(res.body.incoming).toHaveLength(1);
      expect(res.body.incoming[0].source.label).toBe('processCheckout');
      expect(res.body.incoming[0].type).toBe('CALLS');
      expect(Array.isArray(res.body.outgoing)).toBe(true);
    });
  });

  describe('dependency endpoints', () => {
    it('GET /api/nodes/dependencies?id= returns class-level targets with via', async () => {
      const res = await authedGet(`/api/nodes/dependencies?id=${ENCODED_PAYMENT_ID}`).expect(200);
      expect(res.body[0]).toMatchObject({
        label: 'PaymentRepository',
        relationshipType: 'CALLS',
        via: { type: 'Function', label: 'createTransaction' },
      });
    });

    it('GET /api/nodes/dependents?id= returns callers', async () => {
      const res = await authedGet(`/api/nodes/dependents?id=${ENCODED_PAYMENT_ID}`).expect(200);
      expect(res.body[0].label).toBe('CheckoutService');
    });

    it('GET /api/nodes/callers and /callees?id= work for functions', async () => {
      const fnId = encodeURIComponent('fn:apps/api/services/payment.service.ts:processPayment');
      const callers = await authedGet(`/api/nodes/callers?id=${fnId}`).expect(200);
      expect(callers.body[0].type).toBe('Function');
      const callees = await authedGet(`/api/nodes/callees?id=${fnId}`).expect(200);
      expect(callees.body[0].label).toBe('charge');
    });

    it('GET /api/nodes/tests?id= returns test coverage', async () => {
      const res = await authedGet(`/api/nodes/tests?id=${ENCODED_PAYMENT_ID}`).expect(200);
      expect(res.body[0]).toMatchObject({
        name: 'processPayment succeeds',
        target: { type: 'Function', label: 'processPayment' },
      });
    });

    it('GET /api/nodes/relationship-summary?id= returns one-request counts', async () => {
      const res = await authedGet(`/api/nodes/relationship-summary?id=${ENCODED_PAYMENT_ID}`).expect(200);
      expect(res.body).toEqual({
        relationships: 12,
        dependencies: 2,
        dependents: 4,
        callers: 4,
        callees: 2,
        tests: 8,
        commits: 3,
        pullRequests: 2,
        issues: 1,
      });
    });

    it('relationship-summary 404s for an unknown node', async () => {
      await authedGet('/api/nodes/relationship-summary?id=missing').expect(404);
    });
  });

  describe('history endpoints', () => {
    it('GET /api/node-history/commits?id= returns commits with authors', async () => {
      const res = await authedGet(`/api/node-history/commits?id=${ENCODED_PAYMENT_ID}`).expect(200);
      expect(res.body[0].sha).toBe('8f21ac7');
      expect(res.body[0].author.username).toBe('alex');
    });

    it('GET /api/node-history/pull-requests?id= returns PRs', async () => {
      const res = await authedGet(`/api/node-history/pull-requests?id=${ENCODED_PAYMENT_ID}`).expect(200);
      expect(res.body[0].number).toBe(421);
    });

    it('GET /api/node-history/issues?id= returns issues', async () => {
      const res = await authedGet(`/api/node-history/issues?id=${ENCODED_PAYMENT_ID}`).expect(200);
      expect(res.body[0].number).toBe(912);
    });

    it('history endpoints 404 for unknown nodes', async () => {
      await authedGet('/api/node-history/commits?id=missing').expect(404);
    });
  });

  describe('GET /api/traversal?id=', () => {
    it('returns a bounded traversal with nodes, edges, and paths', async () => {
      const res = await authedGet(`/api/traversal?id=${ENCODED_PAYMENT_ID}&depth=2`).expect(200);
      expect(res.body.root.id).toBe(PAYMENT_SERVICE_ID);
      expect(res.body.depth).toBe(2);
      expect(res.body.nodes.length).toBeGreaterThan(0);
      expect(res.body.paths[0].nodes.length).toBeGreaterThan(1);
    });

    it('rejects depth=0 with 400', async () => {
      const res = await authedGet(`/api/traversal?id=${ENCODED_PAYMENT_ID}&depth=0`).expect(400);
      expect((res.body as ApiError).code).toBe('VALIDATION_ERROR');
    });

    it('rejects depth above the maximum with 400', async () => {
      await authedGet(`/api/traversal?id=${ENCODED_PAYMENT_ID}&depth=9`).expect(400);
    });

    it('rejects invalid relationship types with 400', async () => {
      await authedGet(`/api/traversal?id=${ENCODED_PAYMENT_ID}&types=NOPE`).expect(400);
    });

    it('direction=in walks the dependents chain (reverse traversal)', async () => {
      const res = await authedGet(`/api/traversal?id=${ENCODED_PAYMENT_ID}&direction=in&depth=2`)
        .expect(200);
      expect(res.body.root.id).toBe(PAYMENT_SERVICE_ID);
      expect(res.body.paths[0].nodes[0]).toBe(PAYMENT_SERVICE_ID);
    });

    it('rejects an invalid direction with 400', async () => {
      await authedGet(`/api/traversal?id=${ENCODED_PAYMENT_ID}&direction=sideways`).expect(400);
    });
  });

  describe('GET /api/graph', () => {
    it('returns a neighborhood rooted at the repository by default', async () => {
      const res = await authedGet('/api/graph?depth=1').expect(200);
      expect(res.body.root.id).toBe('repo:commerce-platform');
      expect(res.body.nodes.length).toBeGreaterThan(0);
      expect(res.body.edges[0].source).toBeTruthy();
    });

    it('rejects depth above the maximum', async () => {
      await authedGet('/api/graph?depth=99').expect(400);
    });

    it('rejects invalid node types', async () => {
      await authedGet('/api/graph?nodeTypes=Gadget').expect(400);
    });
  });

  describe('GET /api/search', () => {
    it('returns matching node refs', async () => {
      const res = await authedGet('/api/search?q=pay').expect(200);
      expect(res.body[0].label).toBe('PaymentService');
    });

    it('rejects an empty query with 400', async () => {
      const res = await authedGet('/api/search?q=').expect(400);
      expect((res.body as ApiError).code).toBe('VALIDATION_ERROR');
    });

    it('rejects a missing query with 400', async () => {
      await authedGet('/api/search').expect(400);
    });
  });
});
