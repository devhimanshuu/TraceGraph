'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileCode2, Loader2, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { useGitHubSession } from '@/hooks/use-github-session';

// ── Lightweight syntax highlighter (no external deps) ────────────────────

type TokenKind = 'keyword' | 'string' | 'comment' | 'number' | 'type' | 'function' | 'operator' | 'plain';

interface Token {
  kind: TokenKind;
  text: string;
}

/** Language-aware syntax patterns (order matters — first match wins). */
const SYNTAX_PATTERNS: Record<string, Array<{ kind: TokenKind; regex: RegExp }>> = {
  typescript: [
    { kind: 'comment', regex: /\/\/.*$|\/\*[\s\S]*?\*\//m },
    { kind: 'string', regex: /"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`/ },
    { kind: 'keyword', regex: /\b(export|import|from|default|const|let|var|function|async|await|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|implements|interface|type|enum|throw|try|catch|finally|typeof|instanceof|in|of|void|null|undefined|true|false|as|readonly|private|public|protected|static|abstract|super|yield)\b/ },
    { kind: 'type', regex: /\b(string|number|boolean|any|unknown|never|object|Promise|Array|Map|Set|Record|Partial|Required|Omit|Pick)\b/ },
    { kind: 'number', regex: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
    { kind: 'function', regex: /\b([a-zA-Z_$][\w$]*)\s*(?=\()/ },
  ],
  javascript: [
    { kind: 'comment', regex: /\/\/.*$|\/\*[\s\S]*?\*\//m },
    { kind: 'string', regex: /"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`/ },
    { kind: 'keyword', regex: /\b(export|import|from|default|const|let|var|function|async|await|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|typeof|instanceof|in|of|void|null|undefined|true|false|yield|try|catch|finally|throw)\b/ },
    { kind: 'number', regex: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
    { kind: 'function', regex: /\b([a-zA-Z_$][\w$]*)\s*(?=\()/ },
  ],
  python: [
    { kind: 'comment', regex: /#.*$/m },
    { kind: 'string', regex: /"""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/ },
    { kind: 'keyword', regex: /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|raise|with|as|async|await|yield|lambda|pass|break|continue|and|or|not|is|in|True|False|None|self|super|print)\b/ },
    { kind: 'type', regex: /\b(str|int|float|bool|list|dict|set|tuple|type|Optional|Union|List|Dict|Set|Tuple)\b/ },
    { kind: 'number', regex: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
    { kind: 'function', regex: /\b([a-zA-Z_]\w*)\s*(?=\()/ },
  ],
  go: [
    { kind: 'comment', regex: /\/\/.*$|\/\*[\s\S]*?\*\//m },
    { kind: 'string', regex: /"[^"\\]*(?:\\.[^"\\]*)*"|`[^`]*`/ },
    { kind: 'keyword', regex: /\b(package|import|func|return|if|else|for|range|switch|case|default|var|const|type|struct|interface|map|chan|go|defer|select|break|continue|nil|true|false|make|new|len|cap|append|error|fmt)\b/ },
    { kind: 'type', regex: /\b(string|int|int32|int64|float32|float64|bool|byte|rune|error|any)\b/ },
    { kind: 'number', regex: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
    { kind: 'function', regex: /\b([a-zA-Z_]\w*)\s*(?=\()/ },
  ],
  java: [
    { kind: 'comment', regex: /\/\/.*$|\/\*[\s\S]*?\*\//m },
    { kind: 'string', regex: /"[^"\\]*(?:\\.[^"\\]*)*"/ },
    { kind: 'keyword', regex: /\b(public|private|protected|static|final|abstract|class|interface|enum|extends|implements|import|package|return|if|else|for|while|do|switch|case|break|continue|new|this|super|null|true|false|void|try|catch|finally|throw|synchronized|native|volatile|transient|instanceof)\b/ },
    { kind: 'type', regex: /\b(String|Integer|Boolean|Long|Double|Float|int|long|double|float|boolean|char|byte|short|void)\b/ },
    { kind: 'number', regex: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdD]?\b/ },
    { kind: 'function', regex: /\b([a-zA-Z_]\w*)\s*(?=\()/ },
  ],
  rust: [
    { kind: 'comment', regex: /\/\/.*$|\/\*[\s\S]*?\*\//m },
    { kind: 'string', regex: /"[^"\\]*(?:\\.[^"\\]*)*"/ },
    { kind: 'keyword', regex: /\b(fn|let|mut|const|struct|enum|trait|impl|pub|use|mod|crate|self|super|return|if|else|for|while|loop|match|break|continue|move|ref|where|async|await|unsafe|true|false|as|type|dyn|static|extern)\b/ },
    { kind: 'type', regex: /\b(i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|f32|f64|bool|char|str|String|Vec|Option|Result|Box|Rc|Arc)\b/ },
    { kind: 'number', regex: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
    { kind: 'function', regex: /\b([a-zA-Z_]\w*)\s*(?=\()/ },
  ],
  php: [
    { kind: 'comment', regex: /\/\/.*$|\/\*[\s\S]*?\*\//m },
    { kind: 'string', regex: /"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/ },
    { kind: 'keyword', regex: /\b(class|interface|trait|extends|implements|function|return|if|else|for|foreach|while|do|switch|case|break|continue|new|this|self|static|public|private|protected|abstract|final|var|echo|print|true|false|null|namespace|use|as|match)\b/ },
    { kind: 'type', regex: /\b(string|int|float|bool|array|object|callable|iterable|void|never|null)\b/ },
    { kind: 'number', regex: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
    { kind: 'function', regex: /\$?([a-zA-Z_]\w*)\s*(?=\()/ },
  ],
  csharp: [
    { kind: 'comment', regex: /\/\/.*$|\/\*[\s\S]*?\*\//m },
    { kind: 'string', regex: /"[^"\\]*(?:\\.[^"\\]*)*"/ },
    { kind: 'keyword', regex: /\b(public|private|protected|internal|static|readonly|class|interface|struct|enum|namespace|using|return|if|else|for|foreach|while|do|switch|case|break|continue|new|this|base|null|true|false|void|async|await|var|get|set|in|out|ref|override|virtual|abstract|sealed|partial)\b/ },
    { kind: 'type', regex: /\b(string|int|long|double|float|bool|char|byte|decimal|object|Task|IEnumerable|List|Dictionary|Action|Func)\b/ },
    { kind: 'number', regex: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDmM]?\b/ },
    { kind: 'function', regex: /\b([A-Z][\w]*)\s*(?=\()/ },
  ],
};

/** Tokenize one line of source code for a given language. */
function tokenizeLine(line: string, language: string): Token[] {
  const patterns = SYNTAX_PATTERNS[language] ?? SYNTAX_PATTERNS.typescript;
  const tokens: Token[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    let earliest: { kind: TokenKind; index: number; length: number } | null = null;

    for (const { kind, regex } of patterns) {
      const m = regex.exec(remaining);
      if (m && m.index < (earliest?.index ?? Infinity)) {
        earliest = { kind, index: m.index, length: m[0].length };
      }
    }

    if (!earliest) {
      tokens.push({ kind: 'plain', text: remaining });
      break;
    }

    if (earliest.index > 0) {
      tokens.push({ kind: 'plain', text: remaining.slice(0, earliest.index) });
    }

    tokens.push({ kind: earliest.kind, text: remaining.slice(earliest.index, earliest.index + earliest.length) });
    remaining = remaining.slice(earliest.index + earliest.length);
  }

  return tokens;
}

/** CSS class for each token kind — dark-theme-friendly monospace colors. */
const TOKEN_CLASS: Record<TokenKind, string> = {
  keyword: 'text-purple-400 font-semibold',
  string: 'text-emerald-400',
  comment: 'text-muted-foreground/60 italic',
  number: 'text-amber-400',
  type: 'text-sky-400',
  function: 'text-sky-300',
  operator: 'text-muted-foreground',
  plain: 'text-foreground/85',
};

// ── Component ────────────────────────────────────────────────────────────

export interface CodePreviewProps {
  /** The file path (repo-relative) to preview. */
  filePath: string;
  /** Entity label for the header (optional). */
  label?: string;
  /** Language hint for syntax highlighting. */
  languageHint?: string;
  /** Highlight the entity's line range (start, end) — 1-indexed. */
  highlightRange?: { start: number; end: number };
  onClose?: () => void;
}

/**
 * Code preview panel — fetches and displays source code with syntax
 * highlighting and line numbers. Used in the Graph Explorer's details panel.
 */
export function CodePreview({
  filePath,
  label,
  languageHint,
  highlightRange,
  onClose,
}: CodePreviewProps) {
  const { getToken } = useGitHubSession();
  const [content, setContent] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>(languageHint ?? 'typescript');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function fetchContent() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const result = await apiClient.getFileContent(filePath, token);
        if (!ignore) {
          setContent(result.content);
          setLanguage(result.language);
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
          setLoading(false);
        }
      }
    }
    void fetchContent();
    return () => { ignore = true; };
  }, [filePath, getToken]);

  const lines = useMemo(() => (content ?? '').split('\n'), [content]);

  const displayName = label ?? filePath.split('/').pop() ?? filePath;

  return (
    <Card className="border-border/80 bg-card/95 shadow-xl backdrop-blur-md overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 className="size-4 shrink-0 text-sky-400" />
          <CardTitle className="text-sm font-semibold truncate">{displayName}</CardTitle>
          <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-400">
            {language}
          </span>
        </div>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-7 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading source…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-rose-400">
            <AlertCircle className="size-3.5" />
            {error}
          </div>
        ) : content === null ? (
          <div className="py-8 text-center">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <FileCode2 className="size-3.5" />
              Source preview unavailable for this file
            </div>
            <p className="mt-1.5 font-mono text-[10px] text-muted-foreground/60">{filePath}</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-auto font-mono text-[11px] leading-5">
            <pre className="p-3">
              {lines.map((line, i) => {
                const lineNum = i + 1;
                const isHighlighted =
                  highlightRange &&
                  lineNum >= highlightRange.start &&
                  lineNum <= highlightRange.end;

                return (
                  <div
                    key={i}
                    className={`flex ${isHighlighted ? 'bg-sky-500/8 border-l-2 border-sky-500/50' : 'border-l-2 border-transparent'}`}
                  >
                    <span className="inline-block w-8 shrink-0 select-none pr-3 text-right text-muted-foreground/40">
                      {lineNum}
                    </span>
                    <span className="flex-1 overflow-x-auto whitespace-pre">
                      {tokenizeLine(line, language).map((token, j) => (
                        <span key={j} className={TOKEN_CLASS[token.kind]}>
                          {token.text}
                        </span>
                      ))}
                    </span>
                  </div>
                );
              })}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
