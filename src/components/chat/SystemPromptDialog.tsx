"use client";

import { useEffect, useRef, useState } from "react";
import {
  SYSTEM_PRESETS,
  presetIdForPrompt,
  presetPrompt,
  type SystemPresetId,
} from "@/config/prompts";

export function SystemPromptDialog({
  open,
  value,
  onClose,
  onSave,
}: {
  open: boolean;
  value: string;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setDraft(value);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, value]);

  const activePreset = presetIdForPrompt(draft);

  function choosePreset(id: SystemPresetId) {
    if (id === "custom") return;
    setDraft(presetPrompt(id) ?? "");
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="system-dialog-title"
      className="w-[min(42rem,calc(100vw-2rem))] rounded border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    >
      <form
        method="dialog"
        className="p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
          onClose();
        }}
      >
        <h2 id="system-dialog-title" className="text-sm font-semibold">
          System prompt
        </h2>
        <p className="mt-1 text-xs text-muted">
          Berlaku untuk percakapan ini. Preset mengisi teks; kamu bisa mengubahnya bebas.
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {SYSTEM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => choosePreset(preset.id)}
              aria-pressed={activePreset === preset.id}
              className="rounded border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:text-ink aria-pressed:border-accent aria-pressed:text-accent"
            >
              {preset.label}
            </button>
          ))}
          <span
            className="rounded border border-transparent px-2 py-1 text-xs text-faint"
            aria-live="polite"
          >
            {activePreset === "custom" ? "Kustom" : ""}
          </span>
        </div>

        <label htmlFor="system-prompt" className="mb-1.5 mt-4 block text-xs font-medium">
          Teks
        </label>
        <textarea
          id="system-prompt"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={10}
          className="max-h-[45vh] w-full resize-y rounded border border-line bg-canvas p-2.5 font-mono text-[13px] leading-relaxed outline-none focus-visible:border-accent"
          placeholder="Kosongkan untuk mengirim tanpa system prompt."
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2.5 py-1.5 text-xs text-muted hover:bg-raised hover:text-ink"
          >
            Batal
          </button>
          <button
            type="submit"
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink"
          >
            Simpan
          </button>
        </div>
      </form>
    </dialog>
  );
}
