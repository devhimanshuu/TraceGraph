/**
 * Parser Platform — comprehensive test suite.
 *
 * Tests:
 * - Language detection
 * - Adapter capabilities
 * - Normalized IR output per language
 * - Cross-language contract tests
 * - Stable ID generation
 * - Content hashing
 * - Import resolution
 * - Error handling (malformed files)
 */

import { detectLanguage, isParseableFile, shouldSkipFile } from './language';
import { ProgrammingLanguage } from './types';
import { SymbolKind, RelationshipKind, DiagnosticSeverity, type ParseResult } from './types';
import type { ParseContext, LanguageParser } from './parser.interface';
import { TypeScriptAdapter } from './adapters/typescript.adapter';
import { JavaScriptAdapter } from './adapters/javascript.adapter';
import { PythonAdapter } from './adapters/python.adapter';
import { GoAdapter } from './adapters/go.adapter';
import { JavaAdapter } from './adapters/java.adapter';
import { RustAdapter } from './adapters/rust.adapter';
import { PhpAdapter } from './adapters/php.adapter';
import { CSharpAdapter } from './adapters/csharp.adapter';
import { ParserRegistry } from './parser-registry';

// ── Language Detection Tests ──────────────────────────────────────────────

describe('Language Detection', () => {
  it('detects TypeScript files', () => {
    expect(detectLanguage('src/app.ts')).toBe(ProgrammingLanguage.TYPESCRIPT);
    expect(detectLanguage('src/components/Button.tsx')).toBe(ProgrammingLanguage.TYPESCRIPT);
    expect(detectLanguage('lib/utils.mts')).toBe(ProgrammingLanguage.TYPESCRIPT);
  });

  it('detects JavaScript files', () => {
    expect(detectLanguage('src/app.js')).toBe(ProgrammingLanguage.JAVASCRIPT);
    expect(detectLanguage('src/App.jsx')).toBe(ProgrammingLanguage.JAVASCRIPT);
    expect(detectLanguage('lib/utils.mjs')).toBe(ProgrammingLanguage.JAVASCRIPT);
  });

  it('detects Python files', () => {
    expect(detectLanguage('src/app.py')).toBe(ProgrammingLanguage.PYTHON);
    expect(detectLanguage('lib/types.pyi')).toBe(ProgrammingLanguage.PYTHON);
  });

  it('detects Go files', () => {
    expect(detectLanguage('cmd/server.go')).toBe(ProgrammingLanguage.GO);
  });

  it('detects Java files', () => {
    expect(detectLanguage('src/main/java/App.java')).toBe(ProgrammingLanguage.JAVA);
  });

  it('detects Rust files', () => {
    expect(detectLanguage('src/main.rs')).toBe(ProgrammingLanguage.RUST);
  });

  it('detects PHP files', () => {
    expect(detectLanguage('public/index.php')).toBe(ProgrammingLanguage.PHP);
  });

  it('detects C# files', () => {
    expect(detectLanguage('src/Program.cs')).toBe(ProgrammingLanguage.CSHARP);
  });

  it('returns UNKNOWN for unsupported files', () => {
    expect(detectLanguage('README.md')).toBe(ProgrammingLanguage.UNKNOWN);
    expect(detectLanguage('style.css')).toBe(ProgrammingLanguage.UNKNOWN);
    expect(detectLanguage('data.json')).toBe(ProgrammingLanguage.UNKNOWN);
  });

  it('skips d.ts files', () => {
    expect(shouldSkipFile('types/index.d.ts')).toBe(true);
    expect(shouldSkipFile('lib/utils.d.mts')).toBe(true);
  });

  it('identifies parseable files', () => {
    expect(isParseableFile('src/app.ts')).toBe(true);
    expect(isParseableFile('README.md')).toBe(false);
  });
});

// ── Adapter Capability Tests ──────────────────────────────────────────────

