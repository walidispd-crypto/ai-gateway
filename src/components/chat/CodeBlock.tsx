"use client";

import { memo, useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { CodeLines } from "@/components/chat/CodeLines";
import { Icon } from "@/components/ui/Icon";

type CodeBlockProps = {
  code: string;
  language: string;
  streaming: boolean;
};

function CodeBlockBase({ code, language, streaming }: CodeBlockProps) {
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const label = language.trim().length > 0 ? language.trim() : "teks";

  const onCopy = async () => {
    const success = await copyText(code);
    setCopied(success ? "ok" : "fail");
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied("idle"), 1500);
  };

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

      <CodeLines
        code={code}
        language={language}
        streaming={streaming}
        wrap={wrap}
        className="px-3 py-2.5"
      />
    </div>
  );
}

export const CodeBlock = memo(CodeBlockBase);
