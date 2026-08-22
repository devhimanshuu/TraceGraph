/**
 * Normalized Code Intelligence IR (Intermediate Representation).
 *
 * Every parser (TypeScript, Python, Go, etc.) must produce this exact shape.
 * The rest of TraceGraph consumes only these types and never touches parser-
 * specific AST nodes.
 *
 * Architecture:
 *   Tree-sitter → Language Adapter → CodeIntelligenceIR → GraphWriter → CognoDB
 */

// ── Language enum ────────────────────────────────────────────────────────────

export enum ProgrammingLanguage {
  TYPESCRIPT = 'TypeScript',
  JAVASCRIPT = 'JavaScript',
  PYTHON = 'Python',
  GO = 'Go',
  JAVA = 'Java',
  RUST = 'Rust',
  PHP = 'PHP',
  CSHARP = 'C#',
  UNKNOWN = 'Unknown',
}

// ── Source location ──────────────────────────────────────────────────────────

export interface SourceLocation {
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
}

// ── File metadata ────────────────────────────────────────────────────────────

export interface ParsedFileMeta {
  /** Repo-relative path with forward slashes. */
  path: string;
  language: ProgrammingLanguage;
  extension: string;
  sizeBytes: number;
  lineCount: number;
  /** SHA-256 hex digest of the file content (for incremental sync). */
  contentHash: string;
}

// ── Symbol kinds ─────────────────────────────────────────────────────────────

export enum SymbolKind {
  FUNCTION = 'function',
  METHOD = 'method',
  CLASS = 'class',
  INTERFACE = 'interface',
  ENUM = 'enum',
  STRUCT = 'struct',
  MODULE = 'module',
  VARIABLE = 'variable',
  CONSTANT = 'constant',
  TYPE = 'type',
  NAMESPACE = 'namespace',
  TRAIT = 'trait',
  IMPL = 'impl',
  DECORATOR = 'decorator',
  PROPERTY = 'property',
  CONSTRUCTOR = 'constructor',
}

// ── Symbol ───────────────────────────────────────────────────────────────────

export interface ParsedSymbol {
  /** Deterministic, unique, stable ID: `fn:path:Name` or `fn:path:Name.method`. */
  id: string;
  kind: SymbolKind;
  name: string;
  /** Short name for reference resolution (e.g. `method` for `Class.method`). */
  shortName: string;
  /** Human-readable signature, e.g. `processPayment(amount, retries)`. */
  signature?: string;
  visibility: 'public' | 'private' | 'protected' | 'internal';
  sourceLocation: SourceLocation;
  /** Fully-qualified parent symbol name, when nested. */
  parentName?: string;
  /** Repo-relative path of the file containing this symbol. */
  filePath: string;
  /** Language-specific metadata (decorators, annotations, etc.). */
  metadata?: Record<string, unknown>;
}

// ── Relationship kinds ───────────────────────────────────────────────────────

export enum RelationshipKind {
  CONTAINS = 'CONTAINS',
  IMPORTS = 'IMPORTS',
  CALLS = 'CALLS',
  EXTENDS = 'EXTENDS',
  IMPLEMENTS = 'IMPLEMENTS',
  REFERENCES = 'REFERENCES',
  DEFINES = 'DEFINES',
  OVERRIDES = 'OVERRIDES',
  TESTS = 'TESTS',
  /** Cross-language dependency: one file invokes/orchestrates another language's code. */
  CROSS_LANGUAGE = 'CROSS_LANGUAGE',
}

// ── Relationship ─────────────────────────────────────────────────────────────

export interface ParsedRelationship {
  fromId: string;
  toId: string;
  kind: RelationshipKind;
  /** Confidence of static resolution. */
  resolution: 'resolved' | 'partial' | 'unresolved';
  /** Optional line number where the relationship occurs. */
  line?: number;
  /** Optional reason string for evidence tooltips. */
  reason?: string;
}

// ── Import ───────────────────────────────────────────────────────────────────

export interface ParsedImport {
  /** Raw import specifier (e.g. `./utils`, `fs`, `github.com/foo/bar`). */
  specifier: string;
  /** Local names introduced by this import. */
  localNames: string[];
  /** Whether this is a wildcard/namespace import. */
  isNamespace: boolean;
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

export enum DiagnosticSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export interface ParserDiagnostic {
  file: string;
  language: ProgrammingLanguage;
  severity: DiagnosticSeverity;
  message: string;
  line?: number;
  parser: string;
}

// ── Parser capabilities ──────────────────────────────────────────────────────

export type CapabilityStatus = 'full' | 'partial' | 'none';

export interface LanguageCapabilities {
  language: ProgrammingLanguage;
  parsing: CapabilityStatus;
  symbols: CapabilityStatus;
  imports: CapabilityStatus;
  calls: CapabilityStatus;
  inheritance: CapabilityStatus;
  parserVersion: number;
}

// ── Parse result ─────────────────────────────────────────────────────────────

export interface ParseResult {
  /** File metadata for the parsed file. */
  file: ParsedFileMeta;
  /** All symbols extracted from this file. */
  symbols: ParsedSymbol[];
  /** All relationships extracted from this file. */
  relationships: ParsedRelationship[];
  /** Import statements found in this file. */
  imports: ParsedImport[];
  /** Diagnostics for this file (non-fatal). */
  diagnostics: ParserDiagnostic[];
}

// ── Batch parse result ───────────────────────────────────────────────────────

export interface BatchParseResult {
  /** Successfully parsed files. */
  files: ParsedFileMeta[];
  /** All symbols across all files. */
  symbols: ParsedSymbol[];
  /** All relationships across all files. */
  relationships: ParsedRelationship[];
  /** All diagnostics. */
  diagnostics: ParserDiagnostic[];
  /** Language distribution. */
  languageDistribution: Record<string, number>;
  /** Summary statistics. */
  stats: {
    filesDiscovered: number;
    filesParsed: number;
    filesFailed: number;
    filesSkipped: number;
    entitiesExtracted: number;
    relationshipsExtracted: number;
    parseErrors: number;
    parseDurationMs: number;
  };
}
