import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../config/configuration';
import {
  AiProvider,
  AiProviderError,
  GenerateExplanationParams,
  AiProviderResult,
} from './ai-provider.interface';
import { AI_TEMPERATURE } from '../ai.constants';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  model?: string;
  error?: { message?: string };
}

/**
 * OpenAI-compatible chat completions provider — used for Groq
 * (https://api.groq.com/openai/v1). Uses Node's native fetch (Node ≥ 20), so
 * no HTTP dependency is introduced. Groq supports `response_format:
 * json_object`, which is how we get structured, validatable output.
 *
 * The API key lives only in backend config and is never logged or returned.
 */
@Injectable()
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'groq';
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(configService: ConfigService) {
    const ai = configService.getOrThrow<AiConfig>('ai');
    this.baseUrl = ai.baseUrl.replace(/\/+$/, '');
    this.apiKey = ai.apiKey;
    this.model = ai.model;
    this.timeoutMs = ai.timeoutMs;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0 && this.baseUrl.length > 0;
  }

  async generateExplanation(params: GenerateExplanationParams): Promise<AiProviderResult> {
    if (!this.isConfigured()) {
      throw new AiProviderError('AI provider is not configured (missing API key)');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: params.userPrompt },
          ],
          temperature: params.temperature ?? AI_TEMPERATURE,
          max_tokens: params.maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      // AbortError → timeout; anything else → network failure. (DOMException is
      // not an Error subclass in Node, so check the name directly.) Never
      // include the URL or key in the message.
      const timedOut =
        typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';
      throw new AiProviderError(
        timedOut ? 'AI provider request timed out' : 'AI provider is unreachable',
      );
    } finally {
      clearTimeout(timeout);
    }

    let body: ChatCompletionResponse;
    try {
      body = (await response.json()) as ChatCompletionResponse;
    } catch {
      throw new AiProviderError('AI provider returned a non-JSON response');
    }

    if (!response.ok) {
      const detail = body.error?.message;
      this.logger.warn(
        `AI provider HTTP ${response.status}${detail ? `: ${truncateForLog(detail)}` : ''}`,
      );
      throw new AiProviderError(`AI provider returned HTTP ${response.status}`);
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw new AiProviderError('AI provider returned an empty completion');
    }

    return { content: content.trim(), model: body.model ?? this.model };
  }
}

/** Keep provider error details out of logs beyond a short, safe excerpt. */
function truncateForLog(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
