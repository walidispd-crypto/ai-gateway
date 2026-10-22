"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_TITLE } from "@/lib/chat-types";
import { useChatStore } from "@/lib/chat-store";
import { ImportError, downloadConversationsJson, parseImportFile } from "@/lib/export-import";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon } from "@/components/ui/Icon";

export function Sidebar({
  open,
  collapsed,
  onClose,
  onNewConversation,
}: {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onNewConversation: () => void;
}) {
  const router = useRouter();
  const conversations = useChatStore((state) => state.conversations);
  const activeId = useChatStore((state) => state.activeId);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const renameConversation = useChatStore((state) => state.renameConversation);
  const importConversations = useChatStore((state) => state.importConversations);

  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? conversations.filter((conversation) =>
        conversation.title.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : conversations;

  function select(id: string) {
    selectConversation(id);
    onClose();
  }

  function startRename(id: string, title: string) {
    setEditingId(id);
    setDraftTitle(title);
  }

  function commitRename() {
    if (!editingId) return;
    renameConversation(editingId, draftTitle);
    setEditingId(null);
  }

  function confirmDelete(id: string, title: string) {
    if (window.confirm(`Hapus percakapan "${title}"? Tindakan ini tidak bisa dibatalkan.`)) {
      deleteConversation(id);
    }
  }

  async function onImportFile(file: File) {
    setBusy(true);
    setImportError(null);
    try {
      const imported = await parseImportFile(file);
      importConversations(imported);
      onClose();
    } catch (cause) {
      setImportError(cause instanceof ImportError ? cause.message : "Gagal mengimpor file.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // Even if the request fails, sending the user to the login page is the safe default.
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-black/40 lg:hidden ${open ? "" : "hidden"}`}
      />
      <aside
        aria-label="Riwayat percakapan"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-surface transition-transform duration-150 lg:static lg:z-auto lg:w-64 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:hidden" : ""}`}
      >
        <div className="flex items-center gap-1 px-2 py-2.5">
          <p className="flex-1 px-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
            Percakapan
          </p>
          <button
            type="button"
            onClick={onNewConversation}
            aria-label="Percakapan baru"
            title="Percakapan baru (Ctrl/⌘K)"
            className="rounded p-1.5 text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <Icon name="plus" size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup riwayat"
            className="rounded p-1.5 text-muted hover:bg-raised hover:text-ink lg:hidden"
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="px-2 pb-2">
          <div className="relative">
            <Icon
              name="search"
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari judul"
              aria-label="Cari percakapan berdasarkan judul"
              className="w-full rounded border border-line bg-canvas py-1.5 pl-7 pr-2 text-xs outline-none placeholder:text-faint focus-visible:border-accent"
            />
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.length === 0 ? (
            <p className="px-1.5 py-2 text-xs text-faint">
              {conversations.length === 0 ? "Belum ada percakapan." : "Tidak ada judul yang cocok."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((conversation) => {
                const isActive = conversation.id === activeId;
                const isEditing = conversation.id === editingId;
                return (
                  <li key={conversation.id} className="group relative">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitRename();
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        aria-label="Nama percakapan"
                        className="w-full rounded border border-accent bg-canvas px-2 py-1.5 text-[13px] outline-none"
                      />
                    ) : (
                      <div
                        className={`flex items-center rounded ${
                          isActive ? "bg-raised" : "hover:bg-raised/70"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => select(conversation.id)}
                          onDoubleClick={() => startRename(conversation.id, conversation.title)}
                          aria-current={isActive ? "page" : undefined}
                          className={`min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-[13px] ${
                            isActive ? "text-ink" : "text-muted"
                          }`}
                        >
                          {conversation.title === DEFAULT_TITLE ? (
                            <span className="text-faint">Percakapan baru</span>
                          ) : (
                            conversation.title
                          )}
                        </button>
                        <div className="flex items-center pr-1 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => startRename(conversation.id, conversation.title)}
                            aria-label={`Ubah nama ${conversation.title}`}
                            title="Ubah nama"
                            className="rounded p-1 text-faint hover:text-ink"
                          >
                            <Icon name="pencil" size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDelete(conversation.id, conversation.title)}
                            aria-label={`Hapus ${conversation.title}`}
                            title="Hapus"
                            className="rounded p-1 text-faint hover:text-danger"
                          >
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <div className="border-t border-line px-2 py-2">
          {importError ? (
            <p role="alert" className="mb-1.5 px-1 text-[11px] text-danger">
              {importError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => downloadConversationsJson(conversations)}
              disabled={conversations.length === 0}
              className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
            >
              <Icon name="download" size={13} />
              Ekspor
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
            >
              <Icon name="upload" size={13} />
              Impor
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onImportFile(file);
                event.target.value = "";
              }}
            />
          </div>

          <div className="mt-1 flex items-center justify-between">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <Icon name="logout" size={13} />
              Keluar
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
