import * as ts from 'typescript';

/**
 * Pure parsing of a single TypeScript/JavaScript source file (no I/O). The
 * import service feeds file contents here and resolves the emitted references
 * (imports, calls, extends) against the file map. Keeping this module free of
 * file-system access makes the extraction logic unit-testable.
 */

export interface ParsedSymbol {
  /** Full node name: `foo`, `Bar`, or `Bar.baz` (class method). */
  name: string;
  /** Short name used for reference resolution (`baz` for `Bar.baz`). */
  shortName: string;
  kind: 'function' | 'class' | 'method';
  className?: string;
  /** 1-based source line of the declaration start. */
  lineStart: number;
  lineEnd: number;
  visibility: 'public' | 'private' | 'protected';
  /** Human signature, e.g. `processPayment(amount, retries)`. */
  signature?: string;
}

export interface ParsedImport {
  /** Raw module specifier (relative or package). */
  specifier: string;
  /** Named imports: local alias → remote export name. */
  imported: Array<{ local: string; remote: string }>;
  /** Default import local name, if any. */
  defaultLocal?: string;
  /** Namespace import local name, if any. */
  namespace?: string;
}

export interface ParsedCall {
  /** Enclosing function/method full name (`foo`, `Bar.baz`) — the caller. */
  caller?: string;
  /** Raw callee text: `foo`, `Bar.baz`, `ns.baz`, `this.baz`. */
  callee: string;
  line: number;
}

export interface ParsedExtends {
  className: string;
  /** Raw parent text: `Base`, `Mixins.Base`, `ns.Base`. */
  parent: string;
}

export interface ParsedTest {
  /** describe › it chain, e.g. `checkout › charges the card once`. */
  name: string;
}

export interface ParsedFile {
  /** Repo-relative path (also the File node id tail). */
  path: string;
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  calls: ParsedCall[];
  tests: ParsedTest[];
  extends: ParsedExtends[];
}

const TEST_CALLEES = new Set(['it', 'test', 'fit', 'xit', 'it.each', 'test.each']);
const DESCRIBE_CALLEES = new Set(['describe', 'describe.each', 'fdescribe', 'xdescribe']);

function isSourceFileLike(path: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(path) && !path.endsWith('.d.ts');
}

