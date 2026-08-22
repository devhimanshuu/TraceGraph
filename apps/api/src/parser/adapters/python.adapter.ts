/**
 * Python adapter — extracts symbols and relationships from .py files
 * using Tree-sitter with the Python grammar.
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

const SOURCE_EXTS = ['.py', '.pyi'];

export class PythonAdapter extends BaseAdapter {
  readonly language = ProgrammingLanguage.PYTHON;
  readonly parserVersion = 1;
  readonly treeSitterGrammar = 'python';

  canParse(filePath: string): boolean {
    return /\.pyi?$/.test(filePath) && !filePath.includes('__pycache__');
  }

  getCapabilities(): LanguageCapabilities {
    return {
      language: this.language,
      parsing: 'full',
      symbols: 'full',
      imports: 'full',
      calls: 'partial', // Python dynamic dispatch makes call resolution hard
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

    loadGrammar('python').catch(() => {});

    try {
      const tree = parseSourceSync('python', context.source);
      if (!tree) return this.regexFallback(context, file, symbols, relationships, imports);
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
    const normalized = base.replace(/\/__init__$/, '');
    for (const ext of ['', '.py']) {
      if (allFilePaths.includes(normalized + ext)) return normalized + ext;
    }
    // Try as package with __init__.py
    for (const ext of ['/__init__.py', '.py']) {
      const candidate = normalized + ext;
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
        case 'class_definition': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            classStack.push(name);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.CLASS,
              name, shortName: name, visibility: 'public',
              sourceLocation: this.nodeLocation(node), filePath,
            });
            // Superclasses
            const superclasses = this.findChild(node, 'argument_list');
            if (superclasses) {
              for (let i = 0; i < superclasses.childCount; i++) {
                const arg = superclasses.child(i);
                if (arg.type === 'identifier' || arg.type === 'attribute') {
                  const parentName = this.identifierText(arg, source);
                  if (parentName && parentName !== 'object') {
                    relationships.push({
                      fromId: this.makeSymbolId(filePath, name),
                      toId: this.makeSymbolId(filePath, parentName),
                      kind: RelationshipKind.EXTENDS, resolution: 'partial',
                      line: arg.startPosition.row + 1,
                      reason: `inherits from ${parentName}`,
                    });
                  }
                }
              }
            }
            // Class body
            const body = this.fieldChild(node, 'body');
            if (body) {
              for (let i = 0; i < body.childCount; i++) {
                const member = body.child(i);
                if (member.type === 'function_definition') {
                  const mName = this.fieldChild(member, 'name');
                  if (mName) {
                    const methodName = this.identifierText(mName, source);
                    const isDunder = methodName.startsWith('__') && methodName.endsWith('__');
                    const isStatic = this.hasDecorator(member, 'staticmethod', source);
                    const isClassMethod = this.hasDecorator(member, 'classmethod', source);
                    const isProperty = this.hasDecorator(member, 'property', source);
                    const kind = isProperty ? SymbolKind.PROPERTY :
                      (isStatic || isClassMethod || isDunder) ? SymbolKind.FUNCTION : SymbolKind.METHOD;
                    const fullName = kind === SymbolKind.METHOD ? `${name}.${methodName}` : methodName;
                    symbols.push({
                      id: this.makeSymbolId(filePath, fullName), kind,
                      name: fullName, shortName: methodName,
                      visibility: methodName.startsWith('_') ? 'private' : 'public',
                      sourceLocation: this.nodeLocation(member), filePath,
                      parentName: name,
                    });
                    if (kind === SymbolKind.METHOD) {
                      this.extractCalls(member, this.makeSymbolId(filePath, fullName), filePath, source, relationships);
                    }
                  }
                }
              }
            }
            classStack.pop();
          }
          break;
        }
        case 'function_definition': {
          const nameNode = this.fieldChild(node, 'name');
          if (nameNode) {
            const name = this.identifierText(nameNode, source);
            symbols.push({
              id: this.makeSymbolId(filePath, name), kind: SymbolKind.FUNCTION,
              name, shortName: name,
              visibility: name.startsWith('_') ? 'private' : 'public',
              sourceLocation: this.nodeLocation(node), filePath,
            });
            this.extractCalls(node, this.makeSymbolId(filePath, name), filePath, source, relationships);
          }
          break;
        }
        case 'import_statement': {
          const names = this.findDescendants(node, 'dotted_name');
          for (const nameNode of names) {
            const name = this.identifierText(nameNode, source);
            imports.push({ specifier: name, localNames: [name], isNamespace: false });
          }
          break;
        }
        case 'import_from_statement': {
          const moduleNode = this.fieldChild(node, 'module_name');
          if (moduleNode) {
            const specifier = this.identifierText(moduleNode, source);
            const localNames: string[] = [];
            let isNamespace = false;
            // Check for wildcard import
            const wildcard = this.findChild(node, 'wildcard_import');
            if (wildcard) {
              isNamespace = true;
            } else {
              // Named imports
              const names = this.findDescendants(node, 'dotted_name');
              const aliases = this.findDescendants(node, 'aliased_import');
              for (const alias of aliases) {
                const nameNode = this.fieldChild(alias, 'name');
                if (nameNode) localNames.push(this.identifierText(nameNode, source));
              }
              for (const nameNode of names) {
                const text = this.identifierText(nameNode, source);
                if (text !== specifier && !localNames.includes(text)) localNames.push(text);
              }
            }
            imports.push({ specifier, localNames, isNamespace });
            // Resolve relative imports
            const fromDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
            const resolved = this.resolveImport(specifier, fromDir, context.allFilePaths);
            if (resolved) {
              relationships.push({
                fromId: fileId, toId: this.makeFileId(resolved),
                kind: RelationshipKind.IMPORTS, resolution: 'resolved',
                line: node.startPosition.row + 1,
                reason: `from ${specifier} import ...`,
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

  private hasDecorator(node: any, name: string, source: string): boolean {
    const decorators = this.findDescendants(node, 'decorator');
    return decorators.some((d: any) => this.nodeText(d, source).includes(`@${name}`));
  }

  private extractCalls(
    node: any, callerId: string, filePath: string, source: string,
    relationships: ParsedRelationship[],
  ): void {
    this.findDescendants(node, 'call').forEach((call) => {
      const func = this.fieldChild(call, 'function');
      if (!func) return;
      let calleeName = '';
      if (func.type === 'identifier') calleeName = this.identifierText(func, source);
      else if (func.type === 'attribute') {
        const obj = this.fieldChild(func, 'object');
        const attr = this.fieldChild(func, 'attribute');
        if (obj && attr) calleeName = `${this.identifierText(obj, source)}.${this.identifierText(attr, source)}`;
      }
      if (calleeName && !['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'type', 'super', 'isinstance', 'getattr', 'setattr'].includes(calleeName.split('.')[0])) {
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
    const lines = source.split('\n');

    // Classes
    const classRe = /^class\s+(\w+)\s*(?:\(([^)]*)\))?:/gm;
    let m: RegExpExecArray | null;
    while ((m = classRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.CLASS,
        name: m[1], shortName: m[1], visibility: 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
      if (m[2]) {
        for (const parent of m[2].split(',')) {
          const parentName = parent.trim();
          if (parentName && parentName !== 'object') {
            relationships.push({
              fromId: this.makeSymbolId(filePath, m[1]),
              toId: this.makeSymbolId(filePath, parentName),
              kind: RelationshipKind.EXTENDS, resolution: 'partial',
              line: m.index, reason: `extends ${parentName}`,
            });
          }
        }
      }
    }

    // Functions
    const fnRe = /(?:async\s+)?def\s+(\w+)\s*\(/g;
    while ((m = fnRe.exec(source)) !== null) {
      symbols.push({
        id: this.makeSymbolId(filePath, m[1]), kind: SymbolKind.FUNCTION,
        name: m[1], shortName: m[1],
        visibility: m[1].startsWith('_') ? 'private' : 'public',
        sourceLocation: this.makeSourceLocation(m.index, m.index, 0, 0), filePath,
      });
    }

    // Imports
    const importRe = /^from\s+([\w.]+)\s+import\s+(.+)/gm;
    while ((m = importRe.exec(source)) !== null) {
      const specifier = m[1];
      const names = m[2].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]);
      imports.push({ specifier, localNames: names, isNamespace: false });
    }
    const directImportRe = /^import\s+([\w.]+)/gm;
    while ((m = directImportRe.exec(source)) !== null) {
      imports.push({ specifier: m[1], localNames: [m[1]], isNamespace: false });
    }

    return { file, symbols, relationships, imports, diagnostics: [] };
  }
}
