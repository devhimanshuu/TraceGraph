/**
 * AiProvider abstraction. The rest of TraceGraph depends on this
 * interface — never on a specific LLM vendor. One working provider (Groq via
 * the OpenAI-compatible API) is provided; swapping vendors
 * means implementing this interface, not touching the service layer.
 */
export interface GenerateExplanationParams {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
}

export interface AiProviderResult {
  /** Raw model output (JSON text). */
  content: string;
  /** Provider-reported model id, echoed into the response contract. */
  model: string;
}

export interface AiProvider {
  readonly name: string;
  /** True when the provider can actually be called (key + endpoint present). */
  isConfigured(): boolean;
  generateExplanation(params: GenerateExplanationParams): Promise<AiProviderResult>;
}

/**
 * Provider-level failure — message is sanitized for logging; the service maps
 * it to a clean 502 for the client (no provider internals, no key material).
 */
export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}
