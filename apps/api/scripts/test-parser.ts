#!/usr/bin/env ts-node
/**
 * test-parser.ts — CLI command to test the multi-language parser platform.
 *
 * Usage:
 *   npx ts-node scripts/test-parser.ts [directory]
 *   npx ts-node scripts/test-parser.ts ../test/fixtures/multi-lang
 *
 * Reports:
 *   Files discovered per language
 *   Entities extracted
 *   Relationships extracted
 *   Parse errors
 *   Duration
 */

import { resolve } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  ProgrammingLanguage,
  SymbolKind,
  RelationshipKind,
  type ParseResult,
  type ParsedSymbol,
  type ParsedRelationship,
  type ParserDiagnostic,
  type ParsedFileMeta,
  type BatchParseResult,
} from '../src/parser/types';
import { detectLanguage, isParseableFile, shouldSkipFile } from '../src/parser/language';
import { initTreeSitter } from '../src/parser/tree-sitter-engine';
import { TypeScriptAdapter } from '../src/parser/adapters/typescript.adapter';
import { JavaScriptAdapter } from '../src/parser/adapters/javascript.adapter';
import { PythonAdapter } from '../src/parser/adapters/python.adapter';
import { GoAdapter } from '../src/parser/adapters/go.adapter';
import { JavaAdapter } from '../src/parser/adapters/java.adapter';
import { RustAdapter } from '../src/parser/adapters/rust.adapter';
import { PhpAdapter } from '../src/parser/adapters/php.adapter';
import { CSharpAdapter } from '../src/parser/adapters/csharp.adapter';
import type { LanguageParser } from '../src/parser/parser.interface';
import { DiagnosticSeverity } from '../src/parser/types';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__',
  '.venv', 'target', 'vendor',
]);

const MAX_FILES = 5000;
const MAX_FILE_BYTES = 500000;

async function walk(current: string, relative: string, files: string[]): Promise<void> {
  if (files.length >= MAX_FILES) return;
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= MAX_FILES) return;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      await walk(`${current}/${entry.name}`, relative ? `${relative}/${entry.name}` : entry.name, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (isParseableFile(path) && !shouldSkipFile(path)) {
      files.push(path);
    }
  }
}

async function main() {
  const dir = resolve(process.argv[2] ?? '.');
  console.log(`\n🔍 Parsing directory: ${dir}\n`);

  // Init tree-sitter
  await initTreeSitter();
  console.log('Tree-sitter WASM engine initialized\n');

  // Collect adapters
  const adapters: LanguageParser[] = [
    new TypeScriptAdapter(),
    new JavaScriptAdapter(),
    new PythonAdapter(),
    new GoAdapter(),
    new JavaAdapter(),
    new RustAdapter(),
    new PhpAdapter(),
    new CSharpAdapter(),
  ];

  // Discover files
  const filePaths: string[] = [];
  await walk(dir, '', filePaths);

  // Group by language
  const byLanguage = new Map<string, { files: string[]; adapter: LanguageParser }>();
  for (const adapter of adapters) {
    const lang = adapter.language;
    const langFiles = filePaths.filter((f) => detectLanguage(f) === lang);
    if (langFiles.length > 0) {
      byLanguage.set(lang, { files: langFiles, adapter });
    }
  }

  // Report
  console.log(`Files discovered: ${filePaths.length}\n`);
  for (const [lang, { files }] of byLanguage) {
    console.log(`  ${lang}: ${files.length}`);
  }

  // Parse each language
  const allSymbols: ParsedSymbol[] = [];
  const allRelationships: ParsedRelationship[] = [];
  const allDiagnostics: ParserDiagnostic[] = [];
  const parsedFiles: ParsedFileMeta[] = [];
  let filesParsed = 0;
  let filesFailed = 0;

  const fileIds = new Map(filePaths.map((f) => [f, `file:${f}`]));

  for (const [lang, { files, adapter }] of byLanguage) {
    console.log(`\n── Parsing ${lang} (${files.length} files) ──`);

    for (const filePath of files) {
      try {
        const abs = `${dir}/${filePath}`;
        const s = await stat(abs);
        if (s.size > MAX_FILE_BYTES) continue;

        const source = await readFile(abs, 'utf8');
        const result = adapter.parse({
          filePath,
          source,
          allFilePaths: filePaths,
          fileIds,
        });

        parsedFiles.push(result.file);
        allSymbols.push(...result.symbols);
        allRelationships.push(...result.relationships);
        allDiagnostics.push(...result.diagnostics);
        filesParsed++;

        if (result.symbols.length > 0) {
          console.log(`  ✓ ${filePath}: ${result.symbols.length} symbols, ${result.relationships.length} relationships`);
        }
      } catch (err) {
        allDiagnostics.push({
          file: filePath,
          language: lang as ProgrammingLanguage,
          severity: DiagnosticSeverity.ERROR,
          message: (err as Error).message,
          parser: adapter.constructor.name,
        });
        filesFailed++;
        console.log(`  ✗ ${filePath}: ${(err as Error).message}`);
      }
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`PARSE SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Files discovered:   ${filePaths.length}`);
  console.log(`Files parsed:       ${filesParsed}`);
  console.log(`Files failed:       ${filesFailed}`);
  console.log(`Entities extracted: ${allSymbols.length}`);
  console.log(`Relationships:      ${allRelationships.length}`);
  console.log(`Diagnostics:        ${allDiagnostics.length}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Entity breakdown
  const kindCounts = new Map<string, number>();
  for (const s of allSymbols) {
    kindCounts.set(s.kind, (kindCounts.get(s.kind) ?? 0) + 1);
  }
  console.log('Entity breakdown:');
  for (const [kind, count] of [...kindCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind}: ${count}`);
  }

  // Relationship breakdown
  const relCounts = new Map<string, number>();
  for (const r of allRelationships) {
    relCounts.set(r.kind, (relCounts.get(r.kind) ?? 0) + 1);
  }
  console.log('\nRelationship breakdown:');
  for (const [kind, count] of [...relCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind}: ${count}`);
  }

  // Diagnostics
  if (allDiagnostics.length > 0) {
    console.log('\nDiagnostics:');
    for (const d of allDiagnostics.slice(0, 20)) {
      console.log(`  [${d.severity}] ${d.file}: ${d.message}`);
    }
    if (allDiagnostics.length > 20) {
      console.log(`  ... and ${allDiagnostics.length - 20} more`);
    }
  }

  // Capability matrix
  console.log('\nLanguage Capabilities:');
  console.log(`${'Language'.padEnd(14)} ${'Parsing'.padEnd(10)} ${'Symbols'.padEnd(10)} ${'Imports'.padEnd(10)} ${'Calls'.padEnd(10)} ${'Inherit'.padEnd(10)} ${'Version'}`);
  for (const adapter of adapters) {
    const caps = adapter.getCapabilities();
    console.log(
      `${caps.language.padEnd(14)} ${caps.parsing.padEnd(10)} ${caps.symbols.padEnd(10)} ${caps.imports.padEnd(10)} ${caps.calls.padEnd(10)} ${caps.inheritance.padEnd(10)} v${caps.parserVersion}`
    );
  }

  console.log('\n✅ Done.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
