/**
 * Language detection — deterministic, extension-based, with optional
 * content sniffing for ambiguous files (e.g. Dockerfile, Makefile).
 */
import { ProgrammingLanguage } from './types';

/** Extension → language mapping. First match wins. */
const EXTENSION_MAP: Record<string, ProgrammingLanguage> = {
  '.ts': ProgrammingLanguage.TYPESCRIPT,
  '.tsx': ProgrammingLanguage.TYPESCRIPT,
  '.mts': ProgrammingLanguage.TYPESCRIPT,
  '.cts': ProgrammingLanguage.TYPESCRIPT,
  '.js': ProgrammingLanguage.JAVASCRIPT,
  '.jsx': ProgrammingLanguage.JAVASCRIPT,
  '.mjs': ProgrammingLanguage.JAVASCRIPT,
  '.cjs': ProgrammingLanguage.JAVASCRIPT,
  '.py': ProgrammingLanguage.PYTHON,
  '.pyi': ProgrammingLanguage.PYTHON,
  '.go': ProgrammingLanguage.GO,
  '.java': ProgrammingLanguage.JAVA,
  '.rs': ProgrammingLanguage.RUST,
  '.php': ProgrammingLanguage.PHP,
  '.phtml': ProgrammingLanguage.PHP,
  '.cs': ProgrammingLanguage.CSHARP,
};

/** Filename patterns → language (for extensionless files). */
const FILENAME_MAP: Record<string, ProgrammingLanguage> = {
  Dockerfile: ProgrammingLanguage.UNKNOWN,
  Makefile: ProgrammingLanguage.UNKNOWN,
  'GNUmakefile': ProgrammingLanguage.UNKNOWN,
};

/** Tree-sitter grammar name for each language. */
const GRAMMAR_MAP: Record<ProgrammingLanguage, string> = {
  [ProgrammingLanguage.TYPESCRIPT]: 'typescript',
  [ProgrammingLanguage.JAVASCRIPT]: 'javascript',
  [ProgrammingLanguage.PYTHON]: 'python',
  [ProgrammingLanguage.GO]: 'go',
  [ProgrammingLanguage.JAVA]: 'java',
  [ProgrammingLanguage.RUST]: 'rust',
  [ProgrammingLanguage.PHP]: 'php',
  [ProgrammingLanguage.CSHARP]: 'c_sharp',
  [ProgrammingLanguage.UNKNOWN]: '',
};

/**
 * Detect the programming language of a file by its path.
 * Deterministic: no I/O, no heuristics beyond extension/name matching.
 */
export function detectLanguage(filePath: string): ProgrammingLanguage {
  // Try extension first
  const lastSlash = filePath.lastIndexOf('/');
  const filename = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex >= 0) {
    const ext = filename.slice(dotIndex).toLowerCase();
    if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  }

  // Try exact filename match
  if (FILENAME_MAP[filename]) return FILENAME_MAP[filename];

  return ProgrammingLanguage.UNKNOWN;
}

/**
 * Get the tree-sitter grammar identifier for a language.
 * Returns empty string for UNKNOWN languages.
 */
export function getGrammarName(language: ProgrammingLanguage): string {
  return GRAMMAR_MAP[language] ?? '';
}

/**
 * Returns true if the file extension indicates a source file
 * we should attempt to parse.
 */
export function isParseableFile(filePath: string): boolean {
  return detectLanguage(filePath) !== ProgrammingLanguage.UNKNOWN;
}

/** File extensions supported by each language. */
export const LANGUAGE_EXTENSIONS: Record<ProgrammingLanguage, string[]> = {
  [ProgrammingLanguage.TYPESCRIPT]: ['.ts', '.tsx', '.mts', '.cts'],
  [ProgrammingLanguage.JAVASCRIPT]: ['.js', '.jsx', '.mjs', '.cjs'],
  [ProgrammingLanguage.PYTHON]: ['.py', '.pyi'],
  [ProgrammingLanguage.GO]: ['.go'],
  [ProgrammingLanguage.JAVA]: ['.java'],
  [ProgrammingLanguage.RUST]: ['.rs'],
  [ProgrammingLanguage.PHP]: ['.php', '.phtml'],
  [ProgrammingLanguage.CSHARP]: ['.cs'],
  [ProgrammingLanguage.UNKNOWN]: [],
};

/** D.ts files should be skipped (declarations, not implementation). */
export function shouldSkipFile(filePath: string): boolean {
  return filePath.endsWith('.d.ts') || filePath.endsWith('.d.mts');
}
