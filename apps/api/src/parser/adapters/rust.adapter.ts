/**
 * Rust adapter — extracts symbols and relationships from .rs files
 * using Tree-sitter with the Rust grammar.
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

export class RustAdapter extends BaseAdapter {
  readonly language = ProgrammingLanguage.RUST;
  readonly parserVersion = 1;
  readonly treeSitterGrammar = 'rust';

  canParse(filePath: string): boolean {
    return filePath.endsWith('.rs');
  }

  getCapabilities(): LanguageCapabilities {
    return {
      language: this.language,
      parsing: 'full',
      symbols: 'full',
      imports: 'full',
      calls: 'partial', // Rust traits + generics make call resolution hard
      inheritance: 'partial', // Rust uses traits, not traditional inheritance
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

    loadGrammar('rust').catch(() => {});

    try {
      const tree = parseSourceSync('rust', context.source);
      if (!tree) return this.regexFallback(context, file, symbols, relationships, imports);
      this.extractFromTree(tree, context, symbols, relationships, imports);
      return { file, symbols, relationships, imports, diagnostics };
    } catch (err) {
      diagnostics.push(this.diagnostic(context.filePath, `Parse error: ${(err as Error).message}`));
      return this.regexFallback(context, file, symbols, relationships, imports);
    }
  }

  resolveImport(specifier: string, fromDir: string, allFilePaths: string[]): string | null {
    // Rust uses crate/relative imports — complex resolution
    if (specifier.startsWith('crate::') || specifier.startsWith('super::') || specifier.startsWith('self::')) {
      const rel = specifier.replace(/^crate::/, '').replace(/^super::/, '../').replace(/^self::/, '');
      const base = rel.replace(/::/g, '/');
      for (const ext of ['', '.rs']) {
        const candidate = fromDir ? `${fromDir}/${base}${ext}` : `${base}${ext}`;
        if (allFilePaths.includes(candidate)) return candidate;
      }
      // Try mod.rs
      const modCandidate = fromDir ? `${fromDir}/${base}/mod.rs` : `${base}/mod.rs`;
      if (allFilePaths.includes(modCandidate)) return modCandidate;
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
        case 'struct_item': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.STRUCT,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
          }
          break;
        }
        case 'enum_item': {
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
        case 'trait_item': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.TRAIT,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
            // Extract trait methods
            const body = this.fieldChild(node, 'declaration_list');
            if (body) {
              for (let i = 0; i < body.childCount; i++) {
                const member = body.child(i);
                if (member.type === 'function_signature_item' || member.type === 'function_item') {
                  const mName = this.fieldChild(member, 'name');
                  if (mName) {
                    symbols.push({
                      id: this.makeSymbolId(filePath, `${name}.${this.identifierText(mName, source)}`),
                      kind: SymbolKind.METHOD,
                      name: `${name}.${this.identifierText(mName, source)}`,
                      shortName: this.identifierText(mName, source),
                      visibility: 'public',
                      sourceLocation: this.nodeLocation(member), filePath,
                      parentName: name,
                    });
                  }
                }
              }
            }
          }
          break;
        }
        case 'impl_item': {
          // impl blocks — extract methods
          const typeNode = this.fieldChild(node, 'type');
          const body = this.fieldChild(node, 'declaration_list');
          if (typeNode && body) {
            const typeName = this.identifierText(typeNode, source);
            // Extract trait implementations
            const traitRef = this.findChild(node, 'type_identifier');
            if (traitRef && traitRef !== typeNode) {
              relationships.push({
                fromId: this.makeSymbolId(filePath, typeName),
                toId: this.makeSymbolId(filePath, this.identifierText(traitRef, source)),
                kind: RelationshipKind.IMPLEMENTS, resolution: 'resolved',
                line: node.startPosition.row + 1,
                reason: `impl ${this.identifierText(traitRef, source)} for ${typeName}`,
              });
            }
            for (let i = 0; i < body.childCount; i++) {
              const member = body.child(i);
              if (member.type === 'function_item') {
                const mName = this.fieldChild(member, 'name');
                if (mName) {
                  const methodName = this.identifierText(mName, source);
                  const fullName = `${typeName}.${methodName}`;
                  symbols.push({
                    id: this.makeSymbolId(filePath, fullName), kind: SymbolKind.METHOD,
                    name: fullName, shortName: methodName,
                    visibility: this.extractVisibility(member, source),
                    sourceLocation: this.nodeLocation(member), filePath,
                    parentName: typeName,
                  });
                  this.extractCalls(member, this.makeSymbolId(filePath, fullName), filePath, source, relationships);
                }
              }
            }
          }
          break;
        }
        case 'function_item': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.FUNCTION,
              name, shortName: name, visibility: this.extractVisibility(node, source),
              sourceLocation: this.nodeLocation(node), filePath,
            });
            this.extractCalls(node, this.makeSymbolId(filePath, name), filePath, source, relationships);
          }
          break;
        }
        case 'use_declaration': {
          const pathNode = this.fieldChild(node, 'path');
          if (pathNode) {
            const specifier = this.identifierText(pathNode, source);
            imports.push({ specifier, localNames: [], isNamespace: false });
            const fromDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
            const resolved = this.resolveImport(specifier, fromDir, context.allFilePaths);
            if (resolved) {
              relationships.push({
                fromId: this.makeFileId(filePath), toId: this.makeFileId(resolved),
                kind: RelationshipKind.IMPORTS, resolution: 'resolved',
                line: node.startPosition.row + 1,
                reason: `use ${specifier}`,
              });
            }
          }
          break;
        }
        case 'mod_item': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.MODULE,
              name, shortName: name, visibility: this.extractVisibility(node, source),
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

  private extractVisibility(node: any, source: string): 'public' | 'private' {
    const text = this.nodeText(node, source);
    return /\bpub\b/.test(text) ? 'public' : 'private';
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
      else if (fn.type === 'field_expression') {
        const obj = this.fieldChild(fn, 'value');
        const field = this.fieldChild(fn, 'field');
        if (obj && field) calleeName = `${this.identifierText(obj, source)}.${this.identifierText(field, source)}`;
      }
      if (calleeName && !['println', 'print', 'eprintln', 'eprint', 'format', 'vec', 'String', 'Box', 'Arc', 'Rc', 'Ok', 'Err', 'Some', 'None'].includes(calleeName.split('.')[0])) {
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
    // Structs
    const structRe = /(?:pub\s+)?struct\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = structRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.STRUCT,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Enums
    const enumRe = /(?:pub\s+)?enum\s+(\w+)/g;
    while ((m = enumRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.ENUM,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Traits
    const traitRe = /(?:pub\s+)?trait\s+(\w+)/g;
    while ((m = traitRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.TRAIT,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Functions
    const fnRe = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g;
    while ((m = fnRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.FUNCTION,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }
    // Use
    const useRe = /^use\s+([\w:]+);/gm;
    while ((m = useRe.exec(source)) !== null) {
      imports.push({ specifier: m[1], localNames: [], isNamespace: false });
    }
    return { file, symbols, relationships, imports, diagnostics: [] };
  }
}
