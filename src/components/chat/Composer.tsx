"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Conversation } from "@/lib/chat-types";
import { conversationCharCount, estimateTokens } from "@/lib/text";
import { defaultContextLimit } from "@/lib/context";
import { MAX_ATTACHMENTS } from "@/lib/attachments";
import type { AttachmentsController } from "@/lib/use-attachments";
import type { ChatController } from "@/lib/use-chat";
import { useModels } from "@/components/chat/models-context";
import { Icon } from "@/components/ui/Icon";

const MAX_TEXTAREA_HEIGHT = 220;

function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

export function Composer({
  conversation,
  controller,
  attachments,
  onSend,
}: {
  conversation: Conversation | null;
  controller: ChatController;
  attachments: AttachmentsController;
  onSend: (text: string) => void;
}) {
  const models = useModels();
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [draft]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (window.matchMedia("(min-width: 1024px)").matches) {
      textareaRef.current?.focus();
    }
  }, [conversation?.id]);

  const model = models.find((item) => item.id === conversation?.modelId);
  const limit = defaultContextLimit(model?.maxContextChars);
  const attachedChars = attachments.files.reduce((sum, file) => sum + file.content.length, 0);
  const usedChars =
    conversationCharCount(conversation?.messages ?? [], conversation?.system) +
    draft.length +
    attachedChars;
  const nearLimit = usedChars / limit >= 0.8;

  const canSend =
    !controller.isStreaming && (draft.trim().length > 0 || attachments.files.length > 0);
  const canAttach = attachments.files.length < MAX_ATTACHMENTS && !controller.isStreaming;

  function submit() {
    if (!canSend) return;
    onSend(draft);
    setDraft("");
    attachments.clear();
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.focus();
    }
  }

  return (
    <div className="border-t border-line bg-canvas px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 sm:px-5">
      <div className="mx-auto max-w-prose">
        {controller.trimNotice ? (
          <div className="mb-2 flex items-start gap-2 rounded border border-line bg-raised px-2.5 py-1.5 text-[12px] text-muted">
            <Icon name="alert" size={13} className="mt-0.5 shrink-0 text-warn" />
            <p className="flex-1">{controller.trimNotice}</p>
            <button
              type="button"
              onClick={controller.dismissTrimNotice}
              aria-label="Tutup pemberitahuan konteks"
              className="rounded p-0.5 text-faint hover:text-ink"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ) : null}

        {attachments.files.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {attachments.files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-1.5 rounded border border-line bg-surface py-1 pl-2 pr-1 text-[11px] text-muted"
              >
                <span className="max-w-[14rem] truncate font-mono">{file.name}</span>
                <span className="text-faint">{formatCount(file.content.length)} c</span>
                <button
                  type="button"
                  onClick={() => attachments.removeFile(file.id)}
                  aria-label={`Hapus lampiran ${file.name}`}
                  className="rounded p-0.5 text-faint hover:text-ink"
                >
                  <Icon name="close" size={11} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {attachments.error ? (
          <div className="mb-2 flex items-start gap-2 text-[12px] text-danger" role="alert">
            <p className="flex-1">{attachments.error}</p>
            <button
              type="button"
              onClick={attachments.dismissError}
              aria-label="Tutup pesan lampiran"
              className="rounded p-0.5 text-faint hover:text-ink"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ) : null}

        <div className="rounded border border-line bg-surface transition-colors focus-within:border-accent">
          <label htmlFor="composer" className="sr-only">
            Pesan
          </label>
          <textarea
            id="composer"
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Tanya, tempel kode, atau lampirkan file…"
            className="block max-h-[220px] w-full resize-none bg-transparent px-3 pt-2.5 text-[15px] leading-relaxed outline-none placeholder:text-faint"
          />

          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) void attachments.addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canAttach}
              aria-label="Lampirkan file teks"
              title="Lampirkan file teks (maks 200 KB)"
              className="rounded p-1.5 text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
            >
              <Icon name="paperclip" size={15} />
            </button>

            <span
              className={`ml-1 text-[11px] tabular-nums ${nearLimit ? "text-warn" : "text-faint"}`}
              title="Perkiraan pemakaian konteks (karakter dan token kasar)"
            >
              {formatCount(usedChars)} / {formatCount(limit)} char · ~
              {formatCount(estimateTokens(usedChars))} token
            </span>

            <div className="ml-auto flex items-center gap-1">
              {controller.isStreaming ? (
                <button
                  type="button"
                  onClick={controller.stop}
                  className="flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs text-ink transition-colors hover:bg-raised"
                >
                  <Icon name="stop" size={12} />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSend}
                  aria-label="Kirim pesan"
                  title="Kirim (Enter)"
                  className="flex items-center gap-1.5 rounded bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Icon name="send" size={13} />
                  Kirim
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-1.5 hidden justify-between text-[11px] text-faint sm:flex">
          <span>Enter kirim · Shift+Enter baris baru</span>
          <span>Ctrl/⌘K percakapan baru · Esc stop</span>
        </div>
      </div>
    </div>
  );
}
