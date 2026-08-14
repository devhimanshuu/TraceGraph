/**
 * AiService (Phase 10 §7, §16, §18).
 *
 * Orchestrates the explain pipeline:
 *   1. validate request + run the deterministic impact analysis (Phase 9)
 *   2. build bounded, id-labeled evidence from that result
 *   3. call the provider with the constructed prompts
 *   4. validate the model's response (shape + evidence citations)
 *   5. return the grounded explanation — or a clean, typed failure
 *
 * The LLM never queries CognoDB: it only ever sees the evidence payload built
 * here. AI failure (disabled, unconfigured, provider error, invalid response)
 * surfaces as a typed 5xx with a stable code — the deterministic impact
 * analysis is untouched and the frontend keeps showing it.
 */
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ImpactExplanation } from '@tracegraph/shared';
import type { AiConfig } from '../config/configuration';
import { ImpactService } from '../impact/impact.service';
import { AI_ERROR_CODES } from './ai.constants';
import { EvidenceBuilder } from './evidence/evidence-builder';
import { ExplanationValidator, AiInvalidResponseError } from './explanation.validator';
import { buildExplanationPrompts } from './prompts/system.prompt';
import { AI_PROVIDER } from './ai.tokens';
import { AiProvider, AiProviderError } from './providers/ai-provider.interface';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly impactService: ImpactService,
    private readonly evidenceBuilder: EvidenceBuilder,
    private readonly validator: ExplanationValidator,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly configService: ConfigService,
  ) {}

  async explain(nodeId: string, query: { depth?: number }): Promise<ImpactExplanation> {
    const ai = this.configService.getOrThrow<AiConfig>('ai');

    // Master switch — the deterministic product is fully functional without AI.
    if (!ai.enabled) {
      this.logger.log(`AI explanation skipped for ${nodeId}: AI_ENABLED=false`);
      throw this.aiError(HttpStatus.SERVICE_UNAVAILABLE, AI_ERROR_CODES.DISABLED,
        'AI explanation is disabled in this environment.');
    }
    if (!this.provider.isConfigured()) {
      throw this.aiError(HttpStatus.SERVICE_UNAVAILABLE, AI_ERROR_CODES.UNAVAILABLE,
        'AI is not configured on this instance.');
    }

    // 1. Deterministic graph analysis — the evidence source of truth.
    const impact = await this.impactService.analyze(nodeId, { depth: query.depth });

    // 2. Bounded evidence.
    const evidence = this.evidenceBuilder.build(impact);

    // 3. Prompt + provider call (bounded by AI_MAX_TOKENS).
    const prompts = buildExplanationPrompts(evidence.payload);
    const startedAt = Date.now();
    let result: Awaited<ReturnType<AiProvider['generateExplanation']>>;
    try {
      result = await this.provider.generateExplanation({
        systemPrompt: prompts.systemPrompt,
        userPrompt: prompts.userPrompt,
        maxTokens: ai.maxTokens,
      });
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      if (err instanceof AiProviderError) {
        this.logger.warn(
          `AI explanation failed for ${nodeId} (provider=${this.provider.name}, model=${ai.model}, latency=${latencyMs}ms): ${err.message}`,
        );
        throw this.aiError(HttpStatus.BAD_GATEWAY, AI_ERROR_CODES.UNAVAILABLE,
          'The AI provider could not complete the explanation. Please try again.');
      }
      throw err;
    }

    // 4. Validate the model's output — shape, lengths, and evidence citations.
    let validated: ReturnType<ExplanationValidator['validate']>;
    try {
      validated = this.validator.validate(result.content, evidence.idSet);
    } catch (err) {
      if (err instanceof AiInvalidResponseError) {
        this.logger.warn(
          `AI explanation rejected for ${nodeId} (model=${ai.model}): ${err.message}`,
        );
        throw this.aiError(HttpStatus.BAD_GATEWAY, AI_ERROR_CODES.INVALID_RESPONSE,
          'The AI provider returned an invalid explanation. Please try again.');
      }
      throw err;
    }

    this.logger.log(
      `AI explanation generated for ${nodeId} (provider=${this.provider.name}, model=${result.model}, latency=${Date.now() - startedAt}ms, refs=${validated.evidenceReferences.length})`,
    );

    return {
      ...validated,
      evidence: evidence.items,
      generatedAt: new Date().toISOString(),
      model: result.model,
      grounding: { source: 'cognodb-impact-analysis' },
    };
  }

  /** Typed failure with a stable, client-visible code (never provider internals). */
  private aiError(status: number, code: string, message: string): HttpException {
    return new HttpException({ statusCode: status, code, message }, status);
  }
}
