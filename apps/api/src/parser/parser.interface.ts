/**
 * LanguageParser — the common contract every language adapter must implement.
 *
 * The registry maps languages to adapters; the pipeline calls these methods
 * without knowing which language it is processing.
 */
import {
  type LanguageCapabilities,
  type ParseResult,
  type ParsedFileMeta,
  type ParsedRelationship,
  type ParsedSymbol,
  type ParserDiagnostic,
  type ProgrammingLanguage,
} from './types';

export interface ParseContext {
  /** Repo-relative path of the file being parsed. */
  filePath: string;
  /** Full file content. */
  source: string;
  /** Repo-relative paths of ALL files in the repository (for import resolution). */
  allFilePaths: string[];
  /** Map from file path → file ID (for cross-file resolution). */
  fileIds: Map<string, string>;
}

/**
 * Every language adapter implements this interface.
 *
 * The adapter is responsible for:
 * 1. Parsing the source code (via Tree-sitter or other means)
 * 2. Extracting symbols (functions, classes, etc.)
 * 3. Extracting relationships (imports, calls, extends, etc.)
 * 4. Reporting its capabilities honestly
 */
export interface LanguageParser {
  /** The programming language this parser handles. */
  readonly language: ProgrammingLanguage;

  /** Parser version — bump when extraction logic changes materially. */
  readonly parserVersion: number;

  /**
   * Fast check: can this parser handle the given file path?
   * Called before parse() to skip irrelevant files.
   */
  canParse(filePath: string): boolean;

  /**
   * Parse a single source file and extract symbols + relationships.
   *
   * Must NEVER throw. On error, return a ParseResult with diagnostics
   * and empty symbols/relationships.
   */
  parse(context: ParseContext): ParseResult;

  /**
   * Resolve an import specifier to a file path in the repository.
   * Returns the repo-relative path or null if unresolvable.
   */
  resolveImport(specifier: string, fromDir: string, allFilePaths: string[]): string | null;

  /**
   * Return the capabilities of this parser.
   * Used by the UI and diagnostics to show honest coverage.
   */
  getCapabilities(): LanguageCapabilities;
}
