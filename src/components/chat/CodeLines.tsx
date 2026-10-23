"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { highlightCode, type HighlightLine } from "@/lib/highlighter";

function diffLineClass(line: string): string {
  if (line.startsWith("+")) return "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]";
  if (line.startsWith("-")) return "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]";
  if (line.startsWith("@@")) return "text-muted";
  return "";
}

/**
 * Token rendering shared by code blocks in the chat and by the file panel. While a message is
 * still streaming the raw text is shown, so long answers are not re-tokenised on every delta.
 */
function CodeLinesBase({
  code,
  language,
  streaming = false,
  wrap = false,
  className = "",
}: {
  code: string;
  language: string;
  streaming?: boolean;
  wrap?: boolean;
  className?: string;
}) {
  const [lines, setLines] = useState<HighlightLine[] | null>(null);

  useEffect(() => {
    if (streaming || code.length === 0) return;
    let cancelled = false;
    setLines(null);
    void highlightCode(code, language).then((result) => {
      if (!cancelled) setLines(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language, streaming]);

  const isDiff =
    language.trim().toLowerCase() === "diff" || language.trim().toLowerCase() === "patch";

  const renderedLines = useMemo(() => {
    if (!lines) return null;
    return lines.map((tokens, index) => {
      const text = tokens.map((token) => token.content).join("");
      return (
        <span key={index} className={`block min-h-[1.5em] ${isDiff ? diffLineClass(text) : ""}`}>
          {tokens.length === 0 ? "\u00a0" : null}
          {tokens.map((token, tokenIndex) => (
            <span
              key={tokenIndex}
              className="shiki-token"
              style={
                {
                  "--tk-light": token.light,
                  "--tk-dark": token.dark,
                  "--tk-style": token.italic ? "italic" : "normal",
                  "--tk-weight": token.bold ? 600 : undefined,
                } as React.CSSProperties
              }
            >
              {token.content}
            </span>
          ))}
        </span>
      );
    });
  }, [lines, isDiff]);

  return (
    <pre
      className={`m-0 font-mono text-[12.5px] leading-[1.6] ${
        wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto"
      } ${className}`}
    >
      <code>
        {renderedLines ??
          code.split("\n").map((line, index) => (
            <span
              key={index}
              className={`block min-h-[1.5em] ${isDiff ? diffLineClass(line) : ""}`}
            >
              {line.length === 0 ? "\u00a0" : line}
            </span>
          ))}
      </code>
    </pre>
  );
}

export const CodeLines = memo(CodeLinesBase);
