import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import type { ImpactExplanation, ImpactResponse } from '@tracegraph/shared';
import type { AiConfig } from '../config/configuration';
import type { ImpactService } from '../impact/impact.service';
import { EvidenceBuilder } from './evidence/evidence-builder';
import { ExplanationValidator } from './explanation.validator';
import type { AiProvider } from './providers/ai-provider.interface';
import { AiProviderError } from './providers/ai-provider.interface';
import { AiService } from './ai.service';
import { AI_ERROR_CODES } from './ai.constants';

const PAYMENT = { id: 'class:payment.service.ts:PaymentService', type: 'Class' as const, label: 'PaymentService' };

function impactResponse(): ImpactResponse {
  return {
    root: PAYMENT,
    depth: 2,
    summary: { direct: 1, indirect: 1, tests: 1, commits: 1, pullRequests: 1, issues: 1, maxDepth: 2, score: 'HIGH', scoreReasons: [] },
    directImpact: [
      {
        id: 'class:checkout.service.ts:CheckoutService',
        type: 'Class',
        label: 'CheckoutService',
        impactType: 'DIRECT',
        distance: 1,
        relationship: 'CALLS',
        reason: 'CheckoutService directly calls PaymentService.',
        path: {
          nodes: [
            { id: 'class:checkout.service.ts:CheckoutService', type: 'Class', label: 'CheckoutService' },
            PAYMENT,
          ],
          relTypes: ['CALLS'],
        },
      },
    ],
    indirectImpact: [],
    tests: [],
    history: { commits: [], pullRequests: [], issues: [] },
    paths: [],
  };
}

function configService(enabled: boolean): ConfigService {
  const ai: AiConfig = {
    enabled,
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiKey: 'gsk_test',
    baseUrl: 'https://api.groq.com/openai/v1',
    maxTokens: 1024,
    timeoutMs: 5000,
  };
  return {
    getOrThrow: (key: string) => (key === 'ai' ? ai : undefined),
  } as unknown as ConfigService;
}

const VALID_MODEL_JSON = JSON.stringify({
  summary: 'CheckoutService is directly affected because it calls PaymentService.',
  keyFindings: ['CheckoutService is directly affected'],
  directImpact: ['CheckoutService'],
  indirectImpact: [],
  evidenceReferences: ['E1'],
  confidence: 'high',
});

function createService(overrides: {
  enabled?: boolean;
  providerConfigured?: boolean;
  providerContent?: string;
  providerError?: Error;
  impactError?: Error;
} = {}) {
  const impactService = {
    analyze: jest.fn(async () => {
      if (overrides.impactError) throw overrides.impactError;
      return impactResponse();
    }),
  } as unknown as ImpactService;
  const generateExplanation = jest.fn(async () => {
    if (overrides.providerError) throw overrides.providerError;
    return { content: overrides.providerContent ?? VALID_MODEL_JSON, model: 'llama-3.3-70b-versatile' };
  }) as unknown as jest.Mock;
  const provider = {
    name: 'groq',
    isConfigured: jest.fn(() => overrides.providerConfigured ?? true),
    generateExplanation,
  } as unknown as AiProvider;
  const service = new AiService(
    impactService,
    new EvidenceBuilder(),
    new ExplanationValidator(),
    provider,
    configService(overrides.enabled ?? true),
  );
  return { service, impactService, provider, generateExplanation };
}

describe('AiService', () => {
  it('builds evidence from the deterministic analysis and returns the grounded explanation', async () => {
    const { service, impactService, generateExplanation } = createService();
    const explanation: ImpactExplanation = await service.explain(PAYMENT.id, { depth: 2 });

    expect(impactService.analyze).toHaveBeenCalledWith(PAYMENT.id, { depth: 2 });
    expect(generateExplanation).toHaveBeenCalledTimes(1);
    const params = generateExplanation.mock.calls[0][0] as { systemPrompt: string; userPrompt: string };
    expect(params.systemPrompt).toContain('untrusted source data');
    expect(params.userPrompt).toContain('PaymentService');
    expect(params.userPrompt).toContain('"E1"');
    expect(explanation).toMatchObject({
      summary: 'CheckoutService is directly affected because it calls PaymentService.',
      grounding: { source: 'cognodb-impact-analysis' },
      model: 'llama-3.3-70b-versatile',
    });
    expect(explanation.evidence[0].id).toBe('E1');
    expect(explanation.evidence[0].description).toBe('CheckoutService → CALLS → PaymentService');
    expect(explanation.generatedAt).toBeTruthy();
  });

  it('fails with AI_DISABLED (503) when AI is disabled — before any analysis or provider call', async () => {
    const { service, impactService, provider } = createService({ enabled: false });
    const err: unknown = await service.explain(PAYMENT.id, { depth: 2 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 503 });
    const body = (err as { response: { code: string } }).response;
    expect(body.code).toBe(AI_ERROR_CODES.DISABLED);
    expect(impactService.analyze).not.toHaveBeenCalled();
    expect(provider.generateExplanation).not.toHaveBeenCalled();
  });

  it('fails with AI_UNAVAILABLE (503) when the provider is not configured', async () => {
    const { service } = createService({ providerConfigured: false });
    const err: unknown = await service.explain(PAYMENT.id, { depth: 2 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 503 });
    expect((err as { response: { code: string } }).response.code).toBe(AI_ERROR_CODES.UNAVAILABLE);
  });

  it('maps provider failures to a sanitized 502 AI_UNAVAILABLE', async () => {
    const { service } = createService({ providerError: new AiProviderError('AI provider is unreachable') });
    const err: unknown = await service.explain(PAYMENT.id, { depth: 2 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502 });
    expect((err as { response: { code: string } }).response.code).toBe(AI_ERROR_CODES.UNAVAILABLE);
  });

  it('maps invalid model responses to a 502 AI_INVALID_RESPONSE', async () => {
    const { service } = createService({ providerContent: '{"summary": "x", "evidenceReferences": ["E99"]}' });
    const err: unknown = await service.explain(PAYMENT.id, { depth: 2 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502 });
    expect((err as { response: { code: string } }).response.code).toBe(AI_ERROR_CODES.INVALID_RESPONSE);
  });

  it('propagates deterministic analysis failures (e.g. unknown node → 404)', async () => {
    const notFound = new NotFoundException('Node "x" was not found');
    const { service } = createService({ impactError: notFound });
    await expect(service.explain('x', { depth: 2 })).rejects.toMatchObject({ status: 404 });
  });

  it('never exposes the API key in provider error paths', async () => {
    const { service } = createService({ providerError: new Error('secret gsk_test_key leaked') });
    const err: unknown = await service.explain(PAYMENT.id, { depth: 2 }).catch((e: unknown) => e);
    expect(JSON.stringify(err)).not.toContain('gsk_test');
  });
});
