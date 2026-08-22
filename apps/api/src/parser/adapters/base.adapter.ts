/**
 * Base adapter with shared Tree-sitter traversal utilities.
 * Each language adapter extends this and overrides node-type mapping.
 */
import { createHash } from 'node:crypto';
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
  type ParsedFileMeta,
  type SourceLocation,
  type LanguageCapabilities,
  type CapabilityStatus,
} from '../types';

export abstract class BaseAdapter {
  abstract readonly language: ProgrammingLanguage;
  abstract readonly parserVersion: number;
  abstract readonly treeSitterGrammar: string;

  abstract canParse(filePath: string): boolean;
  abstract getCapabilities(): LanguageCapabilities;

  /**
   * Default parse implementation — subclasses may override entirely
   * if they need custom Tree-sitter traversal.
   */
  parse(context: ParseContext): ParseResult {
    const file: ParsedFileMeta = {
      path: context.filePath,
      language: this.language,
      extension: this.getExtension(context.filePath),
      sizeBytes: Buffer.byteLength(context.source, 'utf8'),
      lineCount: context.source.split('\n').length,
      contentHash: createHash('sha256').update(context.source).digest('hex'),
    };

    return {
      file,
      symbols: [],
      relationships: [],
      imports: [],
      diagnostics: [],
    };
  }

  resolveImport(_specifier: string, _fromDir: string, _allFilePaths: string[]): string | null {
    return null;
  }

  // ── Shared utilities ─────────────────────────────────────────────────────

  protected getExtension(filePath: string): string {
    const dot = filePath.lastIndexOf('.');
    return dot >= 0 ? filePath.slice(dot) : '';
  }

  protected makeSourceLocation(
    lineStart: number,
    lineEnd: number,
    colStart: number,
    colEnd: number,
  ): SourceLocation {
    return { lineStart, lineEnd, columnStart: colStart, columnEnd: colEnd };
  }

  protected makeSymbolId(filePath: string, name: string): string {
    return `fn:${filePath}:${name}`;
  }

  protected makeFileId(filePath: string): string {
    return `file:${filePath}`;
  }

  /**
   * Hash content for incremental sync.
   */
  protected contentHash(source: string): string {
    return createHash('sha256').update(source).digest('hex');
  }

  /**
   * Create a diagnostic for a parse error in this file.
   */
  protected diagnostic(
    filePath: string,
    message: string,
    severity: DiagnosticSeverity = DiagnosticSeverity.WARNING,
    line?: number,
  ): ParserDiagnostic {
    return {
      file: filePath,
      language: this.language,
      severity,
      message,
      line,
      parser: this.constructor.name,
    };
  }

  // ── Tree-sitter helpers ──────────────────────────────────────────────────

  /**
   * Extract source location from a Tree-sitter node.
   */
  protected nodeLocation(node: any): SourceLocation {
    const start = node.startPosition;
    const end = node.endPosition;
    return this.makeSourceLocation(
      start.row + 1, // Tree-sitter is 0-indexed, our IR is 1-indexed
      end.row + 1,
      start.column,
      end.column,
    );
  }

  /**
   * Get the text content of a Tree-sitter node.
   */
  protected nodeText(node: any, source: string): string {
    return source.slice(node.startIndex, node.endIndex);
  }

  /**
   * Find child nodes by type name.
   */
  protected findChildren(node: any, type: string): any[] {
    const results: any[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === type) results.push(child);
    }
    return results;
  }

  /**
   * Find first child node by type name.
   */
  protected findChild(node: any, type: string): any | null {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === type) return child;
    }
    return null;
  }

  /**
   * Find descendant nodes by type (recursive).
   */
  protected findDescendants(node: any, type: string): any[] {
    const results: any[] = [];
    const walk = (n: any) => {
      if (n.type === type) results.push(n);
      for (let i = 0; i < n.childCount; i++) {
        walk(n.child(i));
      }
    };
    walk(node);
    return results;
  }

  /**
   * Get the named child at a specific field name.
   */
  protected fieldChild(node: any, fieldName: string): any | null {
    try {
      return node.childForFieldName(fieldName);
    } catch {
      return null;
    }
  }

  /**
   * Extract identifier text from a node (handles identifier, field_identifier, etc.)
   */
  protected identifierText(node: any, source: string): string {
    if (!node) return '';
    const text = this.nodeText(node, source);
    // Strip backticks (Go), quotes (some languages)
    return text.replace(/^`|`$/g, '').replace(/^["']|["']$/g, '');
  }

  // ── Content-hash-based file metadata ─────────────────────────────────────

  protected makeFileMeta(filePath: string, source: string): ParsedFileMeta {
    return {
      path: filePath,
      language: this.language,
      extension: this.getExtension(filePath),
      sizeBytes: Buffer.byteLength(source, 'utf8'),
      lineCount: source.split('\n').length,
      contentHash: this.contentHash(source),
    };
  }
}
