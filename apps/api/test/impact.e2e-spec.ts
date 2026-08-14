import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import type { ApiError, GraphNode, GraphNodeRef } from '@tracegraph/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { AppConfig } from '../src/config/configuration';
import { SessionService } from '../src/auth/session.service';
import { GraphRepository } from '../src/graph/graph.repository';
import { ImpactRepository } from '../src/impact/impact.repository';
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

const PAYMENT_ID = 'class:apps/api/services/payment.service.ts:PaymentService';
const ENCODED = encodeURIComponent(PAYMENT_ID);

const CHECKOUT_REF: GraphNodeRef = {
  id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
  type: 'Class',
  label: 'CheckoutService',
};
const ORDER_REF: GraphNodeRef = {
  id: 'class:apps/api/services/order.service.ts:OrderService',
  type: 'Class',
  label: 'OrderService',
};
const PAYMENT_REF: GraphNodeRef = { id: PAYMENT_ID, type: 'Class', label: 'PaymentService' };

describe('Impact API (e2e, in-memory fakes)', () => {
  let app: INestApplication;
  let server: Server;

  const authedGet = (path: string) =>
    request(server).get(path).set('Authorization', 'Bearer test-token');

  const fakeImpactRepo = {
    collectImpact: jest.fn(
      async (root: GraphNode): Promise<Awaited<ReturnType<ImpactRepository['collectImpact']>>> => {
        if (root.id === PAYMENT_ID) {
          return [
            {
              target: CHECKOUT_REF,
              hops: 1,
              relationship: 'CALLS',
              nodes: [CHECKOUT_REF, PAYMENT_REF],
              relTypes: ['CALLS'],
              via: { id: 'fn:checkout.service.ts:processCheckout', type: 'Function', label: 'processCheckout' },
            },
            {
              target: ORDER_REF,
              hops: 2,
              relationship: 'CALLS',
              nodes: [ORDER_REF, CHECKOUT_REF, PAYMENT_REF],
              relTypes: ['CALLS', 'CALLS'],
              via: { id: 'fn:order.service.ts:retryPendingCheckout', type: 'Function', label: 'retryPendingCheckout' },
            },
          ];
        }
        return [];
      },
    ),
  } as unknown as ImpactRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GraphRepository)
      .useValue(createFakeGraphRepository())
      .overrideProvider(ImpactRepository)
      .useValue(fakeImpactRepo)
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

  describe('GET /api/impact/:id', () => {
    it('returns direct + indirect impact with paths, tests and history', async () => {
      const res = await authedGet(`/api/impact/${ENCODED}?depth=2`).expect(200);
      const body = res.body;
      expect(body.root).toEqual({ id: PAYMENT_ID, type: 'Class', label: 'PaymentService' });
      expect(body.depth).toBe(2);
      expect(body.summary).toMatchObject({ direct: 1, indirect: 1, tests: 1 });
      expect(body.directImpact[0].label).toBe('CheckoutService');
      expect(body.directImpact[0].impactType).toBe('DIRECT');
      expect(body.directImpact[0].reason).toContain('directly calls');
      expect(body.indirectImpact[0].label).toBe('OrderService');
      expect(body.indirectImpact[0].impactType).toBe('INDIRECT');
      expect(body.indirectImpact[0].reason).toContain('depends on');
      expect(body.paths[1].nodes.map((n: GraphNodeRef) => n.id)).toEqual([
        ORDER_REF.id,
        CHECKOUT_REF.id,
        PAYMENT_REF.id,
      ]);
      expect(body.tests[0]).toMatchObject({ name: 'processPayment succeeds' });
      expect(body.history.commits[0].sha).toBe('8f21ac7');
    });

    it('returns an empty impact result for a node without dependents', async () => {
      // The repository node exists but nothing reaches it — clean empty state.
      const res = await authedGet(`/api/impact/${encodeURIComponent('repo:commerce-platform')}?depth=2`).expect(200);
      expect(res.body.summary.direct).toBe(0);
      expect(res.body.summary.indirect).toBe(0);
      expect(res.body.directImpact).toEqual([]);
      expect(res.body.indirectImpact).toEqual([]);
    });

    it('404s for an unknown node', async () => {
      const res = await authedGet('/api/impact/missing').expect(404);
      expect((res.body as ApiError).code).toBe('NOT_FOUND');
    });

    it('rejects depth=0 with 400', async () => {
      const res = await authedGet(`/api/impact/${ENCODED}?depth=0`).expect(400);
      expect((res.body as ApiError).code).toBe('VALIDATION_ERROR');
    });

    it('rejects depth above the maximum with 400', async () => {
      await authedGet(`/api/impact/${ENCODED}?depth=9`).expect(400);
    });

    it('rejects an invalid limit with 400', async () => {
      const res = await authedGet(`/api/impact/${ENCODED}?limit=-5`).expect(400);
      expect((res.body as ApiError).code).toBe('VALIDATION_ERROR');
    });

    it('rejects an unknown query parameter (whitelist)', async () => {
      await authedGet(`/api/impact/${ENCODED}?types=CALLS`).expect(400);
    });
  });
});
