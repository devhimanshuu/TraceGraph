# Parser Architecture

## Overview

TraceGraph's parser platform converts source code from any supported language into a **normalized code intelligence intermediate representation (IR)** before persisting it to CognoDB. The graph layer never touches parser-specific AST nodes.

```
Repository
     ↓
File Discovery (ignore rules, size caps)
     ↓
Language Detection (extension-based, deterministic)
     ↓
Parser Registry (language → adapter lookup)
     ↓
┌──────────────────────────────────────────┐
│ Tree-sitter WASM Engine                   │
│  ┌─────────┬──────────┬─────────┐        │
│  │ TS/JS   │ Python   │ Go      │ ...    │
│  │ Adapter │ Adapter  │ Adapter │        │
│  └────┬────┴────┬─────┴────┬────┘        │
│       ↓         ↓          ↓              │
│  Normalized IR (symbols + relationships)  │
└──────────────────────────────────────────┘
     ↓
Relationship Resolution (cross-file imports, calls)
     ↓
Graph Writer (normalized IR → CognoDB)
```

## Key Principles

1. **Parser independence** — Parsers never see CognoDB. The Graph Writer is the only persistence boundary.
2. **Deterministic output** — Given the same source code, a parser always produces the same IR.
3. **Graceful degradation** — If Tree-sitter fails for a file, regex fallbacks handle it. If a file is malformed, parsing continues for the rest.
4. **Language-agnostic graph** — The graph contains `Function`, `Class`, `File` nodes — not `TypeScriptFunction`, `PythonClass`.

## Components

### Tree-sitter WASM Engine (`tree-sitter-engine.ts`)
- Initializes the `web-tree-sitter` WASM runtime
- Loads per-language grammar WASM files from `src/parser/grammars/`
- Provides sync parsing after async grammar loading
- Language objects are cached after first load

### Parser Registry (`parser-registry.ts`)
- Maps `ProgrammingLanguage` enum → `LanguageParser` adapter
- Queries the registry by file extension or language
- Exposes capability matrix for UI/debugging

### Parser Interface (`parser.interface.ts`)
Every adapter implements:
- `canParse(filePath)` — fast file-type check
- `parse(context)` — full extraction of symbols + relationships
- `resolveImport(specifier, fromDir, allFilePaths)` — cross-file import resolution
- `getCapabilities()` — honest capability report

### Graph Writer (`graph-writer.ts`)
- Converts normalized IR to CognoDB Cypher
- Creates file, directory, symbol, test nodes
- Creates IMPORTS, CALLS, EXTENDS, IMPLEMENTS, CONTAINS edges
- Handles batching (500 operations per transaction)

### Parsing Pipeline (`parsing-pipeline.ts`)
- Orchestrates: extract tarball → discover files → parse → persist
- Provides progress callbacks for UI
- Error-isolating: one bad file doesn't crash the pipeline

## Files Created

```
apps/api/src/parser/
├── types.ts                    # Normalized IR types
├── language.ts                 # Language detection + extension mapping
├── parser.interface.ts         # Parser contract
├── parser-registry.ts          # Language → adapter registry
├── tree-sitter-engine.ts       # WASM engine singleton
├── graph-writer.ts             # IR → CognoDB persistence
├── parsing-pipeline.ts         # Full pipeline orchestrator
├── parser.module.ts            # NestJS module
├── parser.controller.ts        # API endpoints
├── parser.platform.spec.ts     # 115 tests
├── grammars/                   # Pre-compiled WASM grammars
│   ├── tree-sitter-javascript.wasm
│   ├── tree-sitter-typescript.wasm
│   ├── tree-sitter-tsx.wasm
│   ├── tree-sitter-python.wasm
│   ├── tree-sitter-go.wasm
│   ├── tree-sitter-java.wasm
│   ├── tree-sitter-rust.wasm
│   ├── tree-sitter-c_sharp.wasm
│   └── tree-sitter-php.wasm
└── adapters/
    ├── base.adapter.ts         # Shared tree-sitter utilities
    ├── typescript.adapter.ts
    ├── javascript.adapter.ts
    ├── python.adapter.ts
    ├── go.adapter.ts
    ├── java.adapter.ts
    ├── rust.adapter.ts
    ├── php.adapter.ts
    └── csharp.adapter.ts
```
