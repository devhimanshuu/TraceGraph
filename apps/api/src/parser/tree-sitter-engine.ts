/**
 * Tree-sitter WASM Engine — loads and initializes web-tree-sitter,
 * manages grammar loading per language, and provides sync parse functions.
 *
 * Initialization is async (loads WASM), but parsing is sync.
 * Call initTreeSitter() once at app startup.
 */
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Logger } from '@nestjs/common';

const logger = new Logger('TreeSitterEngine');

// web-tree-sitter is a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-require-imports
let Parser: any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
let Language: any;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ws = require('web-tree-sitter');
  Parser = ws.default ?? ws;
  Language = ws.Language;
} catch {
  // Will fail gracefully — tree-sitter not available
}

const GRAMMAR_DIR = resolve(__dirname, 'grammars');

const LANGUAGE_GRAMMAR_MAP: Record<string, string> = {
  javascript: 'tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  python: 'tree-sitter-python.wasm',
  go: 'tree-sitter-go.wasm',
  java: 'tree-sitter-java.wasm',
  rust: 'tree-sitter-rust.wasm',
  php: 'tree-sitter-php.wasm',
  c_sharp: 'tree-sitter-c_sharp.wasm',
};

let initialized = false;
let parserInstance: any = null;
const loadedLanguages = new Map<string, any>();
let parseSyncFn: ((langName: string, source: string) => any) | null = null;

/**
 * Initialize the Tree-sitter WASM runtime.
 * Must be called once before any parsing. Safe to call multiple times.
 */
export async function initTreeSitter(): Promise<void> {
  if (initialized) return;
  if (!Parser) {
    logger.warn('web-tree-sitter not available — Tree-sitter parsing disabled');
    return;
  }
  try {
    // web-tree-sitter API varies by version — init may or may not exist
    if (typeof Parser.init === 'function') {
      await Parser.init();
    } else if (typeof Parser.prototype?.init === 'function') {
      const p = new Parser();
      await p.init();
    }
    parserInstance = new Parser();
    initialized = true;
    // Create a sync parse function that uses a dedicated parser per grammar
    parseSyncFn = (langName: string, source: string): any | null => {
      const lang = loadedLanguages.get(langName);
      if (!lang) return null;
      try {
        const p = new Parser();
        p.setLanguage(lang);
        return p.parse(source);
      } catch {
        return null;
      }
    };
    logger.log('Tree-sitter WASM engine initialized');
  } catch (err) {
    logger.error('Failed to initialize Tree-sitter WASM engine', err as Error);
  }
}

/**
 * Load a grammar by name (e.g. 'python', 'go', 'rust').
 * The grammar WASM file must exist in src/parser/grammars/.
 * Returns the Language object for use with setLanguage().
 */
export async function loadGrammar(name: string): Promise<any | null> {
  if (!initialized || !parserInstance) return null;

  if (loadedLanguages.has(name)) {
    return loadedLanguages.get(name);
  }

  const filename = LANGUAGE_GRAMMAR_MAP[name];
  if (!filename) {
    logger.warn(`No grammar mapping for language: ${name}`);
    return null;
  }

  const wasmPath = join(GRAMMAR_DIR, filename);
  try {
    const wasmBytes = await readFile(wasmPath);
    const lang = await Parser.Language.load(wasmBytes);
    loadedLanguages.set(name, lang);
    logger.log(`Loaded grammar: ${name}`);
    return lang;
  } catch (err) {
    logger.error(`Failed to load grammar: ${name}`, err as Error);
    return null;
  }
}

/**
 * Get a Parser instance with the specified language set.
 * Returns null if tree-sitter is not available or the language can't be loaded.
 */
export async function getParser(languageName: string): Promise<any | null> {
  if (!initialized || !parserInstance) return null;

  const lang = await loadGrammar(languageName);
  if (!lang) return null;

  parserInstance.setLanguage(lang);
  return parserInstance;
}

/**
 * Check if tree-sitter is available and initialized.
 */
export function isTreeSitterAvailable(): boolean {
  return initialized && parserInstance !== null;
}

/**
 * Synchronously parse source code with a pre-loaded grammar.
 * Must call initTreeSitter() and ensure the grammar is loaded first.
 */
export function parseSourceSync(
  languageName: string,
  source: string,
): any | null {
  if (!parseSyncFn) return null;
  return parseSyncFn(languageName, source);
}