export function parseFile(path: string, source: string): ParsedFile | null {
  if (!isSourceFileLike(path)) {
    return null;
  }
  const scriptKind =
    path.endsWith('.tsx') || path.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind);

  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const calls: ParsedCall[] = [];
  const tests: ParsedTest[] = [];
  const extendsClauses: ParsedExtends[] = [];
  const describeStack: string[] = [];
  /** Enclosing function/method names (stack of full symbol names). */
  const scopeStack: string[] = [];
  /** Enclosing class names (for method scoping). */
  const classStack: string[] = [];

  const lineOf = (node: ts.Node): number =>
    ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile)).line + 1;

  const endLineOf = (node: ts.Node): number =>
    ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd()).line + 1;

  const signatureOf = (name: string, parameters: readonly ts.ParameterDeclaration[]): string =>
    `${name}(${parameters
      .map((p) => (ts.isIdentifier(p.name) ? p.name.text : 'param'))
      .join(', ')})`;

  const visibilityOf = (modifiers?: ts.NodeArray<ts.ModifierLike>): ParsedSymbol['visibility'] => {
    if (!modifiers) return 'public';
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) return 'private';
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)) return 'protected';
    return 'public';
  };

  const calleeText = (node: ts.Expression): string => {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) {
      // `this.baz` → keep the marker; `ns.baz` / `Bar.baz` → two parts.
      const object = ts.isIdentifier(node.expression)
        ? node.expression.text
        : node.expression.getText(sourceFile);
      return `${object}.${node.name.text}`;
    }
    return node.getText(sourceFile);
  };

  function visit(node: ts.Node): void {
    // Imports
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const entry: ParsedImport = { specifier: node.moduleSpecifier.text, imported: [] };
      const clause = node.importClause;
      if (clause) {
        if (clause.name) entry.defaultLocal = clause.name.text;
        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            entry.namespace = clause.namedBindings.name.text;
          } else if (ts.isNamedImports(clause.namedBindings)) {
            for (const spec of clause.namedBindings.elements) {
              entry.imported.push({
                local: spec.name.text,
                remote: spec.propertyName ? spec.propertyName.text : spec.name.text,
              });
            }
          }
        }
      }
      imports.push(entry);
    }

    // Function-like declarations push/pop the caller scope around their body.
    let scopedName: string | null = null;
    let pushScope = false;
    if (ts.isFunctionDeclaration(node) && node.name) {
      scopedName = node.name.text;
      pushScope = true;
    } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      const className = classStack[classStack.length - 1];
      if (className) {
        scopedName = `${className}.${node.name.text}`;
        pushScope = true;
      }
    } else if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations.find(
        (d) =>
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)),
      );
      if (declaration && ts.isIdentifier(declaration.name)) {
        scopedName = declaration.name.text;
        pushScope = true;
      }
    }

    if (pushScope && scopedName) scopeStack.push(scopedName);

    // Classes + their methods
    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.text;
      classStack.push(className);
      symbols.push({
        name: className,
        shortName: className,
        kind: 'class',
        lineStart: lineOf(node),
        lineEnd: endLineOf(node),
        visibility: 'public',
      });

      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
          symbols.push({
            name: `${className}.${member.name.text}`,
            shortName: member.name.text,
            kind: 'method',
            className,
            lineStart: lineOf(member),
            lineEnd: endLineOf(member),
            visibility: visibilityOf(member.modifiers),
            signature: signatureOf(member.name.text, member.parameters),
          });
        }
      }

      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
          for (const type of clause.types) {
            const expr = type.expression;
            if (ts.isIdentifier(expr)) {
              extendsClauses.push({ className, parent: expr.text });
            } else if (ts.isPropertyAccessExpression(expr)) {
              extendsClauses.push({
                className,
                parent: `${expr.expression.getText(sourceFile)}.${expr.name.text}`,
              });
            }
          }
        }
      }
    }

    // Top-level functions
    if (ts.isFunctionDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.text,
        shortName: node.name.text,
        kind: 'function',
        lineStart: lineOf(node),
        lineEnd: endLineOf(node),
        visibility: 'public',
        signature: signatureOf(node.name.text, node.parameters),
      });
    }

    // Const arrow/function expressions (the JS default)
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          symbols.push({
            name: declaration.name.text,
            shortName: declaration.name.text,
            kind: 'function',
            lineStart: lineOf(node),
            lineEnd: endLineOf(node),
            visibility: 'public',
            signature: signatureOf(declaration.name.text, declaration.initializer.parameters),
          });
        }
      }
    }

    // Calls, tests, and describe scoping
    if (ts.isCallExpression(node)) {
      const callee = calleeText(node.expression);

      if (DESCRIBE_CALLEES.has(callee)) {
        const nameArg = node.arguments[0];
        const pushed = nameArg && ts.isStringLiteral(nameArg) ? nameArg.text : null;
        if (pushed) describeStack.push(pushed);
        ts.forEachChild(node, visit);
        if (pushed) describeStack.pop();
        return;
      }

      calls.push({
        caller: scopeStack[scopeStack.length - 1],
        callee,
        line: lineOf(node),
      });

      if (TEST_CALLEES.has(callee)) {
        const nameArg = node.arguments[0];
        const label = nameArg && ts.isStringLiteral(nameArg) ? nameArg.text : callee;
        tests.push({ name: [...describeStack, label].join(' › ') });
      }
    }

    ts.forEachChild(node, visit);
    if (pushScope && scopedName) scopeStack.pop();
    if (ts.isClassDeclaration(node) && node.name) classStack.pop();
  }

  visit(sourceFile);

  return { path, symbols, imports, calls, tests, extends: extendsClauses };
}
