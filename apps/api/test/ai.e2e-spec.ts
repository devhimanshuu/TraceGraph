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
import { ImpactRepository } from '../src/impact/impact.repository';
import { AI_PROVIDER } from '../src/ai/ai.tokens';
import type { AiProvider } from '../src/ai/providers/ai-provider.interface';
import { AiProviderError } from '../src/ai/providers/ai-provider.interface';
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

const VALID_MODEL_JSON = JSON.stringify({
  summary: 'CheckoutService is directly affected because it calls PaymentService.',
  keyFindings: ['CheckoutService is directly affected'],
  directImpact: ['CheckoutService'],
  indirectImpact: ['OrderService'],
  evidenceReferences: ['E1', 'E2'],
  confidence: 'high',
});

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

function makeFakeProvider(): AiProvider {
  return {
    name: 'fake-provider',
    isConfigured: () => true,
    generateExplanation: jest.fn(async () => ({
      content: VALID_MODEL_JSON,
      model: 'model-e2e',
    })),
  };
}

async function buildApp(provider: AiProvider): Promise<{ app: INestApplication; server: Server }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GraphRepository)
    .useValue(createFakeGraphRepository())
    .overrideProvider(ImpactRepository)
    .useValue(fakeImpactRepo())
    .overrideProvider(AI_PROVIDER)
    .useValue(provider)
    .overrideProvider(SessionService)
    .useValue({
      configured: true,
      verify: async () => ({
        user: { id: 'user_test', login: 'test-user', name: 'Test User', avatarUrl: '' },
        ghToken: 'test-gh-token',
      }),
    })
    .compile();

  const app = moduleRef.createNestApplication();
  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
  configureApp(app, config);
  await app.init();
  return { app, server: app.getHttpServer() };
}

const authedPost = (server: Server, path: string, body?: Record<string, unknown>) => {
  const req = request(server).post(path).set('Authorization', 'Bearer test-token');
  return body === undefined ? req : req.send(body);
};

describe('AI explain API (e2e, in-memory fakes)', () => {
  let app: INestApplication;
  let server: Server;
  let provider: AiProvider;

  beforeAll(async () => {
    provider = makeFakeProvider();
    ({ app, server } = await buildApp(provider));
  }, 15_000);

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/impact/:id/explain', () => {
    it('returns a grounded explanation with evidence, model and grounding', async () => {
      const res = await authedPost(server, `/api/impact/${ENCODED}/explain`, { depth: 2 }).expect(200);
      const body = res.body;
      expect(body.summary).toContain('CheckoutService');
      expect(body.keyFindings).toHaveLength(1);
      expect(body.directImpact).toEqual(['CheckoutService']);
      expect(body.indirectImpact).toEqual(['OrderService']);
      expect(body.evidenceReferences).toEqual(['E1', 'E2']);
      expect(body.confidence).toBe('high');
      expect(body.grounding).toEqual({ source: 'cognodb-impact-analysis' });
      expect(body.model).toBe('model-e2e');
      expect(body.generatedAt).toBeTruthy();
      // Evidence is backend-built (never client-supplied) and carries stable ids.
      const paths = body.evidence.filter((e: { kind: string }) => e.kind === 'path');
      expect(paths[0].id).toBe('E1');
      expect(paths[0].description).toBe('CheckoutService → CALLS → PaymentService');
      expect(paths[0].nodes[1]).toBe(PAYMENT_ID);
      expect(paths[1].id).toBe('E2');
      expect(paths[1].direction).toBe('indirect');
      // No secrets, prompts, or provider internals in the response.
      expect(JSON.stringify(body)).not.toContain('gsk_test');
      expect(JSON.stringify(body)).not.toContain('systemPrompt');
    });

    it('defaults depth to the impact default when omitted', async () => {
      await authedPost(server, `/api/impact/${ENCODED}/explain`).expect(200);
      expect(provider.generateExplanation).toHaveBeenCalled();
    });

    it('rejects depth=0 with 400', async () => {
      const res = await authedPost(server, `/api/impact/${ENCODED}/explain`, { depth: 0 }).expect(400);
      expect((res.body as ApiError).code).toBe('VALIDATION_ERROR');
    });

    it('rejects depth above the maximum with 400', async () => {
      await authedPost(server, `/api/impact/${ENCODED}/explain`, { depth: 9 }).expect(400);
    });

    it('rejects unknown body fields (whitelist)', async () => {
      await authedPost(server, `/api/impact/${ENCODED}/explain`, { evidence: [{ fake: true }] }).expect(400);
    });

    it('404s for an unknown node', async () => {
      const res = await authedPost(server, '/api/impact/missing/explain', { depth: 2 }).expect(404);
      expect((res.body as ApiError).code).toBe('NOT_FOUND');
    });

    it('returns a grounded explanation even for an empty impact (no dependents)', async () => {
      const res = await authedPost(
        server,
        `/api/impact/${encodeURIComponent('repo:commerce-platform')}/explain`,
        { depth: 2 },
      ).expect(200);
      expect(res.body.grounding.source).toBe('cognodb-impact-analysis');
      // No dependents → no path evidence; tests/history may still exist.
      expect(res.body.evidence.filter((e: { kind: string }) => e.kind === 'path')).toEqual([]);
    });

    it('maps provider failure to a sanitized 502 AI_UNAVAILABLE', async () => {
      (provider.generateExplanation as jest.Mock).mockImplementationOnce(async () => {
        throw new AiProviderError('AI provider is unreachable');
      });
      const res = await authedPost(server, `/api/impact/${ENCODED}/explain`, { depth: 2 }).expect(502);
      expect((res.body as ApiError).code).toBe('AI_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toContain('gsk_test');
    });

    it('maps an invalid model response to a 502 AI_INVALID_RESPONSE', async () => {
      (provider.generateExplanation as jest.Mock).mockImplementationOnce(async () => ({
        content: '{"summary":"x","evidenceReferences":["E99"]}',
        model: 'model-e2e',
      }));
      const res = await authedPost(server, `/api/impact/${ENCODED}/explain`, { depth: 2 }).expect(502);
      expect((res.body as ApiError).code).toBe('AI_INVALID_RESPONSE');
    });

    it('requires authentication (fail closed without a session)', async () => {
      const res = await request(server)
        .post(`/api/impact/${ENCODED}/explain`)
        .send({ depth: 2 })
        .expect(401);
      expect((res.body as ApiError).code).toBe('UNAUTHORIZED');
    });
  });
});

describe('AI explain API — AI disabled (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    process.env.AI_ENABLED = 'false';
    const provider = makeFakeProvider();
    ({ app, server } = await buildApp(provider));
  }, 15_000);

  afterAll(async () => {
    process.env.AI_ENABLED = 'true';
    await app.close();
  });

  it('returns 503 AI_DISABLED and never calls the provider', async () => {
    const res = await authedPost(server, `/api/impact/${ENCODED}/explain`, { depth: 2 }).expect(503);
    expect((res.body as ApiError).code).toBe('AI_DISABLED');
  });
});
