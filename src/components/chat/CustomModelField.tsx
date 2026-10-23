"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PublicModel } from "@/config/models";
import {
  MAX_MODEL_NAME_LENGTH,
  MODEL_NAME_HINT,
  isValidModelName,
  normalizeModelName,
} from "@/lib/model-name";
import type { ModelSuggestions } from "@/lib/model-suggestions";
import { Icon } from "@/components/ui/Icon";

type CustomModelFieldProps = {
  providerId: string;
  providerLabel: string;
  value: string | undefined;
  providers: PublicModel[];
  suggestions: ModelSuggestions;
  disabled: boolean;
  onSave: (name: string) => void;
  onReset: () => void;
  onDeleteSuggestion: (providerId: string, name: string) => void;
};

export function CustomModelField({
  providerId,
  providerLabel,
  value,
  providers,
  suggestions,
  disabled,
  onSave,
  onReset,
  onDeleteSuggestion,
}: CustomModelFieldProps) {
  const inputId = useId();
  const panelId = useId();
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const provider = providers.find((item) => item.id === providerId);
  const supportsCustom = provider?.supportsCustomModel ?? false;
  const inactive = disabled || !supportsCustom;

  useEffect(() => {
    setDraft(value ?? "");
    setError(null);
  }, [value, providerId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function submit() {
    const name = normalizeModelName(draft);
    if (!isValidModelName(name)) {
      setError(MODEL_NAME_HINT);
      return;
    }
    setError(null);
    setOpen(false);
    onSave(name);
  }

  function reset() {
    setDraft("");
    setError(null);
    setOpen(false);
    onReset();
  }

  // Providers that dropped out of the registry may still have saved names worth keeping.
  const groups = [
    ...providers.map((item) => ({ id: item.id, label: item.label })),
    ...Object.keys(suggestions)
      .filter((id) => !providers.some((item) => item.id === id))
      .map((id) => ({ id, label: id })),
  ].filter((group) => (suggestions[group.id] ?? []).length > 0);

  const hint = supportsCustom
    ? value
      ? `Nama model aktif: ${value}`
      : "Kosong = pakai default penyedia"
    : "Penyedia ini tidak mendukung nama model kustom (format non-OpenAI).";

  return (
    <div ref={containerRef} className="relative flex w-full min-w-0 items-center gap-1 sm:w-auto">
      <label htmlFor={inputId} className="sr-only">
        Nama model untuk {providerLabel}
      </label>
      <input
        id={inputId}
        type="text"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!inactive) submit();
          }
        }}
        placeholder="claude-opus-5"
        maxLength={MAX_MODEL_NAME_LENGTH}
        disabled={inactive}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        title={hint}
        className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 font-mono text-[12px] text-ink outline-none placeholder:font-sans placeholder:text-faint focus-visible:border-accent disabled:opacity-50 sm:w-40 sm:flex-none"
      />

      <button
        type="button"
        onClick={submit}
        disabled={inactive}
        className="rounded border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-40"
      >
        Simpan
      </button>
      <button
        type="button"
        onClick={reset}
        disabled={inactive || !value}
        aria-label={`Reset nama model ke default ${providerLabel}`}
        className="rounded border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-40"
      >
        Reset
      </button>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={inactive}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Saran nama model"
        title="Saran nama model yang pernah disimpan"
        className="rounded border border-line p-1 text-muted transition-colors hover:text-ink disabled:opacity-40"
      >
        <Icon name="chevron-down" size={12} />
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label="Saran nama model"
          className="absolute right-0 top-full z-30 mt-1 max-h-64 w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded border border-line bg-surface p-1 text-[12px] shadow-sm"
        >
          {groups.length === 0 ? (
            <p className="px-2 py-1.5 text-faint">Belum ada nama model tersimpan.</p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="py-0.5">
                <p className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-faint">
                  {group.label}
                </p>
                <ul>
                  {(suggestions[group.id] ?? []).map((name) => {
                    const active = group.id === providerId && name === value;
                    return (
                      <li key={name} className="flex items-center rounded hover:bg-raised">
                        <button
                          type="button"
                          onClick={() => {
                            setDraft(name);
                            setError(null);
                            setOpen(false);
                            if (group.id === providerId) onSave(name);
                          }}
                          className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left font-mono text-[11.5px] text-ink"
                          aria-current={active ? "true" : undefined}
                        >
                          {name}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSuggestion(group.id, name)}
                          aria-label={`Hapus saran ${name}`}
                          className="rounded p-1 text-faint hover:text-danger"
                        >
                          <Icon name="close" size={11} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      ) : null}

      {error ? (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="absolute right-0 top-full z-20 mt-1 w-64 rounded border border-line bg-surface px-2 py-1 text-[11px] text-danger shadow-sm"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
