/**
 * JavaScript adapter — reuses most of the TypeScript adapter logic
 * with JS-specific Tree-sitter grammar and node types.
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

const SOURCE_EXTS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'];

export class JavaScriptAdapter extends BaseAdapter {
  readonly language = ProgrammingLanguage.JAVASCRIPT;
  readonly parserVersion = 1;
  readonly treeSitterGrammar = 'javascript';

  canParse(filePath: string): boolean {
    return /\.(js|jsx|mjs|cjs)$/.test(filePath);
  }

  getCapabilities(): LanguageCapabilities {
    return {
      language: this.language,
      parsing: 'full',
      symbols: 'full',
      imports: 'full',
      calls: isTreeSitterAvailable() ? 'full' : 'partial',
      inheritance: 'partial', // JS has prototype-based inheritance
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
      return this.regexFallback(context, file, symbols, relationships, imports);
    }

    loadGrammar('javascript').catch(() => {});

    try {
      const tree = parseSourceSync('javascript', context.source);
      if (!tree) {
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
    for (const ext of ['', ...SOURCE_EXTS]) {
      if (allFilePaths.includes(normalized + ext)) return normalized + ext;
    }
    for (const ext of SOURCE_EXTS) {
      const candidate = `${normalized}/index${ext}`;
      if (allFilePaths.includes(candidate)) return candidate;
    }
    return null;
  }

  private extractFromTree(
    tree: any, context: ParseContext,
    symbols: ParsedSymbol[], relationships: ParsedRelationship[], imports: ParsedImport[],
  ): void {
    const source = context.source;
    const root = tree.rootNode;
    const filePath = context.filePath;
    const fileId = this.makeFileId(filePath);
    const classStack: string[] = [];

    const processNode = (node: any, depth = 0) => {
      if (depth > 50) return;
      switch (node.type) {
        case 'class_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            classStack.push(name);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.CLASS,
              name, shortName: name, visibility: 'public',
              sourceLocation: this.nodeLocation(node), filePath,
            });
            // Heritage
            const heritage = this.findChild(node, 'class_heritage');
            if (heritage) {
              const superNode = heritage.namedChildren?.[0];
              if (superNode) {
                relationships.push({
                  fromId: this.makeSymbolId(filePath, name),
                  toId: this.makeSymbolId(filePath, this.identifierText(superNode, source)),
                  kind: RelationshipKind.EXTENDS, resolution: 'partial',
                  line: heritage.startPosition.row + 1,
                  reason: `extends ${this.identifierText(superNode, source)}`,
                });
              }
            }
            // Class body
            const body = this.fieldChild(node, 'body');
            if (body) {
              for (let i = 0; i < body.childCount; i++) {
                const member = body.child(i);
                if (member.type === 'method_definition') {
                  const mName = this.fieldChild(member, 'name');
                  if (mName) {
                    const methodName = this.identifierText(mName, source);
                    const fullName = `${name}.${methodName}`;
                    symbols.push({
                      id: this.makeSymbolId(filePath, fullName), kind: SymbolKind.METHOD,
                      name: fullName, shortName: methodName, visibility: 'public',
                      sourceLocation: this.nodeLocation(member), filePath,
                      parentName: name,
                    });
                    this.extractCalls(member, this.makeSymbolId(filePath, fullName), filePath, source, relationships);
                  }
                }
              }
            }
            classStack.pop();
          }
          break;
        }
        case 'function_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.FUNCTION,
              name, shortName: name, visibility: 'public',
              sourceLocation: this.nodeLocation(node), filePath,
            });
            this.extractCalls(node, this.makeSymbolId(filePath, name), filePath, source, relationships);
          }
          break;
        }
        case 'lexical_declaration':
        case 'variable_declaration': {
          for (let i = 0; i < node.namedChildCount; i++) {
            const decl = node.namedChild(i);
            if (decl?.type !== 'variable_declarator') continue;
            const nameNode = this.fieldChild(decl, 'name');
            const valueNode = this.fieldChild(decl, 'value');
            if (!nameNode) continue;
            const name = this.identifierText(nameNode, source);
            if (valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function')) {
              const symId = this.makeSymbolId(filePath, name);
              symbols.push({
                id: symId, kind: SymbolKind.FUNCTION, name, shortName: name,
                visibility: 'public', sourceLocation: this.nodeLocation(node), filePath,
              });
              this.extractCalls(valueNode, symId, filePath, source, relationships);
            }
          }
          break;
        }
        case 'import_statement': {
          this.extractImport(node, filePath, imports, relationships, source, context);
          break;
        }
      }
      for (let i = 0; i < node.childCount; i++) processNode(node.child(i), depth + 1);
    };

    processNode(root);
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
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier') localNames.push(this.identifierText(child, source));
    }
    imports.push({ specifier, localNames, isNamespace: false });
    const fromDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
    const resolved = this.resolveImport(specifier, fromDir, context.allFilePaths);
    if (resolved) {
      relationships.push({
        fromId: this.makeFileId(filePath), toId: this.makeFileId(resolved),
        kind: RelationshipKind.IMPORTS, resolution: 'resolved',
        line: node.startPosition.row + 1, reason: `import '${specifier}'`,
      });
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
      if (fn.type === 'identifier') calleeName = this.identifierText(fn, source);
      else if (fn.type === 'member_expression') {
        const obj = this.fieldChild(fn, 'object');
        const prop = this.fieldChild(fn, 'property');
        if (obj && prop) calleeName = `${this.identifierText(obj, source)}.${this.identifierText(prop, source)}`;
      }
      if (calleeName) {
        relationships.push({
          fromId: callerId, toId: `fn:${filePath}:${calleeName}`,
          kind: RelationshipKind.CALLS, resolution: 'partial',
          line: call.startPosition.row + 1, reason: `calls ${calleeName}()`,
        });
      }
    });
  }

  private regexFallback(
    context: ParseContext, file: any,
    symbols: ParsedSymbol[], relationships: ParsedRelationship[], imports: ParsedImport[],
  ): ParseResult {
    const { source, filePath } = context;
    const fileId = this.makeFileId(filePath);
    // Classes
    const classRe = /(?:export\s+)?class\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = classRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.CLASS,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Functions
    const fnRe = /(?:export\s+)?(?:(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function))/g;
    while ((m = fnRe.exec(source)) !== null) {
      const name = m[1] || m[2];
      if (name) symbols.push({
        id: this.makeSymbolId(filePath, name), kind: SymbolKind.FUNCTION,
        name, shortName: name, visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Imports
    const importRe = /(?:import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s+from\s+)?(?:require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
    while ((m = importRe.exec(source)) !== null) {
      const specifier = m[1] || m[2] || m[3];
      if (!specifier) continue;
      imports.push({ specifier, localNames: [], isNamespace: false });
    }
    const esmImportRe = /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}\s*)?from\s+['"]([^'"]+)['"]/g;
    while ((m = esmImportRe.exec(source)) !== null) {
      const specifier = m[3];
      const localNames: string[] = [];
      if (m[1]) localNames.push(m[1]);
      if (m[2]) m[2].split(',').forEach((n) => localNames.push(n.trim().split(/\s+as\s+/)[0]));
      imports.push({ specifier, localNames, isNamespace: false });
      const fromDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
      const resolved = this.resolveImport(specifier, fromDir, context.allFilePaths);
      if (resolved) {
        relationships.push({
          fromId: fileId, toId: this.makeFileId(resolved),
          kind: RelationshipKind.IMPORTS, resolution: 'resolved',
          line: m.index, reason: `import '${specifier}'`,
        });
      }
    }
    return { file, symbols, relationships, imports, diagnostics: [] };
  }
}
