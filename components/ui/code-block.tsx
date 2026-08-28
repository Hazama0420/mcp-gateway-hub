// components/ui/code-block.tsx
'use client';

import * as React from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  className?: string;
}

// Lightweight, safe syntax tokenizer for JSON formatted strings
function highlightJson(jsonStr: string): React.ReactNode[] {
  // Regex to match JSON tokens: string keys, string values, numbers, booleans, null, punctuation
  const tokenRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}[\],:])/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(jsonStr)) !== null) {
    // Add text preceding the match (whitespace / newlines)
    if (match.index > lastIndex) {
      elements.push(jsonStr.substring(lastIndex, match.index));
    }

    const token = match[0];
    const key = `tok-${match.index}`;

    if (/^"/.test(token)) {
      if (/:$/.test(token)) {
        // Object Key
        const keyText = token.slice(0, -1);
        elements.push(
          <span key={key} style={{ color: 'var(--code-key)' }} className="font-bold">
            {keyText}
          </span>
        );
        elements.push(
          <span key={`${key}-colon`} style={{ color: 'var(--code-punct)' }}>
            :
          </span>
        );
      } else {
        // String Value
        elements.push(
          <span key={key} style={{ color: 'var(--code-string)' }} className="font-medium">
            {token}
          </span>
        );
      }
    } else if (/true|false/.test(token)) {
      // Boolean Value
      elements.push(
        <span key={key} style={{ color: 'var(--code-boolean)' }} className="font-bold">
          {token}
        </span>
      );
    } else if (/null/.test(token)) {
      // Null Value
      elements.push(
        <span key={key} style={{ color: 'var(--code-null)' }} className="font-bold italic">
          {token}
        </span>
      );
    } else if (/^-?\d/.test(token)) {
      // Number Value
      elements.push(
        <span key={key} style={{ color: 'var(--code-number)' }} className="font-bold">
          {token}
        </span>
      );
    } else {
      // Brackets, commas, colons
      elements.push(
        <span key={key} style={{ color: 'var(--code-punct)' }} className="font-bold">
          {token}
        </span>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < jsonStr.length) {
    elements.push(jsonStr.substring(lastIndex));
  }

  return elements;
}

export function CodeBlock({
  code,
  language = 'json',
  title,
  className = '',
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  };

  const isJson = language.toLowerCase() === 'json';
  const formattedNodes = React.useMemo(() => {
    if (isJson) {
      try {
        return highlightJson(code);
      } catch {
        return [code];
      }
    }
    return [code];
  }, [code, isJson]);

  return (
    <div
      className={`pop-card overflow-hidden border-2 border-[var(--color-border)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] rounded-xl transition-colors duration-200 ${className}`}
      style={{ backgroundColor: 'var(--code-bg)', color: 'var(--code-text)' }}
    >
      {/* Header Bar */}
      <div
        className="flex items-center justify-between border-b-2 border-[var(--color-border)] px-3.5 py-2 transition-colors duration-200"
        style={{ backgroundColor: 'var(--code-header-bg)' }}
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-amber-500 stroke-[2.5]" />
          {title && (
            <span className="font-mono text-xs font-black text-[var(--color-text-primary)]">
              {title}
            </span>
          )}
          <span className="pop-badge bg-amber-300 text-slate-950 px-1.5 py-0.2 text-[9px] font-mono uppercase font-black">
            {language}
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="pop-btn h-6 px-2 text-[10px] font-mono font-black bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:bg-amber-300 gap-1 shadow-[1px_1px_0px_0px_rgba(15,23,42,1)]"
          aria-label="Copy code"
        >
          {copied ? (
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="h-3 w-3 stroke-[3]" />
              <span>COPIED</span>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Copy className="h-3 w-3" />
              <span>COPY</span>
            </span>
          )}
        </Button>
      </div>

      {/* Code Area with High Contrast & Syntax Highlighting */}
      <div
        className="overflow-x-auto p-4 font-mono text-xs leading-relaxed selection:bg-amber-300 selection:text-slate-950"
        style={{ backgroundColor: 'var(--code-bg)', color: 'var(--code-text)' }}
      >
        <pre className="font-mono text-xs whitespace-pre-wrap break-words">{formattedNodes}</pre>
      </div>
    </div>
  );
}
