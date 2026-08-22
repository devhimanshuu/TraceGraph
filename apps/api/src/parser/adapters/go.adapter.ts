/**
 * Go adapter — extracts symbols and relationships from .go files
 * using Tree-sitter with the Go grammar.
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

export class GoAdapter extends BaseAdapter {
  readonly language = ProgrammingLanguage.GO;
  readonly parserVersion = 1;
  readonly treeSitterGrammar = 'go';

  canParse(filePath: string): boolean {
    return filePath.endsWith('.go');
  }

  getCapabilities(): LanguageCapabilities {
    return {
      language: this.language,
      parsing: 'full',
      symbols: 'full',
      imports: 'full',
      calls: 'full', // Go has static dispatch for most calls
      inheritance: 'full', // Go uses composition/embedding
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

    loadGrammar('go').catch(() => {});

    try {
      const tree = parseSourceSync('go', context.source);
      if (!tree) return this.regexFallback(context, file, symbols, relationships, imports);
      this.extractFromTree(tree, context, symbols, relationships, imports);
      return { file, symbols, relationships, imports, diagnostics };
    } catch (err) {
      diagnostics.push(this.diagnostic(context.filePath, `Parse error: ${(err as Error).message}`));
      return this.regexFallback(context, file, symbols, relationships, imports);
    }
  }

  resolveImport(specifier: string, fromDir: string, allFilePaths: string[]): string | null {
    // Go imports are full paths like "github.com/foo/bar" — not resolvable in-repo
    // Only resolve relative imports (shouldn't happen in normal Go)
    if (specifier.startsWith('.')) {
      const base = fromDir ? `${fromDir}/${specifier.slice(2)}` : specifier.slice(2);
      if (allFilePaths.includes(base + '.go')) return base + '.go';
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
        case 'type_declaration': {
          const typeSpec = this.findChild(node, 'type_spec');
          if (typeSpec) {
            const nameNode = this.fieldChild(typeSpec, 'name');
            const typeNode = this.fieldChild(typeSpec, 'type');
            if (nameNode && typeNode) {
              const name = this.identifierText(nameNode, source);
              let kind = SymbolKind.TYPE;
              if (typeNode.type === 'struct_type') kind = SymbolKind.STRUCT;
              else if (typeNode.type === 'interface_type') kind = SymbolKind.INTERFACE;

              symbols.push({
                id: this.makeSymbolId(filePath, name), kind,
                name, shortName: name, visibility: 'public',
                sourceLocation: this.nodeLocation(node), filePath,
              });

              // If struct, extract embedded types (composition)
              if (typeNode.type === 'struct_type') {
                this.findDescendants(typeNode, 'field_declaration_list').forEach((fieldList: any) => {
                  for (let i = 0; i < fieldList.childCount; i++) {
                    const field = fieldList.child(i);
                    if (field.type === 'field_declaration') {
                      // Embedded type (no name) = composition/extends
                      const fieldType = this.fieldChild(field, 'type');
                      if (fieldType && !this.fieldChild(field, 'name')) {
                        const embedName = this.identifierText(fieldType, source);
                        if (embedName) {
                          relationships.push({
                            fromId: this.makeSymbolId(filePath, name),
                            toId: this.makeSymbolId(filePath, embedName),
                            kind: RelationshipKind.EXTENDS, resolution: 'resolved',
                            line: field.startPosition.row + 1,
                            reason: `embeds ${embedName}`,
                          });
                        }
                      }
                    }
                  }
                });
              }

              // If interface, extract method signatures
              if (typeNode.type === 'interface_type') {
                this.findDescendants(typeNode, 'method_spec').forEach((spec: any) => {
                  const mName = this.fieldChild(spec, 'name');
                  if (mName) {
                    const methodName = this.identifierText(mName, source);
                    symbols.push({
                      id: this.makeSymbolId(filePath, `${name}.${methodName}`),
                      kind: SymbolKind.METHOD,
                      name: `${name}.${methodName}`, shortName: methodName,
                      visibility: 'public', sourceLocation: this.nodeLocation(spec),
                      filePath, parentName: name,
                    });
                  }
                });
              }
            }
          }
          break;
        }
        case 'function_declaration': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.FUNCTION,
              name, shortName: name, visibility: name[0] === name[0].toLowerCase() ? 'public' : 'public',
              sourceLocation: this.nodeLocation(node), filePath,
            });
            this.extractCalls(node, this.makeSymbolId(filePath, name), filePath, source, relationships);
          }
          break;
        }
        case 'method_declaration': {
          // Go method: func (r *Receiver) Method()
          const receiver = this.fieldChild(node, 'receiver');
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            let parentName = '';
            if (receiver) {
              const recvType = this.findDescendants(receiver, 'type_identifier');
              if (recvType.length > 0) parentName = this.identifierText(recvType[0], source);
            }
            const fullName = parentName ? `${parentName}.${name}` : name;
            symbols.push({
              id: this.makeSymbolId(filePath, fullName), kind: SymbolKind.METHOD,
              name: fullName, shortName: name, visibility: 'public',
              sourceLocation: this.nodeLocation(node), filePath,
              parentName: parentName || undefined,
            });
            this.extractCalls(node, this.makeSymbolId(filePath, fullName), filePath, source, relationships);
          }
          break;
        }
        case 'import_declaration': {
          const importsList = this.findChild(node, 'import_spec_list');
          if (importsList) {
            for (let i = 0; i < importsList.childCount; i++) {
              const spec = importsList.child(i);
              if (spec.type === 'import_spec') {
                const pathNode = this.fieldChild(spec, 'path');
                if (pathNode) {
                  const specifier = this.identifierText(pathNode, source).replace(/^["']/, '').replace(/["']$/, '');
                  imports.push({ specifier, localNames: [], isNamespace: true });
                }
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

  private extractCalls(
    node: any, callerId: string, filePath: string, source: string,
    relationships: ParsedRelationship[],
  ): void {
    this.findDescendants(node, 'call_expression').forEach((call) => {
      const fn = this.fieldChild(call, 'function');
      if (!fn) return;
      let calleeName = '';
      if (fn.type === 'identifier') calleeName = this.identifierText(fn, source);
      else if (fn.type === 'selector_expression') {
        const obj = this.fieldChild(fn, 'operand');
        const field = this.fieldChild(fn, 'field');
        if (obj && field) calleeName = `${this.identifierText(obj, source)}.${this.identifierText(field, source)}`;
      }
      if (calleeName && !['fmt', 'log', 'println', 'print', 'len', 'cap', 'make', 'new', 'append', 'error'].includes(calleeName.split('.')[0])) {
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
    // Types (structs, interfaces)
    const typeRe = /^type\s+(\w+)\s+(struct|interface)\s*\{/gm;
    let m: RegExpExecArray | null;
    while ((m = typeRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]),
        kind: m[2] === 'struct' ? SymbolKind.STRUCT : SymbolKind.INTERFACE,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Functions
    const fnRe = /^func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/gm;
    while ((m = fnRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.FUNCTION,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Calls
    const callRe = /(\w+)\s*\(/g;
    while ((m = callRe.exec(source)) !== null) {
      const callee = m[1];
      if (['func', 'type', 'if', 'for', 'switch', 'return', 'make', 'new', 'fmt', 'len'].includes(callee)) continue;
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
    // Imports (block and single-line)
    const importBlockRe = /^import\s+(?:\(\s*\n)?(.*?)\)/gm;
    while ((m = importBlockRe.exec(source)) !== null) {
      const block = m[1];
      for (const line of block.split('\n')) {
        const impMatch = line.match(/"([^"]+)"/);
        if (impMatch) imports.push({ specifier: impMatch[1], localNames: [], isNamespace: true });
      }
    }
    // Single-line imports: import "fmt"
    const importSingleRe = /^import\s+"([^"]+)"/gm;
    while ((m = importSingleRe.exec(source)) !== null) {
      imports.push({ specifier: m[1], localNames: [], isNamespace: true });
    }
    return { file, symbols, relationships, imports, diagnostics: [] };
  }
}
