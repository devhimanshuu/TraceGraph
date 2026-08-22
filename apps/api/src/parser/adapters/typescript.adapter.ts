/**
 * TypeScript adapter — extracts symbols and relationships from .ts/.tsx files
 * using Tree-sitter with the TypeScript grammar.
 */
import type { ParseContext } from '../parser.interface';
import {
  ProgrammingLanguage,
  SymbolKind,
  RelationshipKind,
  DiagnosticSeverity,
  type ParseResult,
  type ParsedSymbol,
  type ParsedRelationship,
  type ParsedImport,
  type ParserDiagnostic,
  type LanguageCapabilities,
} from '../types';
import { BaseAdapter } from './base.adapter';
import { parseSourceSync, loadGrammar, isTreeSitterAvailable } from '../tree-sitter-engine';

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];

export class TypeScriptAdapter extends BaseAdapter {
  readonly language = ProgrammingLanguage.TYPESCRIPT;
  readonly parserVersion = 1;
  readonly treeSitterGrammar = 'typescript';

  canParse(filePath: string): boolean {
    return /\.(ts|tsx|mts|cts)$/.test(filePath) && !filePath.endsWith('.d.ts');
  }

  getCapabilities(): LanguageCapabilities {
    return {
      language: this.language,
      parsing: 'full',
      symbols: 'full',
      imports: 'full',
      calls: isTreeSitterAvailable() ? 'full' : 'partial',
      inheritance: 'full',
      parserVersion: this.parserVersion,
    };
  }

  parse(context: ParseContext): ParseResult {
    const file = this.makeFileMeta(context.filePath, context.source);
    const symbols: ParsedSymbol[] = [];
    const relationships: ParsedRelationship[] = [];
    const imports: ParsedImport[] = [];
    const diagnostics: ParserDiagnostic[] = [];

    if (!isTreeSitterAvailable()) {
      diagnostics.push(this.diagnostic(context.filePath, 'Tree-sitter not available — using regex fallback'));
      return this.regexFallback(context, file, symbols, relationships, imports);
    }

    // Ensure grammar is loaded (will be cached after first call)
    loadGrammar('typescript').catch(() => {});

    try {
      const tree = parseSourceSync('typescript', context.source);
      if (!tree) {
        diagnostics.push(this.diagnostic(context.filePath, 'Tree-sitter parse returned null — using regex fallback'));
        return this.regexFallback(context, file, symbols, relationships, imports);
      }

      this.extractFromTree(tree, context, symbols, relationships, imports);
      return { file, symbols, relationships, imports, diagnostics };
    } catch (err) {
      diagnostics.push(this.diagnostic(context.filePath, `Parse error: ${(err as Error).message}`));
      return this.regexFallback(context, file, symbols, relationships, imports);
    }
  }

  resolveImport(specifier: string, fromDir: string, allFilePaths: string[]): string | null {
    if (!specifier.startsWith('.')) return null;
    const base = fromDir ? `${fromDir}/${specifier}` : specifier;
    const normalized = base.replace(/\/index$/, '').replace(/\/$/, '');

    // Try exact match and common extensions
    for (const ext of ['', ...SOURCE_EXTS]) {
      const candidate = normalized + ext;
      if (allFilePaths.includes(candidate)) return candidate;
    }
    // Try as directory with index
    for (const ext of SOURCE_EXTS) {
      const candidate = `${normalized}/index${ext}`;
      if (allFilePaths.includes(candidate)) return candidate;
    }
    return null;
  }

  // ── Tree-sitter extraction ──────────────────────────────────────────────