describe('Parser Adapters', () => {
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

  describe.each(adapters.map((a) => [a.language, a]))('%s adapter', (_lang, adapter) => {
    it('reports capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.language).toBeDefined();
      expect(caps.parserVersion).toBeGreaterThan(0);
      expect(['full', 'partial', 'none']).toContain(caps.parsing);
    });

    it('parses source code without throwing', () => {
      const filePath = getFixtureForLanguage(adapter.language);
      const source = getFixtureSource(adapter.language);
      const result = adapter.parse(makeContext(filePath, source));
      expect(result).toBeDefined();
      expect(result.file).toBeDefined();
      expect(result.symbols).toBeDefined();
      expect(result.relationships).toBeDefined();
      expect(Array.isArray(result.diagnostics)).toBe(true);
    });

    it('extracts at least one symbol', () => {
      const source = getFixtureSource(adapter.language);
      const filePath = getFixtureForLanguage(adapter.language);
      const result = adapter.parse(makeContext(filePath, source));
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it('assigns stable deterministic IDs', () => {
      const source = getFixtureSource(adapter.language);
      const filePath = getFixtureForLanguage(adapter.language);
      const ctx = makeContext(filePath, source);
      const result1 = adapter.parse(ctx);
      const result2 = adapter.parse(ctx);
      expect(result1.symbols.map((s) => s.id).sort()).toEqual(result2.symbols.map((s) => s.id).sort());
    });

    it('produces a content hash', () => {
      const source = getFixtureSource(adapter.language);
      const filePath = getFixtureForLanguage(adapter.language);
      const result = adapter.parse(makeContext(filePath, source));
      expect(result.file.contentHash).toBeTruthy();
      expect(result.file.contentHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('includes language in file metadata', () => {
      const source = getFixtureSource(adapter.language);
      const filePath = getFixtureForLanguage(adapter.language);
      const result = adapter.parse(makeContext(filePath, source));
      expect(result.file.language).toBe(adapter.language);
    });

    it('handles empty source gracefully', () => {
      const result = adapter.parse(makeContext('test.ts', ''));
      expect(result.symbols).toHaveLength(0);
      expect(result.file.lineCount).toBe(1);
    });

    it('handles malformed source gracefully', () => {
      const result = adapter.parse(makeContext('test.ts', 'function {{{ broken { { {'));
      expect(result).toBeDefined();
      expect(result.file).toBeDefined();
    });
  });
});

// ── Cross-Language Contract Tests ─────────────────────────────────────────

describe('Cross-Language Contract', () => {
  const adapters: Array<{ lang: string; adapter: LanguageParser; symbolKind: SymbolKind }> = [
    { lang: 'TypeScript', adapter: new TypeScriptAdapter(), symbolKind: SymbolKind.CLASS },
    { lang: 'JavaScript', adapter: new JavaScriptAdapter(), symbolKind: SymbolKind.CLASS },
    { lang: 'Python', adapter: new PythonAdapter(), symbolKind: SymbolKind.CLASS },
    { lang: 'Go', adapter: new GoAdapter(), symbolKind: SymbolKind.STRUCT },
    { lang: 'Java', adapter: new JavaAdapter(), symbolKind: SymbolKind.CLASS },
    { lang: 'Rust', adapter: new RustAdapter(), symbolKind: SymbolKind.STRUCT },
    { lang: 'PHP', adapter: new PhpAdapter(), symbolKind: SymbolKind.CLASS },
    { lang: 'C#', adapter: new CSharpAdapter(), symbolKind: SymbolKind.CLASS },
  ];

  describe.each(adapters)('$lang', ({ lang, adapter, symbolKind }) => {
    it('extracts a class/struct', () => {
      const source = getFixtureSource(adapter.language);
      const result = adapter.parse(makeContext(getFixtureForLanguage(adapter.language), source));
      const classSymbols = result.symbols.filter((s) => s.kind === symbolKind);
      expect(classSymbols.length).toBeGreaterThan(0);
      expect(classSymbols[0].name).toBeTruthy();
    });

    it('extracts functions', () => {
      const source = getFixtureSource(adapter.language);
      const result = adapter.parse(makeContext(getFixtureForLanguage(adapter.language), source));
      const fnSymbols = result.symbols.filter(
        (s) => s.kind === SymbolKind.FUNCTION || s.kind === SymbolKind.METHOD,
      );
      expect(fnSymbols.length).toBeGreaterThan(0);
    });

    it('extracts imports', () => {
      const source = getFixtureSource(adapter.language);
      const result = adapter.parse(makeContext(getFixtureForLanguage(adapter.language), source));
      expect(result.imports.length).toBeGreaterThan(0);
    });

    it('all symbols have source locations', () => {
      const source = getFixtureSource(adapter.language);
      const result = adapter.parse(makeContext(getFixtureForLanguage(adapter.language), source));
      for (const symbol of result.symbols) {
        expect(symbol.sourceLocation.lineStart).toBeGreaterThan(0);
        expect(symbol.sourceLocation.lineEnd).toBeGreaterThan(0);
        expect(symbol.filePath).toBeTruthy();
      }
    });
  });
});

// ── Parser Registry Tests ────────────────────────────────────────────────

describe('ParserRegistry', () => {
  it('initializes without throwing', async () => {
    const registry = new ParserRegistry();
    await registry.initialize();
    expect(registry.getSupportedLanguages().length).toBeGreaterThan(0);
  });

  it('returns capability matrix', async () => {
    const registry = new ParserRegistry();
    await registry.initialize();
    const matrix = registry.getCapabilityMatrix();
    expect(matrix.length).toBe(8);
    expect(matrix.map((c) => c.language)).toContain(ProgrammingLanguage.TYPESCRIPT);
    expect(matrix.map((c) => c.language)).toContain(ProgrammingLanguage.PYTHON);
    expect(matrix.map((c) => c.language)).toContain(ProgrammingLanguage.GO);
    expect(matrix.map((c) => c.language)).toContain(ProgrammingLanguage.RUST);
  });

  it('resolves adapters by file extension', async () => {
    const registry = new ParserRegistry();
    await registry.initialize();
    expect(registry.getAdapterForFile('app.ts')?.language).toBe(ProgrammingLanguage.TYPESCRIPT);
    expect(registry.getAdapterForFile('app.py')?.language).toBe(ProgrammingLanguage.PYTHON);
    expect(registry.getAdapterForFile('main.go')?.language).toBe(ProgrammingLanguage.GO);
    expect(registry.getAdapterForFile('lib.rs')?.language).toBe(ProgrammingLanguage.RUST);
    expect(registry.getAdapterForFile('App.java')?.language).toBe(ProgrammingLanguage.JAVA);
    expect(registry.getAdapterForFile('index.php')?.language).toBe(ProgrammingLanguage.PHP);
    expect(registry.getAdapterForFile('Program.cs')?.language).toBe(ProgrammingLanguage.CSHARP);
    expect(registry.getAdapterForFile('README.md')).toBeNull();
  });
});

// ── TypeScript Specific Tests ────────────────────────────────────────────

describe('TypeScript Adapter — Symbol Extraction', () => {
  const adapter = new TypeScriptAdapter();

  it('extracts classes with methods', () => {
    const source = `
class UserService {
  getUser(id: string): User {
    return this.findUser(id);
  }
  private validateUser(user: User): boolean {
    return true;
  }
}
`;
    const result = adapter.parse(makeContext('test.ts', source));
    const classes = result.symbols.filter((s) => s.kind === SymbolKind.CLASS);
    expect(classes).toHaveLength(1);
    expect(classes[0].name).toBe('UserService');

    const methods = result.symbols.filter((s) => s.kind === SymbolKind.METHOD);
    expect(methods.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts arrow function expressions', () => {
    const source = `export const processOrder = (order: Order) => {
  return order.items.reduce((sum, item) => sum + item.price, 0);
};`;
    const result = adapter.parse(makeContext('utils.ts', source));
    const fns = result.symbols.filter((s) => s.kind === SymbolKind.FUNCTION);
    expect(fns.some((f) => f.name === 'processOrder')).toBe(true);
  });

  it('extracts call relationships', () => {
    const source = `
function helper() { return 42; }
function main() { return helper(); }
`;
    const result = adapter.parse(makeContext('app.ts', source));
    const calls = result.relationships.filter((r) => r.kind === RelationshipKind.CALLS);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ── Python Specific Tests ────────────────────────────────────────────────

describe('Python Adapter — Symbol Extraction', () => {
  const adapter = new PythonAdapter();

  it('extracts classes with inheritance', () => {
    const source = `
class BaseService:
    def process(self):
        pass

class PaymentService(BaseService):
    def charge(self, amount):
        return True
`;
    const result = adapter.parse(makeContext('payment.py', source));
    const classes = result.symbols.filter((s) => s.kind === SymbolKind.CLASS);
    expect(classes.length).toBeGreaterThanOrEqual(2);

    const extendsRels = result.relationships.filter((r) => r.kind === RelationshipKind.EXTENDS);
    expect(extendsRels.length).toBeGreaterThan(0);
  });

  it('extracts imports from statements', () => {
    const source = `
from typing import List, Dict
import os
from .utils import helper
`;
    const result = adapter.parse(makeContext('app.py', source));
    expect(result.imports.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Helper Functions ─────────────────────────────────────────────────────

function makeContext(filePath: string, source: string): ParseContext {
  return {
    filePath,
    source,
    allFilePaths: [filePath],
    fileIds: new Map([[filePath, `file:${filePath}`]]),
  };
}

function getFixtureForLanguage(lang: ProgrammingLanguage): string {
  const map: Record<string, string> = {
    TypeScript: 'payment.ts',
    JavaScript: 'payment.js',
    Python: 'payment.py',
    Go: 'payment.go',
    Java: 'Payment.java',
    Rust: 'payment.rs',
    PHP: 'payment.php',
    'C#': 'Payment.cs',
  };
  return map[lang] ?? 'unknown';
}

function getFixtureSource(lang: ProgrammingLanguage): string {
  const inline: Record<string, string> = {
    [ProgrammingLanguage.TYPESCRIPT]: `
interface PaymentConfig { apiKey: string; }
class PaymentService {
  async processPayment(amount: number): Promise<boolean> { return true; }
  refund(id: string): void {}
}
function calculateTax(amount: number, rate: number): number { return amount * rate; }
import { Logger } from './utils';
`,
    [ProgrammingLanguage.JAVASCRIPT]: `
class PaymentService {
  async processPayment(amount) { return true; }
  refund(id) {}
}
function calculateTax(amount, rate) { return amount * rate; }
const processOrder = (order) => { return order.total; };
import { Logger } from './utils';
`,
    [ProgrammingLanguage.PYTHON]: `
class PaymentService:
    def process_payment(self, amount):
        return True
    def refund(self, transaction_id):
        pass
class PremiumPaymentService(PaymentService):
    def apply_discount(self, amount, discount):
        return amount * (1 - discount)
def calculate_tax(amount, rate):
    return amount * rate
from .utils import Logger
from .gateway import PaymentGateway
import os
`,
    [ProgrammingLanguage.GO]: `
package payment
type PaymentConfig struct { ApiKey string }
type PaymentService struct { config PaymentConfig }
func (s *PaymentService) ProcessPayment(amount float64) (bool, error) { return true, nil }
func (s *PaymentService) Refund(id string) error { return nil }
func CalculateTax(amount float64, rate float64) float64 { return amount * rate }
type PremiumPaymentService struct { PaymentService }
import "fmt"
`,
    [ProgrammingLanguage.JAVA]: `
package com.example;
public class PaymentService {
    public boolean processPayment(double amount) { return true; }
    public void refund(String id) {}
}
class PremiumPaymentService extends PaymentService {
    public double applyDiscount(double amount, double d) { return amount * (1-d); }
}
public interface PaymentProcessor { boolean processPayment(double amount); }
import java.util.Logger;
`,
    [ProgrammingLanguage.RUST]: `
pub struct PaymentConfig { pub api_key: String }
pub struct PaymentService { config: PaymentConfig }
impl PaymentService {
    pub fn process_payment(&self, amount: f64) -> bool { true }
    pub fn refund(&self, id: &str) {}
}
pub fn calculate_tax(amount: f64, rate: f64) -> f64 { amount * rate }
pub struct PremiumPaymentService { inner: PaymentService }
use std::fmt;
`,
    [ProgrammingLanguage.PHP]: `
<?php
namespace App;
use App\\Utils\\Logger;
class PaymentService {
    public function processPayment(float $amount): bool { return true; }
    public function refund(string $id): void {}
}
class PremiumPaymentService extends PaymentService {
    public function applyDiscount(float $amount, float $d): float { return $amount * (1-$d); }
}
interface PaymentProcessor { public function processPayment(float $amount): bool; }
function calculateTax(float $amount, float $rate): float { return $amount * $rate; }
`,
    [ProgrammingLanguage.CSHARP]: `
using System;
namespace App.Payment {
public class PaymentService {
    public virtual bool ProcessPayment(double amount) { return true; }
    public void Refund(string id) {}
}
public class PremiumPaymentService : PaymentService {
    public double ApplyDiscount(double amount, double d) { return amount * (1-d); }
}
public interface IPaymentProcessor { bool ProcessPayment(double amount); }
}
`,
  };
  return inline[lang] ?? '';
}
