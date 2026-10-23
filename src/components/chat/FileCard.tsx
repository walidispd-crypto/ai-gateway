"use client";

import type { ParsedFile } from "@/lib/file-blocks";
import { countLines, languageBadge } from "@/lib/file-blocks";
import { Icon } from "@/components/ui/Icon";

/**
 * Compact replacement for a full file inside the bubble: the panel owns the content so answers
 * with several files stay readable.
 */
export function FileCard({
  file,
  streaming,
  onOpen,
}: {
  file: ParsedFile;
  streaming: boolean;
  onOpen: () => void;
}) {
  const lines = countLines(file.content);
  const badge = languageBadge(file.name, file.language);
  const writing = !file.complete;

  return (
    <div className="my-2 flex flex-wrap items-center gap-2 rounded border border-line bg-surface px-3 py-2">
      <Icon name="file" size={15} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{file.name}</span>
      <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-faint">
        {badge}
      </span>
      <span className="text-[11px] text-faint">
        {lines} baris
        {writing ? (streaming ? " · menulis…" : " · belum selesai") : ""}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="rounded border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        Buka
      </button>
    </div>
  );
}