  private extractFromTree(
    tree: any,
    context: ParseContext,
    symbols: ParsedSymbol[],
    relationships: ParsedRelationship[],
    imports: ParsedImport[],
  ): void {
    const source = context.source;
    const root = tree.rootNode;
    const filePath = context.filePath;
    const fileId = this.makeFileId(filePath);

    // Class stack for method resolution
    const classStack: string[] = [];
    const processNode = (node: any, depth = 0) => {
      if (depth > 50) return; // Safety limit

      switch (node.type) {
        case 'class_declaration':
        case 'abstract_class_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            const loc = this.nodeLocation(node);
            const symId = this.makeSymbolId(filePath, name);
            symbols.push({
              id: symId, kind: SymbolKind.CLASS, name, shortName: name,
              visibility: this.extractVisibility(node, source),
              sourceLocation: loc, filePath,
            });
            classStack.push(name);
            // Extract extends
            this.extractHeritage(node, source, filePath, symId, relationships);
            // Extract class body
            const body = this.fieldChild(node, 'body');
            if (body) this.processClassBody(body, name, filePath, symbols, relationships, source);
            classStack.pop();
          }
          break;
        }
        case 'function_declaration':
        case 'generator_function_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            const loc = this.nodeLocation(node);
            const sig = this.extractSignature(node, name, source);
            const symId = this.makeSymbolId(filePath, name);
            symbols.push({
              id: symId, kind: SymbolKind.FUNCTION, name, shortName: name,
              signature: sig, visibility: this.extractVisibility(node, source),
              sourceLocation: loc, filePath,
            });
            // Extract calls from body
            this.extractCalls(node, symId, filePath, source, relationships);
          }
          break;
        }
        case 'export_statement': {
          // Handle: export const fn = () => {}
          const decl = node.namedChildren?.[0];
          if (decl?.type === 'lexical_declaration' || decl?.type === 'variable_declaration') {
            this.processVariableDeclaration(decl, filePath, symbols, relationships, source);
          }
          break;
        }
        case 'lexical_declaration':
        case 'variable_declaration': {
          this.processVariableDeclaration(node, filePath, symbols, relationships, source);
          break;
        }
        case 'import_statement': {
          this.extractImport(node, filePath, imports, relationships, source, context);
          break;
        }
        case 'interface_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.INTERFACE,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
          }
          break;
        }
        case 'enum_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.ENUM,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
          }
          break;
        }
        case 'type_alias_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.TYPE,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
          }
          break;
        }
      }

      // Recurse
      for (let i = 0; i < node.childCount; i++) {
        processNode(node.child(i), depth + 1);
      }
    };

    processNode(root);
  }

  private processClassBody(
    body: any, className: string, filePath: string,
    symbols: ParsedSymbol[], relationships: ParsedRelationship[], source: string,
  ): void {
    for (let i = 0; i < body.childCount; i++) {
      const member = body.child(i);
      switch (member.type) {
        case 'method_definition':
        case 'public_field_definition': {
          const nameNode = this.fieldChild(member, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            const fullName = `${className}.${name}`;
            const kind = member.type === 'method_definition' ? SymbolKind.METHOD : SymbolKind.PROPERTY;
            const sig = kind === SymbolKind.METHOD ? this.extractSignature(member, name, source) : undefined;
            symbols.push({
              id: this.makeSymbolId(filePath, fullName), kind,
              name: fullName, shortName: name, signature: sig,
              visibility: this.extractVisibility(member, source),
              sourceLocation: this.nodeLocation(member), filePath,
              parentName: className,
            });
            if (kind === SymbolKind.METHOD) {
              this.extractCalls(member, this.makeSymbolId(filePath, fullName), filePath, source, relationships);
            }
          }
          break;
        }
        case 'method_definition': {
          const nameNode = this.fieldChild(member, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            const fullName = `${className}.${name}`;
            symbols.push({
              id: this.makeSymbolId(filePath, fullName), kind: SymbolKind.METHOD,
              name: fullName, shortName: name,
              signature: this.extractSignature(member, name, source),
              visibility: this.extractVisibility(member, source),
              sourceLocation: this.nodeLocation(member), filePath,
              parentName: className,
            });
            this.extractCalls(member, this.makeSymbolId(filePath, fullName), filePath, source, relationships);
          }
          break;
        }
      }
    }
  }

  private processVariableDeclaration(
    node: any, filePath: string,
    symbols: ParsedSymbol[], relationships: ParsedRelationship[], source: string,
  ): void {
    for (let i = 0; i < node.namedChildCount; i++) {
      const decl = node.namedChild(i);
      if (decl?.type !== 'variable_declarator') continue;
      const nameNode = this.fieldChild(decl, 'name');
      const valueNode = this.fieldChild(decl, 'value');
      if (!nameNode) continue;
      const name = this.identifierText(nameNode, source);
      // Check if value is a function
      if (valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function')) {
        const symId = this.makeSymbolId(filePath, name);
        symbols.push({
          id: symId, kind: SymbolKind.FUNCTION, name, shortName: name,
          signature: this.extractSignature(valueNode, name, source),
          visibility: 'public', sourceLocation: this.nodeLocation(node), filePath,
        });
        this.extractCalls(valueNode, symId, filePath, source, relationships);
      }
    }
  }

  private extractImport(
    node: any, filePath: string,
    imports: ParsedImport[], relationships: ParsedRelationship[],
    source: string, context: ParseContext,
  ): void {
    const moduleNode = this.fieldChild(node, 'source');
    if (!moduleNode) return;
    const specifier = this.identifierText(moduleNode, source).replace(/^['"]|['"]$/g, '');
    const localNames: string[] = [];
    let isNamespace = false;

    const clause = this.findChild(node, 'import_clause');
    if (clause) {
      // Default import
      const defId = this.fieldChild(clause, 'name');
      if (defId) localNames.push(this.identifierText(defId, source));
      // Named imports
      const named = this.fieldChild(clause, 'named_imports');
      if (named) {
        for (let i = 0; i < named.childCount; i++) {
          const spec = named.child(i);
          if (spec.type === 'import_specifier') {
            const name = this.fieldChild(spec, 'name');
            if (name) localNames.push(this.identifierText(name, source));
          }
        }
      }
      // Namespace import
      const ns = this.fieldChild(clause, 'namespace_import');
      if (ns) {
        isNamespace = true;
        const nsId = this.findChild(ns, 'identifier') ?? this.findChild(ns, 'namespace_identifier');
        if (nsId) localNames.push(this.identifierText(nsId, source));
      }
    }

    imports.push({ specifier, localNames, isNamespace });

    // Resolve file-to-file import relationship
    const fromDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
    const resolved = this.resolveImport(specifier, fromDir, context.allFilePaths);
    if (resolved) {
      relationships.push({
        fromId: this.makeFileId(filePath),
        toId: this.makeFileId(resolved),
        kind: RelationshipKind.IMPORTS,
        resolution: 'resolved',
        line: node.startPosition.row + 1,
        reason: `import from '${specifier}'`,
      });
    }
  }

  private extractHeritage(
    node: any, source: string, filePath: string, symId: string,
    relationships: ParsedRelationship[],
  ): void {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'class_heritage' || child.type === 'extends_clause') {
        const superClass = child.namedChildren?.[0];
        if (superClass) {
          const parentName = this.identifierText(superClass, source);
          relationships.push({
            fromId: symId,
            toId: this.makeSymbolId(filePath, parentName),
            kind: RelationshipKind.EXTENDS,
            resolution: 'partial',
            line: child.startPosition.row + 1,
            reason: `extends ${parentName}`,
          });
        }
      }
    }
  }

  private extractCalls(
    node: any, callerId: string, filePath: string, source: string,
    relationships: ParsedRelationship[],
  ): void {
    this.findDescendants(node, 'call_expression').forEach((call) => {
      const fn = this.fieldChild(call, 'function');
      if (!fn) return;
      let calleeName = '';
      if (fn.type === 'identifier') {
        calleeName = this.identifierText(fn, source);
      } else if (fn.type === 'member_expression') {
        const obj = this.fieldChild(fn, 'object');
        const prop = this.fieldChild(fn, 'property');
        if (obj && prop) {
          calleeName = `${this.identifierText(obj, source)}.${this.identifierText(prop, source)}`;
        }
      }
      if (calleeName) {
        relationships.push({
          fromId: callerId,
          toId: `fn:${filePath}:${calleeName}`,
          kind: RelationshipKind.CALLS,
          resolution: 'partial',
          line: call.startPosition.row + 1,
          reason: `calls ${calleeName}()`,
        });
      }
    });
  }

  private extractVisibility(node: any, source: string): 'public' | 'private' | 'protected' {
    const text = this.nodeText(node, source);
    if (/\bprivate\b/.test(text)) return 'private';
    if (/\bprotected\b/.test(text)) return 'protected';
    if (/\bpublic\b/.test(text)) return 'public';
    // By convention, # prefix means private
    for (let i = 0; i < node.childCount; i++) {
      if (node.child(i).type === 'private_property_identifier') return 'private';
    }
    return 'public';
  }

  private extractSignature(node: any, name: string, source: string): string {
    const params = this.fieldChild(node, 'parameters');
    if (!params) return `${name}()`;
    const paramTexts: string[] = [];
    for (let i = 0; i < params.childCount; i++) {
      const param = params.child(i);
      if (param.type === 'required_parameter' || param.type === 'optional_parameter') {
        const pName = this.fieldChild(param, 'pattern') ?? this.fieldChild(param, 'name');
        if (pName) paramTexts.push(this.identifierText(pName, source));
      }
    }
    return `${name}(${paramTexts.join(', ')})`;
  }

  // ── Regex fallback when Tree-sitter is unavailable ──────────────────────

  private regexFallback(
    context: ParseContext,
    file: any,
    symbols: ParsedSymbol[],
    relationships: ParsedRelationship[],
    imports: ParsedImport[],
  ): ParseResult {
    const { source, filePath } = context;
    const fileId = this.makeFileId(filePath);
    const lines = source.split('\n');

    // Extract classes + methods
    const classRe = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = classRe.exec(source)) !== null) {
      const name = m[1];
      symbols.push({
        id: this.makeSymbolId(filePath, name), kind: SymbolKind.CLASS,
        name, shortName: name, visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0),
        filePath,
      });
      // Extract methods in this class (scan forward to closing brace)
      const methodRe = /(?:public|private|protected|static|async)?\s*(\w+)\s*\([^)]*\)/g;
      const remaining = source.slice(m.index);
      let mm: RegExpExecArray | null;
      while ((mm = methodRe.exec(remaining)) !== null) {
        const methodName = mm[1];
        if (['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'class'].includes(methodName)) continue;
        symbols.push({
          id: this.makeSymbolId(filePath, `${name}.${methodName}`), kind: SymbolKind.METHOD,
          name: `${name}.${methodName}`, shortName: methodName, visibility: 'public',
          sourceLocation: this.makeSourceLocation(m.index + mm.index, m.index + mm.index, 0, 0),
          filePath, parentName: name,
        });
      }
    }

    // Extract functions
    const fnRe = /(?:export\s+)?(?:(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function))/g;
    while ((m = fnRe.exec(source)) !== null) {
      const name = m[1] || m[2];
      if (!name) continue;
      symbols.push({
        id: this.makeSymbolId(filePath, name), kind: SymbolKind.FUNCTION,
        name, shortName: name, visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0),
        filePath,
      });
    }
    // Extract calls
    const callRe = /(\w+)\s*\(/g;
    while ((m = callRe.exec(source)) !== null) {
      const callee = m[1];
      if (['function', 'class', 'if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'import', 'export'].includes(callee)) continue;
      const callerSymbols = symbols.filter((s) => s.kind === SymbolKind.FUNCTION || s.kind === SymbolKind.METHOD);
      const caller = callerSymbols.find((s) => m!.index > source.indexOf(s.name));
      if (caller && callee !== caller.shortName) {
        relationships.push({
          fromId: caller.id,
          toId: `fn:${filePath}:${callee}`,
          kind: RelationshipKind.CALLS, resolution: 'partial',
          line: source.slice(0, m.index).split('\n').length,
          reason: `calls ${callee}()`,
        });
      }
    }

    // Extract imports
    const importRe = /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}\s*)?(?:,\s*(\w+))?\s+from\s+['"]([^'"]+)['"]/g;
    while ((m = importRe.exec(source)) !== null) {
      const specifier = m[4];
      const localNames: string[] = [];
      if (m[1]) localNames.push(m[1]);
      if (m[2]) m[2].split(',').forEach((n) => localNames.push(n.trim().split(/\s+as\s+/)[0]));
      if (m[3]) localNames.push(m[3]);
      imports.push({ specifier, localNames, isNamespace: false });

      const fromDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
      const resolved = this.resolveImport(specifier, fromDir, context.allFilePaths);
      if (resolved) {
        relationships.push({
          fromId: fileId, toId: this.makeFileId(resolved),
          kind: RelationshipKind.IMPORTS, resolution: 'resolved',
          line: m.index, reason: `import from '${specifier}'`,
        });
      }
    }

    return { file, symbols, relationships, imports, diagnostics: [] };
  }
}
