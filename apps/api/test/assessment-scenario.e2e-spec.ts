import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { AppConfig } from '../src/config/configuration';
import { SessionService } from '../src/auth/session.service';
import { GraphRepository } from '../src/graph/graph.repository';
import { ImpactRepository } from '../src/impact/impact.repository';
import { ImpactHistoryRepository } from '../src/impact-history/impact-history.repository';
import { AI_PROVIDER } from '../src/ai/ai.tokens';
import type { AiProvider } from '../src/ai/providers/ai-provider.interface';
import type { ImpactSnapshot } from '@tracegraph/shared';
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
process.env.AI_ENABLED = 'true';
process.env.AI_API_KEY = 'gsk_test_e2e';
process.env.AI_MODEL = 'model-e2e';
process.env.AI_MAX_TOKENS = '512';

const PAYMENT_ID = 'class:apps/api/services/payment.service.ts:PaymentService';
const ENCODED = encodeURIComponent(PAYMENT_ID);

const CHECKOUT_REF = {
  id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
  type: 'Class' as const,
  label: 'CheckoutService',
};
const ORDER_REF = {
  id: 'class:apps/api/services/order.service.ts:OrderService',
  type: 'Class' as const,
  label: 'OrderService',
};
const PAYMENT_REF = { id: PAYMENT_ID, type: 'Class' as const, label: 'PaymentService' };

const VALID_MODEL_JSON = JSON.stringify({
  summary: 'CheckoutService is directly affected because it calls PaymentService.',
  keyFindings: ['CheckoutService is directly affected'],
  directImpact: ['CheckoutService'],
  indirectImpact: ['OrderService'],
  evidenceReferences: ['E1', 'E2'],
  confidence: 'high',
});

