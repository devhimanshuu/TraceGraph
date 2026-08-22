/**
 * ParserRegistry — central registry mapping languages to parser adapters.
 *
 * The pipeline queries the registry to find the right adapter for a file.
 * Adapters register themselves; the registry never knows about specifics.
 */
import { Injectable, Logger } from '@nestjs/common';
import { detectLanguage, getGrammarName } from './language';
import { ProgrammingLanguage, type LanguageCapabilities } from './types';
import type { LanguageParser } from './parser.interface';
import { initTreeSitter, isTreeSitterAvailable } from './tree-sitter-engine';

import { TypeScriptAdapter } from './adapters/typescript.adapter';
import { JavaScriptAdapter } from './adapters/javascript.adapter';
import { PythonAdapter } from './adapters/python.adapter';
import { GoAdapter } from './adapters/go.adapter';
import { JavaAdapter } from './adapters/java.adapter';
import { RustAdapter } from './adapters/rust.adapter';
import { PhpAdapter } from './adapters/php.adapter';
import { CSharpAdapter } from './adapters/csharp.adapter';

@Injectable()
export class ParserRegistry {
  private readonly logger = new Logger(ParserRegistry.name);
  private readonly adapters = new Map<ProgrammingLanguage, LanguageParser>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize tree-sitter WASM engine
    await initTreeSitter();
    const tsAvailable = isTreeSitterAvailable();

    // Register all adapters
    const adapterClasses: Array<new (...args: any[]) => LanguageParser> = [
      TypeScriptAdapter,
      JavaScriptAdapter,
      PythonAdapter,
      GoAdapter,
      JavaAdapter,
      RustAdapter,
      PhpAdapter,
      CSharpAdapter,
    ];

    for (const AdapterClass of adapterClasses) {
      try {
        const adapter = new AdapterClass();
        this.adapters.set(adapter.language, adapter);
        this.logger.log(`Registered adapter: ${adapter.language} (parser v${adapter.parserVersion})`);
      } catch (err) {
        this.logger.error(`Failed to register adapter: ${AdapterClass.name}`, err as Error);
      }
    }

    this.initialized = true;
    this.logger.log(
      `ParserRegistry initialized: ${this.adapters.size} adapters, ` +
      `tree-sitter: ${tsAvailable ? 'available' : 'unavailable'}`,
    );
  }

  /**
   * Get the parser adapter for a given file path.
   * Returns null if no adapter handles this language.
   */
  getAdapterForFile(filePath: string): LanguageParser | null {
    const language = detectLanguage(filePath);
    return this.adapters.get(language) ?? null;
  }

  /**
   * Get the parser adapter for a specific language.
   */
  getAdapterForLanguage(language: ProgrammingLanguage): LanguageParser | null {
    return this.adapters.get(language) ?? null;
  }

  /**
   * Get all registered adapters.
   */
  getAllAdapters(): LanguageParser[] {
    return [...this.adapters.values()];
  }

  /**
   * Get capability matrix for all registered languages.
   */
  getCapabilityMatrix(): LanguageCapabilities[] {
    return this.getAllAdapters().map((a) => a.getCapabilities());
  }

  /**
   * Get the tree-sitter grammar name for a language.
   */
  getGrammarName(language: ProgrammingLanguage): string {
    return getGrammarName(language);
  }

  /**
   * Get supported languages.
   */
  getSupportedLanguages(): ProgrammingLanguage[] {
    return [...this.adapters.keys()];
  }
}
