"use client";

import { useEffect, useRef, useState } from "react";
import type { ConversationFile, OpenFileTarget } from "@/lib/file-blocks";
import { buildPreviewDocument, previewKindFor } from "@/lib/file-blocks";
import { copyText } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/download";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { CodeLines } from "@/components/chat/CodeLines";
import { Icon } from "@/components/ui/Icon";

type FilePanelProps = {
  open: boolean;
  files: ConversationFile[];
  activeName: string | null;
  focusTarget: OpenFileTarget | null;
  isStreaming: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
};

export function FilePanel({
  open,
  files,
  activeName,
  focusTarget,
  isStreaming,
  onSelect,
  onClose,
}: FilePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"code" | "preview">("code");
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = files.find((file) => file.name === activeName) ?? files[0] ?? null;
  const latestIndex = active ? active.versions.length - 1 : 0;
  const versionIndex = active
    ? Math.min(picked[active.name] ?? latestIndex, Math.max(0, latestIndex))
    : 0;
  const version = active?.versions[versionIndex] ?? null;
  const kind = active ? previewKindFor(active.name, version?.language ?? active.language) : null;

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  // Clicking a card in the bubble opens that exact revision, not just the newest one.
  useEffect(() => {
    if (!focusTarget) return;
    const file = files.find((item) => item.name === focusTarget.name);
    if (!file) return;
    const index = file.versions.findIndex(
      (item) =>
        item.messageId === focusTarget.messageId && item.blockIndex === focusTarget.blockIndex,
    );
    if (index < 0) return;
    setPicked((current) =>
      current[file.name] === index ? current : { ...current, [file.name]: index },
    );
  }, [focusTarget, files]);

  useEffect(() => {
    setView(kind === "html" || kind === "svg" ? "code" : "preview");
  }, [active?.name, kind]);

  if (!open) return null;

  const inProgress = version !== null && !version.complete;

  async function onCopy() {
    if (!version) return;
    const success = await copyText(version.content);
    setCopied(success);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  function onDownload() {
    if (!active || !version) return;
    downloadTextFile(active.name, version.content);
  }

  return (
    <section
      aria-label="Panel file"
      className={`fixed inset-0 z-40 flex min-h-0 flex-col border-line bg-canvas lg:static lg:z-auto lg:shrink-0 lg:border-l ${
        expanded ? "lg:w-[68%]" : "lg:w-[44%] lg:max-w-[640px]"
      }`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
        <Icon name="file" size={15} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">
          {active?.name ?? "Belum ada file"}
        </span>
        {active ? (
          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-faint">
            {active.badge}
          </span>
        ) : null}
        {inProgress ? (
          <span className="text-[11px] text-accent">
            {isStreaming ? "menulis…" : "belum selesai"}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={onCopy}
            disabled={!version}
            aria-label="Salin isi file"
            title="Salin isi file"
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <Icon name={copied ? "check" : "copy"} size={13} />
            <span className="hidden sm:inline">{copied ? "Tersalin" : "Salin"}</span>
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={!version}
            aria-label="Unduh file"
            title="Unduh file"
            className="rounded p-1 text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <Icon name="download" size={14} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-pressed={expanded}
            aria-label={expanded ? "Kecilkan panel file" : "Perluas panel file"}
            title={expanded ? "Kecilkan" : "Perluas"}
            className="hidden rounded p-1 text-muted transition-colors hover:bg-raised hover:text-ink lg:block"
          >
            <Icon name={expanded ? "shrink" : "expand"} size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel file"
            title="Tutup"
            className="rounded p-1 text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </header>

      {files.length > 1 ? (
        <div
          role="tablist"
          aria-label="File dalam percakapan"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-1"
        >
          {files.map((file) => {
            const selected = file.name === active?.name;
            return (
              <button
                key={file.name}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(file.name)}
                className={`shrink-0 rounded px-2 py-1 font-mono text-[11px] transition-colors ${
                  selected ? "bg-raised text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {file.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {active && active.versions.length > 1 ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 py-1 text-[11px] text-faint">
          <label htmlFor="file-version" className="shrink-0">
            Versi
          </label>
          <select
            id="file-version"
            value={versionIndex}
            onChange={(event) =>
              setPicked((current) => ({ ...current, [active.name]: Number(event.target.value) }))
            }
            className="rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink"
          >
            {active.versions.map((item, index) => (
              <option key={`${item.messageId}-${item.blockIndex}`} value={index}>
                v{index + 1} · {item.lineCount} baris
              </option>
            ))}
          </select>
          {versionIndex < latestIndex ? (
            <span>Versi lama. Terbaru v{latestIndex + 1}.</span>
          ) : (
            <span>Terbaru</span>
          )}
        </div>
      ) : null}

      {kind === "html" || kind === "svg" ? (
        <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1">
          <button
            type="button"
            onClick={() => setView("code")}
            aria-pressed={view === "code"}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted transition-colors hover:text-ink aria-pressed:bg-raised aria-pressed:text-ink"
          >
            <Icon name="code" size={13} /> Kode
          </button>
          <button
            type="button"
            onClick={() => setView("preview")}
            aria-pressed={view === "preview"}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted transition-colors hover:text-ink aria-pressed:bg-raised aria-pressed:text-ink"
          >
            <Icon name="eye" size={13} /> Pratinjau
          </button>
        </div>
      ) : null}

      {!version ? (
        <p className="p-4 text-sm text-muted">Belum ada file di percakapan ini.</p>
      ) : kind === "markdown" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="prose-chat px-4 py-3">
            <MarkdownMessage content={version.content} />
          </div>
        </div>
      ) : kind !== null && view === "preview" ? (
        <div className="min-h-0 flex-1 bg-white">
          <iframe
            title={`Pratinjau ${active?.name ?? "file"}`}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={buildPreviewDocument(version.content, kind)}
            className="h-full w-full border-0"
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <CodeLines
            code={version.content}
            language={version.language}
            streaming={inProgress && isStreaming}
            className="p-3"
          />
        </div>
      )}
    </section>
  );
}
