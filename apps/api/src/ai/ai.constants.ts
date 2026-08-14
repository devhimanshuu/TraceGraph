/**
 * AI explanation bounds + error taxonomy.
 *
 * Evidence limits: the LLM never receives the whole graph —
 * only a bounded, structured evidence payload. These caps keep latency and cost
 * low while still giving the model enough to write a grounded explanation.
 */
export const MAX_EVIDENCE_PATHS = 10;
export const MAX_EVIDENCE_TESTS = 8;
export const MAX_EVIDENCE_COMMITS = 5;
export const MAX_EVIDENCE_PULL_REQUESTS = 5;
export const MAX_EVIDENCE_ISSUES = 5;

/** Long free-text fields are truncated before entering the evidence payload. */
export const MAX_EVIDENCE_TEXT_LENGTH = 120;

/** Response-shape validation caps. */
export const MAX_SUMMARY_LENGTH = 800;
export const MAX_FINDING_LENGTH = 300;
export const MAX_KEY_FINDINGS = 6;
export const MAX_IMPACT_NAMES = 40;
export const MAX_IMPACT_NAME_LENGTH = 200;
export const MAX_EVIDENCE_REFERENCES = 20;

/** Temperature for explanation generation — low for grounded, stable output. */
export const AI_TEMPERATURE = 0.2;

/**
 * Domain error codes returned by the explain endpoint. The exception filter
 * passes custom `code` values through when present in the HttpException body.
 */
export const AI_ERROR_CODES = {
  /** AI_ENABLED=false — the feature is off; deterministic analysis is intact. */
  DISABLED: 'AI_DISABLED',
  /** Provider unreachable, timed out, or missing API key. */
  UNAVAILABLE: 'AI_UNAVAILABLE',
  /** The model returned malformed or ungrounded output that failed validation. */
  INVALID_RESPONSE: 'AI_INVALID_RESPONSE',
} as const;