function fakeImpactRepo(): ImpactRepository {
  return {
    collectImpact: jest.fn(
      async (root: { id: string }): Promise<Awaited<ReturnType<ImpactRepository['collectImpact']>>> => {
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
}

describe('Assessment scenario (e2e) — the full demo flow', () => {
  let app: INestApplication;
  let server: Server;
  const store: ImpactSnapshot[] = [];

  const authed = (method: 'get' | 'post', path: string, body?: unknown) => {
    const req = request(server)[method](path);
    if (body !== undefined) req.send(body as object);
    return req.set('Authorization', 'Bearer test-token');
  };

  const fakeProvider: AiProvider = {
    name: 'fake-provider',
    isConfigured: () => true,
    generateExplanation: jest.fn(async () => ({
      content: VALID_MODEL_JSON,
      model: 'model-e2e',
    })),
  };

  const fakeHistoryRepo = {
    findBySignature: jest.fn(async () => null),
    list: jest.fn(async (_repoId: string, limit: number) =>
      [...store].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit),
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
    clear: jest.fn(async () => ({ deleted: store.splice(0).length })),
    trimTo: jest.fn(async (_repoId: string, max: number) => {
      store.splice(max);
    }),
  } as unknown as ImpactHistoryRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GraphRepository)
      .useValue(createFakeGraphRepository())
      .overrideProvider(ImpactRepository)
      .useValue(fakeImpactRepo())
      .overrideProvider(ImpactHistoryRepository)
      .useValue(fakeHistoryRepo)
      .overrideProvider(AI_PROVIDER)
      .useValue(fakeProvider)
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

  it('1. Dashboard: repository overview loads', async () => {
    const res = await authed('get', '/api/repository').expect(200);
    expect(res.body.id).toBe('repo:commerce-platform');
    expect(res.body.stats.files).toBeGreaterThan(0);
    expect(res.body.relationshipCount).toBeGreaterThan(0);
  });

  it('2. Graph: search finds PaymentService', async () => {
    const res = await authed('get', '/api/search?q=pay').expect(200);
    expect(res.body.some((r: { id: string }) => r.id === PAYMENT_ID)).toBe(true);
  });

  it('3. Graph: neighborhood renders around the selected node', async () => {
    const res = await authed('get', `/api/graph?rootId=${ENCODED}&depth=2`).expect(200);
    expect(res.body.root.id).toBe(PAYMENT_ID);
    expect(res.body.nodes.length).toBeGreaterThan(0);
    expect(res.body.edges.length).toBeGreaterThan(0);
  });

  it('4. Node inspector: details load for the selected entity', async () => {
    const res = await authed('get', `/api/nodes?id=${ENCODED}`).expect(200);
    expect(res.body.id).toBe(PAYMENT_ID);
    expect(res.body.label).toBe('PaymentService');
    expect(res.body.type).toBe('Class');
  });

  it('5. Dependency explorer: dependencies and dependents load', async () => {
    const deps = await authed('get', `/api/nodes/dependencies?id=${ENCODED}`).expect(200);
    const dependents = await authed('get', `/api/nodes/dependents?id=${ENCODED}`).expect(200);
    // PaymentService has no outgoing deps in the fixture; CheckoutService calls it.
    expect(Array.isArray(deps.body)).toBe(true);
    expect(dependents.body.some((d: { id: string }) => d.id === CHECKOUT_REF.id)).toBe(true);
  });

  it('6. Impact analysis: direct + indirect + tests + paths', async () => {
    const res = await authed('get', `/api/impact?id=${ENCODED}&depth=2`).expect(200);
    expect(res.body.root.id).toBe(PAYMENT_ID);
    expect(res.body.summary).toMatchObject({ direct: 1, indirect: 1, tests: 1 });
    expect(res.body.directImpact[0].label).toBe('CheckoutService');
    expect(res.body.directImpact[0].impactType).toBe('DIRECT');
    expect(res.body.indirectImpact[0].label).toBe('OrderService');
    expect(res.body.indirectImpact[0].impactType).toBe('INDIRECT');
    expect(res.body.paths[1].nodes.map((n: { id: string }) => n.id)).toEqual([
      ORDER_REF.id,
      CHECKOUT_REF.id,
      PAYMENT_REF.id,
    ]);
    expect(res.body.tests[0]).toMatchObject({ name: 'processPayment succeeds' });
    expect(res.body.history.commits[0].sha).toBe('8f21ac7');
  });

  it('7. Impact history: analysis is recorded and listed', async () => {
    await authed('post', '/api/impact-history', {
      nodeId: PAYMENT_ID,
      label: 'PaymentService',
      type: 'Class',
      depth: 2,
      score: 'HIGH',
      direct: 1,
      indirect: 1,
      tests: 1,
    }).expect(201);
    const res = await authed('get', '/api/impact-history').expect(200);
    expect(res.body.snapshots).toHaveLength(1);
    expect(res.body.snapshots[0].nodeId).toBe(PAYMENT_ID);
  });

  it('8. AI explanation: grounded evidence, every reference resolves', async () => {
    const res = await authed('post', `/api/impact/explain?id=${ENCODED}`, { depth: 2 }).expect(200);
    expect(res.body.summary).toContain('CheckoutService is directly affected');
    expect(res.body.evidenceReferences).toEqual(['E1', 'E2']);
    expect(res.body.grounding).toEqual({ source: 'cognodb-impact-analysis' });
    expect(res.body.model).toBe('model-e2e');
    // Every evidence id the model cited exists in the backend-built evidence list.
    const ids = new Set(res.body.evidence.map((e: { id: string }) => e.id));
    for (const ref of res.body.evidenceReferences) {
      expect(ids.has(ref)).toBe(true);
    }
    // No secrets or provider internals leak into the response.
    expect(JSON.stringify(res.body)).not.toContain('gsk_test');
  });

  it('9. Evidence path: multi-hop traversal explains the chain', async () => {
    const res = await authed('get', `/api/traversal?id=${ENCODED}&depth=2&direction=in`).expect(200);
    expect(res.body.paths.length).toBeGreaterThan(0);
  });

  it('10. Return to graph: context is preserved with the same root', async () => {
    const res = await authed('get', `/api/graph?rootId=${ENCODED}&depth=2`).expect(200);
    expect(res.body.root.id).toBe(PAYMENT_ID);
  });

  it('11. Negative: unknown node → 404 with the standard error shape', async () => {
    const res = await authed('get', '/api/nodes?id=definitely-not-a-node').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.statusCode).toBe(404);
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('12. Negative: invalid depth → 400', async () => {
    const res = await authed('get', `/api/impact?id=${ENCODED}&depth=99`).expect(400);
    expect(res.body.statusCode).toBe(400);
  });
});
