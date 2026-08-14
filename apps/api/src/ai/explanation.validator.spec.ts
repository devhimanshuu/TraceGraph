import { ExplanationValidator, AiInvalidResponseError } from './explanation.validator';

const VALID_IDS = new Set(['E1', 'E2', 'E3', 'E4']);

const validJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    summary: 'CheckoutService is directly affected because it calls PaymentService.',
    keyFindings: ['CheckoutService is directly affected'],
    directImpact: ['CheckoutService'],
    indirectImpact: ['OrderService'],
    evidenceReferences: ['E1', 'E2'],
    confidence: 'high',
    ...overrides,
  });

const validator = new ExplanationValidator();

describe('ExplanationValidator', () => {
  it('accepts a well-formed response and returns the validated shape', () => {
    const out = validator.validate(validJson(), VALID_IDS);
    expect(out.summary).toContain('CheckoutService');
    expect(out.keyFindings).toEqual(['CheckoutService is directly affected']);
    expect(out.directImpact).toEqual(['CheckoutService']);
    expect(out.indirectImpact).toEqual(['OrderService']);
    expect(out.evidenceReferences).toEqual(['E1', 'E2']);
    expect(out.confidence).toBe('high');
  });

  it('tolerates a JSON code fence wrapper', () => {
    const out = validator.validate(`\`\`\`json\n${validJson()}\n\`\`\``, VALID_IDS);
    expect(out.summary).toContain('CheckoutService');
  });

  it('rejects malformed JSON', () => {
    expect(() => validator.validate('{not json', VALID_IDS)).toThrow(AiInvalidResponseError);
    expect(() => validator.validate('not json at all', VALID_IDS)).toThrow(AiInvalidResponseError);
  });

  it('rejects a non-object response', () => {
    expect(() => validator.validate('["E1"]', VALID_IDS)).toThrow(AiInvalidResponseError);
    expect(() => validator.validate('42', VALID_IDS)).toThrow(AiInvalidResponseError);
  });

  it('rejects an empty summary', () => {
    expect(() => validator.validate(validJson({ summary: '   ' }), VALID_IDS)).toThrow(
      AiInvalidResponseError,
    );
  });

  it('rejects an over-long summary', () => {
    expect(() => validator.validate(validJson({ summary: 'x'.repeat(900) }), VALID_IDS)).toThrow(
      AiInvalidResponseError,
    );
  });

  it('rejects too many key findings', () => {
    expect(() =>
      validator.validate(validJson({ keyFindings: Array.from({ length: 9 }, () => 'finding') }), VALID_IDS),
    ).toThrow(AiInvalidResponseError);
  });

  it('rejects evidence references that do not exist (hallucination defense)', () => {
    expect(() => validator.validate(validJson({ evidenceReferences: ['E99'] }), VALID_IDS)).toThrow(
      /unknown evidence id "E99"/,
    );
  });

  it('rejects malformed evidence id shapes', () => {
    expect(() => validator.validate(validJson({ evidenceReferences: ['E'] }), VALID_IDS)).toThrow(
      AiInvalidResponseError,
    );
    expect(() => validator.validate(validJson({ evidenceReferences: ['[E1]'] }), VALID_IDS)).toThrow(
      AiInvalidResponseError,
    );
  });

  it('rejects unknown confidence vocabulary', () => {
    expect(() => validator.validate(validJson({ confidence: '87%' }), VALID_IDS)).toThrow(
      AiInvalidResponseError,
    );
    expect(() => validator.validate(validJson({ confidence: 'very high' }), VALID_IDS)).toThrow(
      AiInvalidResponseError,
    );
  });

  it('accepts all confidence values', () => {
    for (const confidence of ['high', 'medium', 'insufficient']) {
      expect(validator.validate(validJson({ confidence }), VALID_IDS).confidence).toBe(confidence);
    }
  });

  it('allows omitted optional arrays', () => {
    const out = validator.validate(
      validJson({ keyFindings: undefined, directImpact: undefined, indirectImpact: undefined, evidenceReferences: undefined }),
      VALID_IDS,
    );
    expect(out.keyFindings).toEqual([]);
    expect(out.evidenceReferences).toEqual([]);
  });

  it('rejects non-string entries in arrays', () => {
    expect(() => validator.validate(validJson({ directImpact: [42] }), VALID_IDS)).toThrow(
      AiInvalidResponseError,
    );
  });
});
