import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../config/configuration';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { AiProviderError } from './ai-provider.interface';

function configService(overrides: Partial<AiConfig> = {}): ConfigService {
  const ai: AiConfig = {
    enabled: true,
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiKey: 'gsk_test_key',
    baseUrl: 'https://api.groq.com/openai/v1/',
    maxTokens: 1024,
    timeoutMs: 5000,
    ...overrides,
  };
  return {
    getOrThrow: (key: string) => (key === 'ai' ? ai : undefined),
  } as unknown as ConfigService;
}

const PARAMS = {
  systemPrompt: 'system',
  userPrompt: 'user',
  maxTokens: 1024,
};

function okJson(content: string, model = 'llama-3.3-70b-versatile'): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }], model }),
  } as unknown as Response;
}

describe('OpenAiCompatibleProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('is not configured without an API key', () => {
    const provider = new OpenAiCompatibleProvider(configService({ apiKey: '' }));
    expect(provider.isConfigured()).toBe(false);
  });

  it('posts to the chat completions endpoint with the bearer key and JSON mode', async () => {
    const fetchMock = jest.fn(async () => okJson('{"summary":"ok"}')) as jest.Mock;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider(configService());

    const result = await provider.generateExplanation(PARAMS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer gsk_test_key');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('llama-3.3-70b-versatile');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toMatchObject({ role: 'system', content: 'system' });
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_tokens).toBe(1024);
    expect(result.content).toBe('{"summary":"ok"}');
    expect(result.model).toBe('llama-3.3-70b-versatile');
  });

  it('trims the base URL trailing slash', async () => {
    const fetchMock = jest.fn(async () => okJson('{"summary":"ok"}')) as jest.Mock;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider(configService({ baseUrl: 'https://api.groq.com/openai/v1/' }));
    await provider.generateExplanation(PARAMS);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      'https://api.groq.com/openai/v1/chat/completions',
    );
  });

  it('maps network failure to a sanitized AiProviderError', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider(configService());
    await expect(provider.generateExplanation(PARAMS)).rejects.toMatchObject({
      name: 'AiProviderError',
      message: 'AI provider is unreachable',
    });
  });

  it('maps a timeout to a sanitized AiProviderError', async () => {
    global.fetch = jest.fn(async () => {
      const err = new DOMException('aborted', 'AbortError');
      throw err;
    }) as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider(configService({ timeoutMs: 10 }));
    await expect(provider.generateExplanation(PARAMS)).rejects.toMatchObject({
      name: 'AiProviderError',
      message: 'AI provider request timed out',
    });
  });

  it('maps non-OK HTTP status to a sanitized error without exposing the key', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'invalid api key: gsk_test_key' } }),
    })) as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider(configService());
    const err: unknown = await provider.generateExplanation(PARAMS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as Error).message).toBe('AI provider returned HTTP 401');
  });

  it('rejects an empty completion', async () => {
    global.fetch = jest.fn(async () => okJson('   ')) as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider(configService());
    await expect(provider.generateExplanation(PARAMS)).rejects.toMatchObject({
      message: 'AI provider returned an empty completion',
    });
  });
});
