# Normalized Code Intelligence Model

## Overview

The normalized IR is the contract between all language parsers and the rest of TraceGraph. Every parser (TypeScript, Python, Go, etc.) produces this exact shape. The graph layer never touches parser-specific AST nodes.

## Core Types

### `ProgrammingLanguage` (enum)
Controlled vocabulary of supported languages:
```
TYPESCRIPT | JAVASCRIPT | PYTHON | GO | JAVA | RUST | PHP | CSHARP | UNKNOWN
```

### `SourceLocation`
Every extracted entity carries precise source coordinates:
```typescript
{
  lineStart: number;   // 1-indexed
  lineEnd: number;     // 1-indexed
  columnStart: number; // 0-indexed
  columnEnd: number;   // 0-indexed
}
```

### `ParsedFileMeta`
File-level metadata:
```typescript
{
  path: string;          // repo-relative, forward slashes
  language: ProgrammingLanguage;
  extension: string;
  sizeBytes: number;
  lineCount: number;
  contentHash: string;   // SHA-256 hex (for incremental sync)
}
```

### `SymbolKind` (enum)
Normalized entity types:
```
FUNCTION | METHOD | CLASS | INTERFACE | ENUM | STRUCT | MODULE | VARIABLE |
CONSTANT | TYPE | NAMESPACE | TRAIT | IMPL | DECORATOR | PROPERTY | CONSTRUCTOR
```

### `ParsedSymbol`
Language-neutral symbol representation:
```typescript
{
  id: string;              // deterministic, unique: "fn:path:Name"
  kind: SymbolKind;
  name: string;            // full name (e.g. "PaymentService.process")
  shortName: string;       // short name (e.g. "process")
  signature?: string;      // "processPayment(amount, retries)"
  visibility: 'public' | 'private' | 'protected' | 'internal';
  sourceLocation: SourceLocation;
  parentName?: string;     // enclosing class/struct
  filePath: string;
  metadata?: Record<string, unknown>;  // language-specific extras
}
```

### `RelationshipKind` (enum)
Normalized relationship types:
```
CONTAINS | IMPORTS | CALLS | EXTENDS | IMPLEMENTS | REFERENCES |
DEFINES | OVERRIDES | TESTS
```

### `ParsedRelationship`
```typescript
{
  fromId: string;
  toId: string;
  kind: RelationshipKind;
  resolution: 'resolved' | 'partial' | 'unresolved';
  line?: number;
  reason?: string;       // human-readable evidence
}
```

## ID Strategy

IDs are **deterministic, unique, stable, and language-independent**:

| Entity | ID format | Example |
|--------|-----------|---------|
| File | `file:{path}` | `file:src/payment.py` |
| Symbol | `fn:{path}:{name}` | `fn:src/payment.py:PaymentService` |
| Method | `fn:{path}:{Class.method}` | `fn:src/payment.py:PaymentService.process` |
| Test | `test:{path}` | `test:test_payment.py` |
| Directory | `dir:{path}` | `dir:src/services` |
| Repository | `repo:{owner/name}` | `repo:acme/payment-api` |

## Content Hashing

Every `ParsedFileMeta` includes a `contentHash` (SHA-256 hex digest). This enables:
- **Incremental sync** (Phase 15): compare old vs new hash to skip reparsing
- **Cache invalidation**: detect when a file has changed
- **Audit trail**: track which version of a file was indexed

## Parser Versioning

Each adapter exposes `parserVersion: number`. This allows TraceGraph to know:
- "This repository was indexed with parser v1"
- "Parser v2 extracts more precise call edges — re-index recommended"

Current version for all adapters: `v1`.

## Diagnostics

When a file fails to parse or produces warnings:
```typescript
{
  file: string;
  language: ProgrammingLanguage;
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  parser: string;  // adapter class name
}
```

One malformed file never crashes the entire repository parse.
