/**
 * C# adapter — extracts symbols and relationships from .cs files
 * using Tree-sitter with the C# grammar.
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

export class CSharpAdapter extends BaseAdapter {
  readonly language = ProgrammingLanguage.CSHARP;
  readonly parserVersion = 1;
  readonly treeSitterGrammar = 'c_sharp';

  canParse(filePath: string): boolean {
    return filePath.endsWith('.cs');
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

    loadGrammar('c_sharp').catch(() => {});

    try {
      const tree = parseSourceSync('c_sharp', context.source);
      if (!tree) return this.regexFallback(context, file, symbols, relationships, imports);
      this.extractFromTree(tree, context, symbols, relationships, imports);
      return { file, symbols, relationships, imports, diagnostics };
    } catch (err) {
      diagnostics.push(this.diagnostic(context.filePath, `Parse error: ${(err as Error).message}`));
      return this.regexFallback(context, file, symbols, relationships, imports);
    }
  }

  resolveImport(specifier: string, fromDir: string, allFilePaths: string[]): string | null {
    // C# uses using directives — namespace resolution is complex
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
        case 'class_declaration':
        case 'struct_declaration':
        case 'record_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            const kind = node.type === 'struct_declaration' ? SymbolKind.STRUCT :
              node.type === 'record_declaration' ? SymbolKind.CLASS : SymbolKind.CLASS;
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
            // Heritage
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child.type === 'base_list') {
                for (let j = 0; j < child.childCount; j++) {
                  const type = child.child(j);
                  if (type.type === 'identifier' || type.type === 'generic_type') {
                    const parentName = this.identifierText(type, source);
                    relationships.push({
                      fromId: this.makeSymbolId(filePath, name),
                      toId: this.makeSymbolId(filePath, parentName),
                      kind: RelationshipKind.EXTENDS, resolution: 'partial',
                      line: child.startPosition.row + 1,
                      reason: `extends ${parentName}`,
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
        case 'method_declaration':
        case 'constructor_declaration':
        case 'destructor_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            const kind = node.type === 'constructor_declaration' ? SymbolKind.CONSTRUCTOR :
              node.type === 'destructor_declaration' ? SymbolKind.CONSTRUCTOR : SymbolKind.METHOD;
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
            this.extractCalls(node, this.makeSymbolId(filePath, name), filePath, source, relationships);
          }
          break;
        }
        case 'using_directive': {
          const pathNode = this.fieldChild(node, 'name');
          if (pathNode) {
            const specifier = this.identifierText(pathNode, source);
            imports.push({ specifier, localNames: [], isNamespace: true });
          }
          break;
        }
        case 'property_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.PROPERTY,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
          }
          break;
        }
        case 'namespace_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.NAMESPACE,
              name, shortName: name, visibility: 'public',
              sourceLocation: this.nodeLocation(node), filePath,
            });
          }
          break;
        }
      }
      for (let i = 0; i < node.childCount; i++) processNode(node.child(i), depth + 1);
    };

    processNode(root);
  }

  private extractVisibility(node: any, source: string): 'public' | 'private' | 'protected' | 'internal' {
    const text = this.nodeText(node, source);
    if (/\bprivate\b/.test(text)) return 'private';
    if (/\bprotected\b/.test(text)) return 'protected';
    if (/\binternal\b/.test(text)) return 'internal';
    return 'public';
  }

  private extractCalls(
    node: any, callerId: string, filePath: string, source: string,
    relationships: ParsedRelationship[],
  ): void {
    this.findDescendants(node, 'invocation_expression').forEach((call) => {
      const fn = this.fieldChild(call, 'function');
      if (!fn) return;
      const calleeName = this.identifierText(fn, source);
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
    const classRe = /(?:public|private|protected|internal)?\s*(?:partial\s+)?(?:abstract\s+)?(?:sealed\s+)?class\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = classRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.CLASS,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    const ifaceRe = /(?:public|private|protected|internal)?\s*interface\s+(\w+)/g;
    while ((m = ifaceRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.INTERFACE,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    const methodRe = /(?:public|private|protected|internal|static|async|virtual|override|abstract)\s+(?:[\w<>\[\],\s]+\s+)?(\w+)\s*\(/g;
    while ((m = methodRe.exec(source)) !== null) {
      if (!['if', 'for', 'while', 'switch', 'catch', 'using', 'return', 'new', 'class', 'interface', 'enum', 'struct', 'namespace'].includes(m[1])) {
        symbols.push({
          id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.METHOD,
          name: m[1], shortName: m[1], visibility: 'public',
          sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
        });
      }
    }
    const usingRe = /^using\s+([\w.]+);/gm;
    while ((m = usingRe.exec(source)) !== null) {
      imports.push({ specifier: m[1], localNames: [], isNamespace: true });
    }
    return { file, symbols, relationships, imports, diagnostics: [] };
  }
}
