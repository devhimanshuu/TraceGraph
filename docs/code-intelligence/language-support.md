# Language Support Matrix

## Capability Matrix

| Language   | Parsing | Symbols | Imports | Calls    | Inheritance | Status      |
|------------|---------|---------|---------|----------|-------------|-------------|
| TypeScript | ✅       | ✅       | ✅       | ✅       | ✅           | Full        |
| JavaScript | ✅       | ✅       | ✅       | ✅       | ⚠️          | Full        |
| Python     | ✅       | ✅       | ✅       | ⚠️       | ✅           | Strong      |
| Go         | ✅       | ✅       | ✅       | ✅       | ✅           | Strong      |
| Java       | ✅       | ✅       | ✅       | ⚠️       | ✅           | Core        |
| Rust       | ✅       | ✅       | ✅       | ⚠️       | ⚠️          | Core        |
| PHP        | ✅       | ✅       | ✅       | ⚠️       | ✅           | Core        |
| C#         | ✅       | ✅       | ✅       | ⚠️       | ✅           | Core        |

**Legend:**
- ✅ = Full support
- ⚠️ = Partial (static resolution limitations)

## Per-Language Details

### TypeScript / JavaScript
- **Parsing**: Tree-sitter TypeScript/JavaScript WASM grammars
- **Symbols**: classes, functions, methods, interfaces, enums, types, arrow functions, const expressions
- **Imports**: ESM `import` statements, resolved to repo-relative file paths
- **Calls**: Function/method call expressions with callee tracking
- **Inheritance**: `extends` clauses, `implements` interfaces
- **Regex fallback**: Class/function/import extraction via patterns

### Python
- **Parsing**: Tree-sitter Python WASM grammar
- **Symbols**: classes, functions, methods, decorators (`@property`, `@staticmethod`, `@classmethod`)
- **Imports**: `import`, `from X import Y`, relative imports (`from .utils import helper`)
- **Calls**: Method calls with `self.method()` resolution
- **Inheritance**: Class inheritance via `class Child(Parent):`
- **Known limitations**: Dynamic dispatch (`getattr`, `*args/**kwargs`) not resolved

### Go
- **Parsing**: Tree-sitter Go WASM grammar
- **Symbols**: functions, methods (with receiver), structs, interfaces, modules
- **Imports**: Package imports (`"fmt"`, `"github.com/..."`) — only relative imports resolved
- **Calls**: Method calls via selector expressions (`s.Method()`)
- **Inheritance**: Struct embedding (composition)
- **Known limitations**: Package-level imports not resolved to files

### Java
- **Parsing**: Tree-sitter Java WASM grammar
- **Symbols**: classes, interfaces, methods, constructors, fields, enums
- **Imports**: `import` and `import static` declarations
- **Calls**: Method invocations (`obj.method()`)
- **Inheritance**: `extends`, `implements` clauses
- **Known limitations**: Method overloading makes exact call resolution hard

### Rust
- **Parsing**: Tree-sitter Rust WASM grammar
- **Symbols**: structs, enums, traits, impl blocks, functions, methods, modules
- **Imports**: `use` declarations, crate/super/self paths
- **Calls**: Function calls, method calls via `.method()` syntax
- **Inheritance**: Trait implementations (`impl Trait for Type`)
- **Known limitations**: Trait bounds + generics make call resolution hard

### PHP
- **Parsing**: Tree-sitter PHP WASM grammar
- **Symbols**: classes, interfaces, methods, functions, namespaces
- **Imports**: `use` namespace declarations
- **Calls**: Function calls, method calls (`$obj->method()`)
- **Inheritance**: `extends`, `implements` clauses, traits
- **Known limitations**: Dynamic method dispatch not resolved

### C#
- **Parsing**: Tree-sitter C# WASM grammar
- **Symbols**: classes, interfaces, structs, enums, methods, constructors, properties, namespaces
- **Imports**: `using` directives
- **Calls**: Method invocations, constructor calls
- **Inheritance**: `: BaseClass`, `: IInterface`
- **Known limitations**: Generic type parameters, async/await patterns

## Symbol Kind Mapping

Each language maps its constructs to normalized `SymbolKind` values:

| Language | Language-specific | Normalized |
|----------|------------------|------------|
| TypeScript | `class_declaration` | `CLASS` |
| TypeScript | `function_declaration` | `FUNCTION` |
| TypeScript | `method_definition` | `METHOD` |
| TypeScript | `interface_declaration` | `INTERFACE` |
| TypeScript | `enum_declaration` | `ENUM` |
| Python | `class_definition` | `CLASS` |
| Python | `function_definition` | `FUNCTION` |
| Go | `type_declaration` (struct) | `STRUCT` |
| Go | `type_declaration` (interface) | `INTERFACE` |
| Go | `function_declaration` | `FUNCTION` |
| Rust | `struct_item` | `STRUCT` |
| Rust | `trait_item` | `TRAIT` |
| Rust | `impl_item` | methods |
| Java | `class_declaration` | `CLASS` |
| Java | `interface_declaration` | `INTERFACE` |
| PHP | `class_declaration` | `CLASS` |
| C# | `class_declaration` | `CLASS` |
| C# | `interface_declaration` | `INTERFACE` |

## Relationship Mapping

| Language | Relationship | Normalized |
|----------|-------------|------------|
| All | file contains symbol | `CONTAINS` |
| All | file imports file | `IMPORTS` |
| All | function calls function | `CALLS` |
| All | class extends class | `EXTENDS` |
| Java, C#, PHP | class implements interface | `IMPLEMENTS` |
| Rust | impl trait for type | `IMPLEMENTS` |
| All | test file covers function | `TESTS` |
