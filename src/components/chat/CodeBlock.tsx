"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { highlightCode, type HighlightLine } from "@/lib/highlighter";
import { Icon } from "@/components/ui/Icon";

type CodeBlockProps = {
  code: string;
  language: string;
  streaming: boolean;
};

function diffLineClass(line: string): string {
  if (line.startsWith("+")) return "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]";
  if (line.startsWith("-")) return "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]";
  if (line.startsWith("@@")) return "text-muted";
  return "";
}

function CodeBlockBase({ code, language, streaming }: CodeBlockProps) {
  const [lines, setLines] = useState<HighlightLine[] | null>(null);
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const label = language.trim().length > 0 ? language.trim() : "teks";
  const isDiff = label.toLowerCase() === "diff" || label.toLowerCase() === "patch";

  const onCopy = async () => {
    const success = await copyText(code);
    setCopied(success ? "ok" : "fail");
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied("idle"), 1500);
  };

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
    <div className="group my-3 overflow-hidden rounded border border-line bg-code">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-faint">{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWrap((value) => !value)}
            aria-pressed={wrap}
            aria-label={wrap ? "Matikan word wrap" : "Aktifkan word wrap"}
            title={wrap ? "Matikan word wrap" : "Aktifkan word wrap"}
            className="rounded p-1 text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <Icon name="wrap" />
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={streaming}
            aria-label="Salin kode"
            title="Salin kode"
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <Icon name={copied === "ok" ? "check" : "copy"} size={13} />
            <span>{copied === "ok" ? "Tersalin" : copied === "fail" ? "Gagal" : "Salin"}</span>
          </button>
        </div>
      </div>

      <pre
        className={`m-0 px-3 py-2.5 font-mono text-[12.5px] leading-[1.6] ${
          wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto"
        }`}
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
    </div>
  );
}

export const CodeBlock = memo(CodeBlockBase);
