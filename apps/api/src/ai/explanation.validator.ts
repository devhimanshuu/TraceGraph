/**
 * ExplanationValidator.
 *
 * The LLM response is untrusted input. Before it can be returned to the client
 * it must satisfy the schema (required fields, lengths, array caps, confidence
 * vocabulary) and every cited evidence id must actually exist in the evidence
 * payload the backend built. Nothing is blindly cast to a TypeScript type.
 */
import { Injectable } from '@nestjs/common';
import type { AiConfidence } from '@tracegraph/shared';
import {
  MAX_EVIDENCE_REFERENCES,
  MAX_FINDING_LENGTH,
  MAX_IMPACT_NAME_LENGTH,
  MAX_IMPACT_NAMES,
  MAX_KEY_FINDINGS,
  MAX_SUMMARY_LENGTH,
} from './ai.constants';

/** Thrown when the model's output fails validation. */
export class AiInvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiInvalidResponseError';
  }
}

export interface ValidatedExplanation {
  summary: string;
  keyFindings: string[];
  directImpact: string[];
  indirectImpact: string[];
  evidenceReferences: string[];
  confidence: AiConfidence;
}

const CONFIDENCE_VALUES: AiConfidence[] = ['high', 'medium', 'insufficient'];

@Injectable()
export class ExplanationValidator {
  /**
   * @param rawText  raw model output (JSON text; may be wrapped in fences)
   * @param validIds every evidence id that exists (E1, E2, …)
   */
  validate(rawText: string, validIds: Set<string>): ValidatedExplanation {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(rawText));
    } catch {
      throw new AiInvalidResponseError('AI response was not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new AiInvalidResponseError('AI response was not a JSON object');
    }
    const obj = parsed as Record<string, unknown>;

    // 1. Summary — required, non-empty, bounded.
    const summary = this.requireString(obj.summary, 'summary', MAX_SUMMARY_LENGTH);
    if (summary.length === 0) {
      throw new AiInvalidResponseError('AI response had an empty summary');
    }

    // 2. Key findings — optional-ish array, bounded count + length.
    const keyFindings = this.stringArray(obj.keyFindings, 'keyFindings', MAX_KEY_FINDINGS, MAX_FINDING_LENGTH);

    // 3. Direct / indirect impact names — bounded arrays of bounded strings.
    const directImpact = this.stringArray(obj.directImpact, 'directImpact', MAX_IMPACT_NAMES, MAX_IMPACT_NAME_LENGTH);
    const indirectImpact = this.stringArray(obj.indirectImpact, 'indirectImpact', MAX_IMPACT_NAMES, MAX_IMPACT_NAME_LENGTH);

    // 4. Evidence references — every id must exist (hallucination defense).
    const rawRefs = this.stringArray(obj.evidenceReferences, 'evidenceReferences', MAX_EVIDENCE_REFERENCES, 16);
    const evidenceReferences: string[] = [];
    for (const ref of rawRefs) {
      if (!/^E\d+$/.test(ref)) {
        throw new AiInvalidResponseError(`AI response referenced invalid evidence id "${ref}"`);
      }
      if (!validIds.has(ref)) {
        throw new AiInvalidResponseError(`AI response referenced unknown evidence id "${ref}"`);
      }
      evidenceReferences.push(ref);
    }

    // 5. Confidence — closed vocabulary.
    const confidence = this.confidence(obj.confidence);

    return { summary, keyFindings, directImpact, indirectImpact, evidenceReferences, confidence };
  }

  private requireString(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== 'string') {
      throw new AiInvalidResponseError(`AI response field "${field}" must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
      throw new AiInvalidResponseError(`AI response field "${field}" exceeded ${maxLength} chars`);
    }
    return trimmed;
  }

  private stringArray(value: unknown, field: string, maxItems: number, maxItemLength: number): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > maxItems) {
      throw new AiInvalidResponseError(`AI response field "${field}" must be an array of at most ${maxItems} items`);
    }
    return value.map((item) => this.requireString(item, `${field}[]`, maxItemLength));
  }

  private confidence(value: unknown): AiConfidence {
    if (typeof value !== 'string' || !CONFIDENCE_VALUES.includes(value as AiConfidence)) {
      throw new AiInvalidResponseError('AI response confidence must be "high", "medium", or "insufficient"');
    }
    return value as AiConfidence;
  }
}

/** Tolerate models that wrap JSON in ```json fences despite JSON mode. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1] : trimmed;
}
