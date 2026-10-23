"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat-types";
import { copyText } from "@/lib/clipboard";
import { parseMessageBlocksCached, type OpenFileTarget } from "@/lib/file-blocks";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { FileCard } from "@/components/chat/FileCard";
import { Icon } from "@/components/ui/Icon";

type MessageItemProps = {
  message: ChatMessage;
  isLast: boolean;
  isLastUser: boolean;
  isStreaming: boolean;
  onRegenerate: (messageId: string) => void;
  onContinue: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onOpenFile: (target: OpenFileTarget) => void;
};

function ActionButton({
  label,
  icon,
  onClick,
  children,
  disabled,
}: {
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  onClick: () => void;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
    >
      <Icon name={icon} size={13} />
      {children ? <span>{children}</span> : null}
    </button>
  );
}

function MessageItemBase({
  message,
  isLast,
  isLastUser,
  isStreaming,
  onRegenerate,
  onContinue,
  onEdit,
  onDelete,
  onOpenFile,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (editing) {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 360)}px`;
    }
  }, [editing]);

  const isUser = message.role === "user";
  const isActiveStream = message.status === "streaming";
  const roleLabel = isUser ? "Kamu" : (message.modelLabel ?? "Asisten");
  // Shown only when the server reported which model actually answered, so the owner can tell
  // a custom name from the provider default (and see the fallback's own model).
  const modelName = !isUser ? message.modelName : undefined;
  const canCopy = message.content.trim().length > 0;

  // Files are derived from the text on every render; nothing is added to the stored message.
  const blocks = useMemo(
    () => (isUser ? null : parseMessageBlocksCached(message.id, message.content, isActiveStream)),
    [isUser, message.id, message.content, isActiveStream],
  );

  async function onCopy() {
    if (!canCopy) return;
    const success = await copyText(message.content);
    setCopied(success);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  function startEditing() {
    setDraft(message.content);
    setEditing(true);
  }

  function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    setEditing(false);
    onEdit(message.id, trimmed);
  }

  const actionBar = (
    <div className="mt-1.5 flex flex-wrap items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
      {canCopy ? (
        <ActionButton label="Salin pesan" icon={copied ? "check" : "copy"} onClick={onCopy}>
          {copied ? "Tersalin" : "Salin"}
        </ActionButton>
      ) : null}

      {isUser && isLastUser && !isStreaming ? (
        <ActionButton label="Edit pesan" icon="pencil" onClick={startEditing}>
          Edit
        </ActionButton>
      ) : null}

      {!isUser && isLast && !isStreaming ? (
        <ActionButton
          label="Buat ulang jawaban"
          icon="refresh"
          onClick={() => onRegenerate(message.id)}
        >
          Ulangi
        </ActionButton>
      ) : null}

      {!isUser &&
      (message.status === "interrupted" || message.status === "error") &&
      canCopy &&
      !isStreaming ? (
        <ActionButton label="Lanjutkan jawaban" icon="play" onClick={() => onContinue(message.id)}>
          Lanjutkan
        </ActionButton>
      ) : null}

      {!isActiveStream ? (
        <ActionButton label="Hapus pesan" icon="trash" onClick={() => onDelete(message.id)} />
      ) : null}
    </div>
  );

  return (
    <article className="group py-3" aria-busy={isActiveStream || undefined}>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
        <span className="font-medium uppercase tracking-wide text-faint">{roleLabel}</span>
        {modelName ? (
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
            · {modelName}
          </span>
        ) : null}
        {message.fallbackFromLabel ? (
          <span className="text-faint">dialihkan dari {message.fallbackFromLabel}</span>
        ) : null}
      </div>

      {editing ? (
        <div className="rounded border border-line bg-surface p-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Edit pesan"
            className="max-h-[360px] w-full resize-y bg-transparent p-1 font-sans text-[15px] leading-relaxed outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded px-2 py-1 text-xs text-muted hover:bg-raised hover:text-ink"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={draft.trim().length === 0}
              className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink disabled:opacity-50"
            >
              Simpan & kirim
            </button>
          </div>
        </div>
      ) : isUser ? (
        <div className="rounded border border-line bg-surface px-3.5 py-2.5">
          <MarkdownMessage content={message.content} />
        </div>
      ) : message.content.length === 0 && isActiveStream ? (
        <p className="text-sm text-faint">
          <span className="stream-caret" aria-hidden="true" /> Menunggu jawaban…
        </p>
      ) : (
        <div>
          {(blocks ?? []).map((block, index) =>
            block.kind === "text" ? (
              <MarkdownMessage
                key={`text-${index}`}
                content={block.text}
                streaming={isActiveStream && index === (blocks?.length ?? 0) - 1}
              />
            ) : (
              <FileCard
                key={`file-${block.file.index}`}
                file={block.file}
                streaming={isActiveStream}
                onOpen={() =>
                  onOpenFile({
                    name: block.file.name,
                    messageId: message.id,
                    blockIndex: block.file.index,
                  })
                }
              />
            ),
          )}
        </div>
      )}

      {!editing && (message.status === "error" || message.status === "interrupted") ? (
        <div
          role={message.status === "error" ? "alert" : undefined}
          className="mt-2 rounded border border-line bg-raised px-3 py-2 text-[13px] text-muted"
        >
          <div className="flex items-start gap-2">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-warn" />
            <div>
              <p>
                {message.status === "error" ? "Jawaban gagal" : "Jawaban terputus"}
                {message.error ? `: ${message.error}` : "."}
              </p>
              {message.content.trim().length > 0 ? (
                <p className="mt-1 text-faint">Teks yang sudah diterima tetap disimpan.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {!editing ? actionBar : null}
    </article>
  );
}

export const MessageItem = memo(MessageItemBase);
