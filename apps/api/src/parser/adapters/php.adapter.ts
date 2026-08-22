/**
 * PHP adapter — extracts symbols and relationships from .php files
 * using Tree-sitter with the PHP grammar.
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

export class PhpAdapter extends BaseAdapter {
  readonly language = ProgrammingLanguage.PHP;
  readonly parserVersion = 1;
  readonly treeSitterGrammar = 'php';

  canParse(filePath: string): boolean {
    return /\.php$/i.test(filePath);
  }

  getCapabilities(): LanguageCapabilities {
    return {
      language: this.language,
      parsing: 'full',
      symbols: 'full',
      imports: 'full',
      calls: 'partial',
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

    loadGrammar('php').catch(() => {});

    try {
      const tree = parseSourceSync('php', context.source);
      if (!tree) return this.regexFallback(context, file, symbols, relationships, imports);
      this.extractFromTree(tree, context, symbols, relationships, imports);
      return { file, symbols, relationships, imports, diagnostics };
    } catch (err) {
      diagnostics.push(this.diagnostic(context.filePath, `Parse error: ${(err as Error).message}`));
      return this.regexFallback(context, file, symbols, relationships, imports);
    }
  }

  resolveImport(specifier: string, fromDir: string, allFilePaths: string[]): string | null {
    if (specifier.startsWith(__dirname)) return null;
    for (const ext of ['', '.php']) {
      if (allFilePaths.includes(specifier + ext)) return specifier + ext;
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

    const processNode = (node: any, depth = 0) => {
      if (depth > 50) return;

      switch (node.type) {
        case 'class_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.CLASS,
              name, shortName: name, visibility: 'public',
              sourceLocation: this.nodeLocation(node), filePath,
            });
            // Heritage
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child.type === 'base_clause') {
                const base = this.findChild(child, 'name');
                if (base) {
                  relationships.push({
                    fromId: this.makeSymbolId(filePath, name),
                    toId: this.makeSymbolId(filePath, this.identifierText(base, source)),
                    kind: RelationshipKind.EXTENDS, resolution: 'partial',
                    line: child.startPosition.row + 1,
                    reason: `extends ${this.identifierText(base, source)}`,
                  });
                }
              }
              if (child.type === 'interface_list') {
                for (let j = 0; j < child.childCount; j++) {
                  const iface = child.child(j);
                  if (iface.type === 'name') {
                    relationships.push({
                      fromId: this.makeSymbolId(filePath, name),
                      toId: this.makeSymbolId(filePath, this.identifierText(iface, source)),
                      kind: RelationshipKind.IMPLEMENTS, resolution: 'partial',
                      line: child.startPosition.row + 1,
                      reason: `implements ${this.identifierText(iface, source)}`,
                    });
                  }
                }
              }
            }
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
        case 'method_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.METHOD,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
            this.extractCalls(node, this.makeSymbolId(filePath, name), filePath, source, relationships);
          }
          break;
        }
        case 'function_definition': {
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
        case 'namespace_use_declaration': {
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child.type === 'namespace_use_clause') {
              const pathNode = this.findChild(child, 'name');
              if (pathNode) {
                imports.push({
                  specifier: this.identifierText(pathNode, source),
                  localNames: [], isNamespace: true,
                });
              }
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
    this.findDescendants(node, 'function_call_expression').forEach((call) => {
      const fn = this.fieldChild(call, 'function');
      if (!fn) return;
      const calleeName = this.identifierText(fn, source).replace(/^\\/, '');
      if (calleeName) {
        relationships.push({
          fromId: callerId, toId: `fn:${filePath}:${calleeName}`,
          kind: RelationshipKind.CALLS, resolution: 'partial',
          line: call.startPosition.row + 1, reason: `calls ${calleeName}()`,
        });
      }
    });
    this.findDescendants(node, 'member_call_expression').forEach((call) => {
      const obj = this.fieldChild(call, 'object');
      const prop = this.fieldChild(call, 'name');
      if (obj && prop) {
        const calleeName = `${this.identifierText(obj, source)}.${this.identifierText(prop, source)}`;
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
    const classRe = /(?:abstract\s+)?class\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = classRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.CLASS,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    const ifaceRe = /interface\s+(\w+)/g;
    while ((m = ifaceRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.INTERFACE,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    const fnRe = /(?:public|private|protected|static)\s+(?:function)\s+(\w+)/g;
    while ((m = fnRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.FUNCTION,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    const useRe = /^use\s+([\w\\]+);/gm;
    while ((m = useRe.exec(source)) !== null) {
      imports.push({ specifier: m[1], localNames: [], isNamespace: true });
    }
    return { file, symbols, relationships, imports, diagnostics: [] };
  }
}
