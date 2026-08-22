/**
 * Java adapter — extracts symbols and relationships from .java files
 * using Tree-sitter with the Java grammar.
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

export class JavaAdapter extends BaseAdapter {
  readonly language = ProgrammingLanguage.JAVA;
  readonly parserVersion = 1;
  readonly treeSitterGrammar = 'java';

  canParse(filePath: string): boolean {
    return filePath.endsWith('.java');
  }

  getCapabilities(): LanguageCapabilities {
    return {
      language: this.language,
      parsing: 'full',
      symbols: 'full',
      imports: 'full',
      calls: 'partial', // Java overloading makes call resolution hard
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
      return this.regexFallback(context, file, symbols, relationships, imports);
    }

    loadGrammar('java').catch(() => {});

    try {
      const tree = parseSourceSync('java', context.source);
      if (!tree) return this.regexFallback(context, file, symbols, relationships, imports);
      this.extractFromTree(tree, context, symbols, relationships, imports);
      return { file, symbols, relationships, imports, diagnostics };
    } catch (err) {
      diagnostics.push(this.diagnostic(context.filePath, `Parse error: ${(err as Error).message}`));
      return this.regexFallback(context, file, symbols, relationships, imports);
    }
  }

  resolveImport(specifier: string, fromDir: string, allFilePaths: string[]): string | null {
    // Java imports are package-qualified — not directly resolvable to files
    // unless the directory structure matches the package
    const parts = specifier.split('.');
    if (parts.length > 1) {
      const candidate = parts.join('/') + '.java';
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
    const classStack: string[] = [];

    const processNode = (node: any, depth = 0) => {
      if (depth > 50) return;

      switch (node.type) {
        case 'class_declaration':
        case 'enum_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            classStack.push(name);
            symbols.push({
              id: this.makeSymbolId(filePath, name),
              kind: node.type === 'enum_declaration' ? SymbolKind.ENUM : SymbolKind.CLASS,
              name, shortName: name, visibility: 'public',
              sourceLocation: this.nodeLocation(node), filePath,
            });
            // Heritage
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child.type === 'superclass') {
                const superClass = this.fieldChild(child, 'type');
                if (superClass) {
                  relationships.push({
                    fromId: this.makeSymbolId(filePath, name),
                    toId: this.makeSymbolId(filePath, this.identifierText(superClass, source)),
                    kind: RelationshipKind.EXTENDS, resolution: 'partial',
                    line: child.startPosition.row + 1,
                    reason: `extends ${this.identifierText(superClass, source)}`,
                  });
                }
              }
              if (child.type === 'super_interfaces') {
                for (let j = 0; j < child.childCount; j++) {
                  const iface = child.child(j);
                  if (iface.type === 'type_identifier' || iface.type === 'generic_type') {
                    const ifaceName = this.identifierText(iface, source);
                    relationships.push({
                      fromId: this.makeSymbolId(filePath, name),
                      toId: this.makeSymbolId(filePath, ifaceName),
                      kind: RelationshipKind.IMPLEMENTS, resolution: 'partial',
                      line: child.startPosition.row + 1,
                      reason: `implements ${ifaceName}`,
                    });
                  }
                }
              }
            }
            classStack.pop();
          }
          break;
        }
        case 'interface_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.INTERFACE,
              name, shortName: name, visibility: 'public',
              sourceLocation: this.nodeLocation(node), filePath,
            });
          }
          break;
        }
        case 'method_declaration':
        case 'constructor_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            const kind = node.type === 'constructor_declaration' ? SymbolKind.CONSTRUCTOR : SymbolKind.METHOD;
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
            this.extractCalls(node, this.makeSymbolId(filePath, name), filePath, source, relationships);
          }
          break;
        }
        case 'import_declaration': {
          const pathNode = this.fieldChild(node, 'path');
          if (pathNode) {
            const specifier = this.identifierText(pathNode, source).replace(/^['"]|['"]$/g, '');
            const isStatic = this.nodeText(node, source).includes('static ');
            imports.push({
              specifier, localNames: [],
              isNamespace: specifier.endsWith('.'),
            });
            const fromDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
            const resolved = this.resolveImport(specifier, fromDir, context.allFilePaths);
            if (resolved) {
              relationships.push({
                fromId: this.makeFileId(filePath), toId: this.makeFileId(resolved),
                kind: RelationshipKind.IMPORTS, resolution: 'resolved',
                line: node.startPosition.row + 1,
                reason: `import ${isStatic ? 'static ' : ''}${specifier}`,
              });
            }
          }
          break;
        }
        case 'field_declaration': {
          const declarators = this.findDescendants(node, 'variable_declarator');
          for (const decl of declarators) {
            const nameNode = this.fieldChild(decl, 'name');
            if (nameNode) {
              const name = this.identifierText(nameNode, source);
              symbols.push({
                id: this.makeSymbolId(filePath, name), kind: SymbolKind.PROPERTY,
                name, shortName: name, visibility: this.extractVisibility(node, source),
                sourceLocation: this.nodeLocation(node), filePath,
              });
            }
          }
          break;
        }
      }
      for (let i = 0; i < node.childCount; i++) processNode(node.child(i), depth + 1);
    };

    processNode(root);
  }

  private extractVisibility(node: any, source: string): 'public' | 'private' | 'protected' {
    const text = this.nodeText(node, source);
    if (/\bprivate\b/.test(text)) return 'private';
    if (/\bprotected\b/.test(text)) return 'protected';
    return 'public';
  }

  private extractCalls(
    node: any, callerId: string, filePath: string, source: string,
    relationships: ParsedRelationship[],
  ): void {
    this.findDescendants(node, 'method_invocation').forEach((call) => {
      const obj = this.fieldChild(call, 'object');
      const nameNode = this.fieldChild(call, 'name');
      if (nameNode) {
        const calleeName = obj
          ? `${this.identifierText(obj, source)}.${this.identifierText(nameNode, source)}`
          : this.identifierText(nameNode, source);
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
    // Classes
    const classRe = /(?:public|private|protected)?\s*(?:abstract\s+)?(?:class|enum)\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = classRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.CLASS,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Interfaces
    const ifaceRe = /(?:public|private|protected)?\s*interface\s+(\w+)/g;
    while ((m = ifaceRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.INTERFACE,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Methods
    const methodRe = /(?:public|private|protected|static|final|abstract|synchronized|native)\s+(?:[\w<>\[\],\s]+\s+)?(\w+)\s*\(/g;
    while ((m = methodRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.METHOD,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Imports
    const importRe = /^import\s+(?:static\s+)?([\w.]+);/gm;
    while ((m = importRe.exec(source)) !== null) {
      imports.push({ specifier: m[1], localNames: [], isNamespace: m[1].endsWith('.') });
    }
    return { file, symbols, relationships, imports, diagnostics: [] };
  }
}
