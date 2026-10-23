import { act } from "./setup-dom";
import assert from "node:assert/strict";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ModelRegistryProvider } from "@/components/chat/models-context";
import { useActiveConversation, useChatStore } from "@/lib/chat-store";
import { useChat } from "@/lib/use-chat";
import { useAttachments } from "@/lib/use-attachments";
import {
  downloadConversationMarkdown,
  downloadConversationsJson,
  parseImportFile,
} from "@/lib/export-import";
import { flushSave, loadChatState, scheduleSave } from "@/lib/chat-storage";
import { MODEL_NAME_HINT } from "@/lib/model-name";
import { loadModelSuggestions } from "@/lib/model-suggestions";
import { loadFilePanelState } from "@/lib/file-panel-state";
import { useFilePanelState } from "@/lib/use-file-panel";
import { buildPreviewDocument, parseMessageBlocks, sanitizeFileName } from "@/lib/file-blocks";
import { presetIdForPrompt, presetPrompt } from "@/config/prompts";
import type { Conversation } from "@/lib/chat-types";

const encoder = new TextEncoder();
const models = [
  {
    id: "coder-fast",
    label: "Coder Fast",
    description: "Cepat",
    tags: ["code" as const],
    maxContextChars: 48_000,
    supportsCustomModel: true,
  },
  {
    id: "general",
    label: "General",
    description: "Umum",
    tags: ["general" as const],
    maxContextChars: 24_000,
    supportsCustomModel: true,
  },
  {
    id: "plain",
    label: "Plain",
    description: "Format non-OpenAI",
    tags: ["general" as const],
    maxContextChars: 24_000,
    supportsCustomModel: false,
  },
];

function Harness() {
  const conversation = useActiveConversation();
  const controller = useChat({
    models,
    defaultModelId: "coder-fast",
    defaultSystem: "Kamu asisten coding.",
  });
  const attachments = useAttachments();
  useEffect(() => {
    useChatStore.getState().hydrate([], null);
    useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
  }, []);
  return (
    <ChatPanel
      conversation={conversation}
      controller={controller}
      attachments={attachments}
      onToggleSidebar={() => {}}
      onSend={(text) => void controller.send(text, attachments.files)}
    />
  );
}

type Line = Record<string, unknown>;
type Scenario =
  | "success"
  | "error"
  | "stall"
  | "long"
  | "files"
  | "filesStop"
  | "version1"
  | "version2"
  | "tagLike"
  | "longFence"
  | "htmlFile";
let scenario: Scenario = "success";
let lastBody: {
  messages: { role: string; content: string }[];
  system?: string;
  customModel?: string;
} | null = null;

function respond(lines: Line[], { stallAt }: { stallAt?: number } = {}) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines.slice(0, stallAt ?? lines.length)) {
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      }
      if (stallAt === undefined) controller.close();
    },
  });
}

/** Emits the lines and keeps the stream open until the client aborts (Stop button). */
function stallStream(lines: Line[], signal?: AbortSignal | null) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      signal?.addEventListener("abort", () => {
        try {
          controller.error(new DOMException("Aborted", "AbortError"));
        } catch {
          // stream already closed
        }
      });
    },
  });
}

const META: Line = { type: "meta", modelId: "coder-fast", modelLabel: "Coder Fast" };

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!String(input).endsWith("/api/chat")) return new Response("{}", { status: 200 });
  lastBody = JSON.parse(String(init?.body));

  if (scenario === "files") {
    return new Response(
      respond([
        META,
        { type: "delta", text: "Dua file berikut.\n\n" },
        { type: "delta", text: 'Dir "src".\n<file name="src/a.ts" lang="ts">\n' },
        { type: "delta", text: "export const a = 1;\n" },
        { type: "delta", text: "</file>\n\n" },
        { type: "delta", text: '<file name="b.md" lang="md">\n# Judul\n\nIsi.\n</file>\n' },
        { type: "done" },
      ]),
      { status: 200 },
    );
  }

  if (scenario === "filesStop") {
    return new Response(
      stallStream(
        [
          META,
          { type: "delta", text: "Menulis file.\n<file na" },
          { type: "delta", text: 'me="stopped.ts" lang="ts">\nexport const part = 1;\n' },
        ],
        init?.signal,
      ),
      { status: 200 },
    );
  }

  if (scenario === "version1" || scenario === "version2") {
    const version = scenario === "version1" ? 1 : 2;
    return new Response(
      respond([
        META,
        { type: "delta", text: `Versi ${version}.\n<file name="app.ts" lang="ts">\n` },
        { type: "delta", text: `export const value = ${version};\n</file>\n` },
        { type: "done" },
      ]),
      { status: 200 },
    );
  }

  if (scenario === "tagLike") {
    return new Response(
      respond([
        META,
        {
          type: "delta",
          text: 'Format yang dipakai:\n\n```md\n<file name="contoh.ts">\n</file>\n```\n\nSekarang filenya.\n',
        },
        {
          type: "delta",
          text: '<file name="real.ts" lang="ts">\nconst tags = "<files> <filename>";\nconst raw = "<file name=\'x\'>";\n</file>\n',
        },
        { type: "done" },
      ]),
      { status: 200 },
    );
  }

  if (scenario === "htmlFile") {
    return new Response(
      respond([
        META,
        {
          type: "delta",
          text: '<file name="page.html" lang="html">\n<h1>Halo</h1><script>alert(1)</script>\n</file>\n',
        },
      ]),
      { status: 200 },
    );
  }

  if (scenario === "longFence") {
    let body = "```ts models.ts\n";
    for (let line = 0; line < 45; line += 1) body += `const row${line} = read(${line});\n`;
    body += "```\n";
    return new Response(respond([META, { type: "delta", text: "Pakai ini:\n" + body }]), {
      status: 200,
    });
  }

  if (scenario === "success") {
    return new Response(
      respond([
        {
          type: "meta",
          modelId: "coder-fast",
          modelLabel: "Coder Fast",
          modelName: lastBody?.customModel ?? "gpt-5.6-luna",
        },
        { type: "delta", text: "Berikut contohnya.\n\n```ts\n" },
        {
          type: "delta",
          text: "export function add(a: number, b: number) {\n  return a + b;\n}\n```\n",
        },
        { type: "done" },
      ]),
      { status: 200 },
    );
  }

  if (scenario === "long") {
    const blocks: Line[] = [{ type: "meta", modelId: "coder-fast", modelLabel: "Coder Fast" }];
    blocks.push({ type: "delta", text: "# Jawaban panjang\n\n" });
    for (let block = 0; block < 12; block += 1) {
      let section = `\n## Bagian ${block + 1}\n\nPenjelasan bagian ${block + 1}.\n\n\`\`\`ts\n`;
      for (let line = 0; line < 40; line += 1) {
        section += `const value${block}_${line} = compute(${block}, ${line});\n`;
      }
      section += "\`\`\`\n";
      blocks.push({ type: "delta", text: section });
    }
    blocks.push({ type: "done" });
    return new Response(respond(blocks), { status: 200 });
  }

  if (scenario === "error") {
    return new Response(
      respond([
        { type: "meta", modelId: "coder-fast", modelLabel: "Coder Fast" },
        { type: "delta", text: "Potongan awal" },
        { type: "error", message: "Coder Fast menolak permintaan (HTTP 500).", code: "upstream" },
      ]),
      { status: 200 },
    );
  }

  // stall: emit one delta, then keep the stream open until the client aborts.
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: "meta", modelId: "coder-fast", modelLabel: "Coder Fast" })}\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "delta", text: "Teks separuh jalan" })}\n`),
        );
        init?.signal?.addEventListener("abort", () => {
          try {
            controller.error(new DOMException("Aborted", "AbortError"));
          } catch {
            // stream already closed
          }
        });
      },
    }),
    { status: 200 },
  );
}) as typeof fetch;

const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

let clipboardText = "";
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (text: string) => {
      clipboardText = text;
    },
  },
});

function fileCards(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (element) => element.textContent?.trim() === "Buka",
  );
}

function panelElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[aria-label="Panel file"]');
}

function panelButton(label: string): HTMLButtonElement | undefined {
  return [...(panelElement()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (element) => element.getAttribute("aria-label") === label,
  );
}

async function openFileCard(index: number) {
  const cards = fileCards();
  assert.ok(cards[index], `kartu file #${index + 1} ada`);
  await act(async () => cards[index]!.click());
  await wait(150);
}

function wait(ms: number) {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function send(text: string) {
  const textarea = document.getElementById("composer") as HTMLTextAreaElement;
  await act(async () => setTextareaValue(textarea, text));
  await act(async () => {
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function headerButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("header button")].find((element) =>
    `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""}`.includes(label),
  );
}

function customModelInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    "header input[placeholder='claude-opus-5']",
  );
  assert.ok(input, "input nama model ada di header");
  return input;
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((element) =>
    `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""}`.includes(label),
  );
}

async function main() {
  await act(async () => {
    root.render(
      <ModelRegistryProvider models={models}>
        <Harness />
      </ModelRegistryProvider>,
    );
  });
  await wait(200);

  assert.ok((document.body.textContent ?? "").includes("Percakapan baru"));
  assert.ok((document.body.textContent ?? "").includes("Tanya apa saja"));

  await send("Tolong buat fungsi add");
  await wait(400);

  const after = document.body.textContent ?? "";
  assert.ok(after.includes("Tolong buat fungsi add"), "user message rendered");
  assert.ok(after.includes("Berikut contohnya."), "streamed markdown rendered");
  assert.ok(after.includes("export function add"), "code block rendered");
  assert.ok(after.includes("Coder Fast"), "answering model is shown");
  assert.equal(
    (document.getElementById("composer") as HTMLTextAreaElement).value,
    "",
    "composer cleared",
  );
  assert.deepEqual(lastBody?.messages, [{ role: "user", content: "Tolong buat fungsi add" }]);
  assert.equal(lastBody?.system, "Kamu asisten coding.");
  console.log("ui: mount + send + markdown + code ok");

  await wait(1200);
  const tokens = document.querySelectorAll(".shiki-token");
  assert.ok(tokens.length > 5, `shiki highlighted the block (${tokens.length} tokens)`);
  assert.ok(
    [...document.querySelectorAll("button")].some(
      (b) => b.getAttribute("aria-label") === "Salin kode",
    ),
  );
  console.log("ui: lazy shiki highlight + copy control ok", { tokens: tokens.length });

  console.log("ui: IndexedDB persistence");
  const liveState = useChatStore.getState();
  scheduleSave({ conversations: liveState.conversations, activeId: liveState.activeId });
  flushSave();
  await wait(300);
  const stored = await loadChatState();
  assert.ok(stored, "state was written to IndexedDB");
  const storedConversation = stored!.conversations.find((conversation: Conversation) =>
    conversation.messages.some((message) => message.content.includes("export function add")),
  );
  assert.ok(storedConversation, "messages survive a save → load cycle");
  await act(async () => {
    useChatStore.getState().hydrate(stored!.conversations, stored!.activeId);
  });
  await wait(100);
  assert.ok(
    (document.body.textContent ?? "").includes("Berikut contohnya."),
    "hydrating persisted state re-renders the conversation",
  );
  console.log("ui: persistence reload ok");

  console.log("ui: nama model kustom");
  const storeConversation = () => {
    const state = useChatStore.getState();
    return state.conversations.find((conversation) => conversation.id === state.activeId)!;
  };

  assert.equal(storeConversation().customModel, undefined, "percakapan baru tidak punya override");

  await act(async () => setInputValue(customModelInput(), "claude-opus-5"));
  await act(async () => headerButton("Simpan")!.click());
  await wait(100);
  assert.equal(storeConversation().customModel, "claude-opus-5", "nama tersimpan di percakapan");

  await send("Tes override");
  await wait(400);
  assert.equal(lastBody?.customModel, "claude-opus-5", "override dikirim ke /api/chat");
  const overrideBody = document.body.textContent ?? "";
  assert.ok(overrideBody.includes("· claude-opus-5"), "label balasan memakai nama yang dipakai");

  const suggestionPanel = () =>
    document.querySelector<HTMLElement>('[role="group"][aria-label="Saran nama model"]');
  await act(async () => headerButton("Saran nama model")!.click());
  await wait(50);
  assert.ok(
    suggestionPanel()?.textContent?.includes("Coder Fast"),
    "saran dikelompokkan per penyedia",
  );
  assert.ok(
    suggestionPanel()?.textContent?.includes("claude-opus-5"),
    "nama tersimpan muncul sebagai saran",
  );
  const storedSuggestions = await loadModelSuggestions();
  assert.deepEqual(
    storedSuggestions["coder-fast"],
    ["claude-opus-5"],
    "saran tersimpan di IndexedDB",
  );

  const deleteSuggestion = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Hapus saran claude-opus-5"]',
  );
  assert.ok(deleteSuggestion, "tombol hapus saran tersedia");
  await act(async () => deleteSuggestion!.click());
  await wait(100);
  assert.ok(
    !(suggestionPanel()?.textContent ?? "").includes("claude-opus-5"),
    "saran bisa dihapus satu per satu",
  );
  assert.deepEqual(
    (await loadModelSuggestions())["coder-fast"],
    undefined,
    "menghapus saran terakhir membersihkan entri penyedia",
  );
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

  await act(async () => setInputValue(customModelInput(), "claude opus"));
  await act(async () => headerButton("Simpan")!.click());
  await wait(50);
  const errorAlert = document.querySelector<HTMLElement>('[role="alert"]');
  assert.equal(errorAlert?.textContent, MODEL_NAME_HINT, "nama tidak valid ditolak dengan pesan");
  assert.equal(storeConversation().customModel, "claude-opus-5", "nama lama tidak berubah");

  await act(async () => headerButton("Reset")!.click());
  await wait(50);
  assert.equal(storeConversation().customModel, undefined, "reset menghapus override");
  assert.equal(customModelInput().value, "", "input dikosongkan setelah reset");
  await send("Tes tanpa override");
  await wait(400);
  assert.equal(
    lastBody?.customModel,
    undefined,
    "request tanpa override tidak mengirim customModel",
  );

  await act(async () => setInputValue(customModelInput(), "glm-5.3"));
  await act(async () => headerButton("Simpan")!.click());
  await wait(100);
  const keptState = useChatStore.getState();
  scheduleSave({ conversations: keptState.conversations, activeId: keptState.activeId });
  flushSave();
  await wait(300);
  const reloadedState = await loadChatState();
  const reloadedConversation = reloadedState!.conversations.find(
    (conversation) => conversation.id === keptState.activeId,
  );
  assert.equal(reloadedConversation?.customModel, "glm-5.3", "override bertahan setelah reload");
  await act(async () => {
    useChatStore.getState().hydrate(reloadedState!.conversations, reloadedState!.activeId);
  });
  await wait(100);
  assert.equal(customModelInput().value, "glm-5.3", "input terisi ulang dari state tersimpan");
  console.log("ui: simpan/reset/saran/persistensi nama model ok");

  let plainId = "";
  await act(async () => {
    plainId = useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
    useChatStore.getState().setModel(plainId, "plain");
    useChatStore.getState().setCustomModel(plainId, undefined);
  });
  await wait(100);
  assert.equal(customModelInput().disabled, true, "penyedia non-OpenAI menonaktifkan input");
  console.log("ui: penyedia non-OpenAI menonaktifkan nama kustom");

  console.log("ui: impor file ekspor lama");
  const legacyPayload = {
    app: "ai-gateway",
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: [
      {
        id: "legacy-1",
        title: "Percakapan lama",
        createdAt: 1,
        updatedAt: 2,
        modelId: "coder-fast",
        system: "",
        messages: [
          { id: "legacy-m1", role: "user", content: "Halo lama", createdAt: 1, status: "complete" },
          {
            id: "legacy-m2",
            role: "assistant",
            content: "Jawaban lama",
            createdAt: 2,
            status: "complete",
            modelLabel: "Coder Fast",
          },
        ],
      },
    ],
  };
  const legacyFile = new File([JSON.stringify(legacyPayload)], "lama.json", {
    type: "application/json",
  });
  const legacyConversations = await parseImportFile(legacyFile);
  assert.equal(legacyConversations.length, 1, "file ekspor lama tetap bisa diimpor");
  assert.equal(legacyConversations[0]!.customModel, undefined, "file lama tidak butuh field baru");
  await act(async () => useChatStore.getState().importConversations(legacyConversations));
  await wait(100);
  assert.ok((document.body.textContent ?? "").includes("Halo lama"), "isi percakapan lama tampil");
  console.log("ui: impor file lama tanpa customModel ok");

  await act(async () => {
    useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
  });
  await wait(100);
  assert.ok(!(document.body.textContent ?? "").includes("Berikut contohnya."));

  assert.ok(
    presetPrompt("file")?.includes('<file name="path/nama.ext" lang="ts">'),
    "preset Mode file mengajarkan penanda",
  );
  assert.equal(presetIdForPrompt(presetPrompt("file")!), "file", "preset dikenali dari teksnya");

  assert.equal(sanitizeFileName("../../etc/passwd"), "passwd", "path dibuang dari nama file");
  assert.equal(sanitizeFileName('a<b>:"c.ts"'), "abc.ts", "karakter berbahaya dibuang");
  assert.equal(sanitizeFileName("  "), "file.txt", "nama kosong memakai fallback");

  console.log("ui: panel file");
  scenario = "files";
  await act(async () => {
    useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
  });
  await send("Buat dua file");
  await wait(500);

  assert.equal(fileCards().length, 2, "dua file jadi dua kartu");
  const filesBubble = document.body.textContent ?? "";
  assert.ok(filesBubble.includes("a.ts"), "nama file dinormalisasi tanpa path");
  assert.ok(!filesBubble.includes("src/a.ts"), "path dibuang dari nama file");
  assert.ok(filesBubble.includes("b.md"), "file kedua tampil");
  assert.ok(filesBubble.includes("1 baris") && filesBubble.includes("3 baris"), "jumlah baris");
  assert.ok(!filesBubble.includes("export const a = 1"), "isi file tidak menumpuk di bubble");
  assert.ok(filesBubble.includes("Dua file berikut."), "penjelasan di luar tag tetap tampil");
  assert.equal(panelElement(), null, "panel tertutup sebelum kartu dibuka");

  await openFileCard(0);
  assert.ok(panelElement(), "panel terbuka lewat tombol Buka");
  const panelText = () => panelElement()?.textContent ?? "";
  assert.ok(panelText().includes("a.ts"), "header panel memuat nama file");
  assert.ok(panelText().includes("TS"), "badge bahasa tampil");
  assert.ok(panelText().includes("export const a = 1;"), "isi file tampil di panel");

  const tabs = [...(panelElement()?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
  assert.equal(tabs.length, 2, "dua file jadi dua tab");
  assert.equal(tabs[0]?.getAttribute("aria-selected"), "true", "tab pertama aktif");
  const mdTab = tabs.find((tab) => tab.textContent === "b.md");
  assert.ok(mdTab, "tab b.md ada");
  await act(async () => mdTab!.click());
  await wait(150);
  assert.equal(
    panelElement()?.querySelector("h1")?.textContent,
    "Judul",
    "markdown dirender sebagai pratinjau",
  );

  await act(async () => panelButton("Salin isi file")!.click());
  await wait(100);
  assert.equal(clipboardText, "# Judul\n\nIsi.", "isi file disalin");

  let downloadBlob: Blob | null = null;
  let downloadName = "";
  (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = (blob) => {
    downloadBlob = blob;
    return "blob:mock";
  };
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    downloadName = this.download;
  };
  await act(async () => panelButton("Unduh file")!.click());
  assert.equal(downloadName, "b.md", "unduhan memakai nama file yang sudah disanitasi");
  assert.equal(
    await (downloadBlob as unknown as Blob).text(),
    "# Judul\n\nIsi.",
    "isi unduhan utuh",
  );

  await act(async () => panelButton("Tutup panel file")!.click());
  await wait(100);
  assert.equal(panelElement(), null, "panel bisa ditutup");
  console.log("ui: kartu file, tab, salin, unduh, tutup ok");

  console.log("ui: tag terpotong antar chunk + stop di tengah file");
  scenario = "filesStop";
  await act(async () => {
    useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
  });
  await send("Tulis file");
  await wait(300);
  const liveText = document.body.textContent ?? "";
  assert.ok(!liveText.includes("<file na"), "potongan tag tidak bocor ke bubble");
  assert.ok(!liveText.includes('name="stopped.ts"'), "atribut tag tidak tampil sebagai teks");
  assert.ok(liveText.includes("stopped.ts"), "file yang sedang ditulis punya kartu");
  assert.ok(liveText.includes("menulis…"), "indikator menulis tampil saat streaming");

  await act(async () => button("Stop")!.click());
  await wait(200);
  const stoppedText = document.body.textContent ?? "";
  assert.ok(stoppedText.includes("stopped.ts"), "file yang belum tertutup tetap tampil");
  assert.ok(stoppedText.includes("belum selesai"), "file parsial ditandai belum selesai");
  await openFileCard(0);
  assert.ok(
    panelElement()?.textContent?.includes("export const part = 1;"),
    "isi parsial tetap bisa dibuka",
  );
  await act(async () => panelButton("Tutup panel file")!.click());
  console.log("ui: file parsial + stop ok");

  console.log("ui: versi baru dengan nama sama");
  scenario = "version1";
  await act(async () => {
    useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
  });
  await send("Versi satu");
  await wait(400);
  scenario = "version2";
  await send("Versi dua");
  await wait(400);

  assert.equal(fileCards().length, 2, "dua pesan menghasilkan dua kartu");
  await openFileCard(1);
  const versionSelect = panelElement()?.querySelector<HTMLSelectElement>("#file-version");
  assert.ok(versionSelect, "pemilih versi tersedia");
  assert.equal(versionSelect!.options.length, 2, "dua versi tercatat");
  assert.equal(versionSelect!.value, "1", "versi terbaru dipilih otomatis");
  assert.ok(
    panelElement()?.textContent?.includes("export const value = 2;"),
    "versi terbaru ditampilkan",
  );
  await act(async () => {
    const select = panelElement()!.querySelector<HTMLSelectElement>("#file-version")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    setter.call(select, "0");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(100);
  assert.ok(
    panelElement()?.textContent?.includes("export const value = 1;"),
    "versi lama bisa dipilih",
  );
  assert.equal(
    panelElement()?.querySelectorAll('[role="tab"]').length,
    0,
    "satu nama file tidak butuh tab tambahan",
  );

  const activeConversationId = useChatStore.getState().activeId!;
  const savedPanels = await loadFilePanelState();
  assert.equal(savedPanels[activeConversationId]?.open, true, "status panel tersimpan");
  assert.equal(savedPanels[activeConversationId]?.name, "app.ts", "tab aktif tersimpan");

  function PanelProbe() {
    const panel = useFilePanelState(activeConversationId);
    return <p id="panel-probe">{panel.open ? `open:${panel.activeName}` : "closed"}</p>;
  }
  const probeContainer = document.createElement("div");
  document.body.appendChild(probeContainer);
  const probeRoot = createRoot(probeContainer);
  await act(async () => probeRoot.render(<PanelProbe />));
  await wait(250);
  assert.equal(
    document.getElementById("panel-probe")?.textContent,
    "open:app.ts",
    "panel dan tab dipulihkan setelah muat ulang",
  );
  await act(async () => probeRoot.unmount());
  probeContainer.remove();
  console.log("ui: versi + persistensi panel ok");

  console.log("ui: kode berisi teks mirip tag");
  scenario = "tagLike";
  await act(async () => {
    useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
  });
  await send("Contoh penanda");
  await wait(400);
  assert.equal(fileCards().length, 1, "contoh berpagar tidak dianggap file");
  const tagLikeText = document.body.textContent ?? "";
  assert.ok(tagLikeText.includes("Format yang dipakai"), "contoh tag tetap terbaca sebagai teks");
  assert.ok(
    tagLikeText.includes('name="contoh.ts"'),
    "contoh format di dalam blok berpagar tetap teks, bukan kartu",
  );
  await openFileCard(0);
  const tagPanelText = panelElement()?.textContent ?? "";
  assert.ok(tagPanelText.includes('const tags = "<files> <filename>";'), "tag mirip tetap utuh");
  assert.ok(tagPanelText.includes(`const raw = "<file name='x'>";`), "nama tag mirip tetap utuh");
  await act(async () => panelButton("Tutup panel file")!.click());
  console.log("ui: teks mirip tag di dalam kode aman");

  console.log("ui: fallback blok kode panjang");
  scenario = "longFence";
  await act(async () => {
    useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
  });
  await send("Blok panjang");
  await wait(400);
  assert.equal(fileCards().length, 1, "blok panjang jadi kartu file");
  const fenceText = document.body.textContent ?? "";
  assert.ok(fenceText.includes("models.ts"), "nama diambil dari info string");
  assert.ok(fenceText.includes("45 baris"), "jumlah baris benar");
  await openFileCard(0);
  assert.ok(panelElement()?.textContent?.includes("const row44 = read(44);"), "isi blok utuh");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((panelElement()?.querySelectorAll(".shiki-token").length ?? 0) > 100) break;
    await wait(200);
  }
  assert.ok(
    (panelElement()?.querySelectorAll(".shiki-token").length ?? 0) > 100,
    "shiki menyorot isi file di panel",
  );
  await act(async () => panelButton("Tutup panel file")!.click());

  console.log("ui: pratinjau html di iframe sandbox");
  const previewDocument = buildPreviewDocument("<p>halo</p>", "html");
  assert.ok(previewDocument.includes("default-src 'none'"), "pratinjau membawa CSP ketat");
  assert.ok(!previewDocument.includes("script-src"), "pratinjau tidak mengizinkan skrip");
  const parsed = parseMessageBlocks('<file name="x.html" lang="html">\n<p>hi</p>\n</file>');
  assert.equal(parsed[0]?.kind, "file", "file html terdeteksi");

  scenario = "htmlFile";
  await act(async () => {
    useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
  });
  await send("Halaman html");
  await wait(400);
  await openFileCard(0);
  const previewToggle = [
    ...(panelElement()?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ].find((element) => element.textContent?.includes("Pratinjau"));
  assert.ok(previewToggle, "toggle Pratinjau tersedia untuk html");
  await act(async () => previewToggle!.click());
  await wait(150);
  const frame = panelElement()?.querySelector<HTMLIFrameElement>("iframe");
  assert.ok(frame, "pratinjau html memakai iframe");
  assert.equal(
    frame!.getAttribute("sandbox"),
    "",
    "sandbox tanpa allow-same-origin maupun allow-scripts",
  );
  const srcdoc = frame!.getAttribute("srcdoc") ?? "";
  assert.ok(srcdoc.includes("default-src 'none'"), "dokumen iframe membawa CSP ketat");
  assert.ok(srcdoc.includes("<h1>Halo</h1>"), "isi file dirender di pratinjau");
  assert.equal(
    frame!.getAttribute("referrerpolicy"),
    "no-referrer",
    "referrer tidak dikirim ke pratinjau",
  );
  await act(async () => panelButton("Tutup panel file")!.click());
  console.log("ui: dokumen pratinjau terkunci");

  console.log("ui: error state");
  scenario = "error";
  await send("Tes error");
  await wait(300);
  const errorText = document.body.textContent ?? "";
  assert.ok(errorText.includes("Jawaban gagal"), "error banner rendered");
  assert.ok(errorText.includes("Potongan awal"), "partial text kept on error");
  assert.ok(errorText.includes("HTTP 500"), "upstream message shown");
  assert.ok(button("Ulangi"), "regenerate action available");
  console.log("ui: error state + partial text ok");

  scenario = "stall";
  await act(async () => {
    useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
  });
  await send("Tes stop");
  await wait(200);
  const stopButton = button("Stop");
  assert.ok(stopButton, "stop button visible while streaming");
  await act(async () => stopButton!.click());
  await wait(200);
  const stopped = document.body.textContent ?? "";
  assert.ok(stopped.includes("Jawaban terputus"), "stop marks the message interrupted");
  assert.ok(stopped.includes("Teks separuh jalan"), "partial text survives stop");
  assert.ok(button("Lanjutkan"), "continue action offered");
  console.log("ui: stop + interrupted state ok");

  console.log("ui: export/import roundtrip");
  const conversations = useChatStore.getState().conversations;
  let captured: Blob | null = null;
  (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = (blob) => {
    captured = blob;
    return "blob:mock";
  };
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = () => {};

  downloadConversationsJson(conversations);
  assert.ok(captured, "export produced a blob");
  const exportedJson = await (captured as Blob).text();
  const file = new File([exportedJson], "backup.json", { type: "application/json" });
  const imported = await parseImportFile(file);
  assert.deepEqual(
    imported,
    JSON.parse(exportedJson).conversations,
    "export → import preserves data",
  );
  console.log("ui: export/import equal", { conversations: imported.length });

  downloadConversationMarkdown(conversations[0]!, "Coder Fast");
  const markdown = await (captured as Blob).text();
  assert.ok(markdown.startsWith("# "), "markdown export starts with the title");
  assert.ok(markdown.includes("## Kamu"), "markdown export contains user turns");
  console.log("ui: markdown export ok");

  scenario = "long";
  await act(async () => {
    useChatStore
      .getState()
      .newConversation({ modelId: "coder-fast", system: "Kamu asisten coding." });
  });
  const started = Date.now();
  await send("MOCK_LONG");
  await wait(600);
  const longText = document.body.textContent ?? "";
  assert.ok(longText.includes("Jawaban panjang"), "long answer rendered");
  assert.ok(longText.includes("Bagian 12"), "all sections rendered");
  const longCards = fileCards().length;
  assert.ok(longCards >= 12, `blok panjang jadi kartu file (${longCards})`);

  await openFileCard(0);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((panelElement()?.querySelectorAll(".shiki-token").length ?? 0) > 200) break;
    await wait(200);
  }
  const longTokens = panelElement()?.querySelectorAll(".shiki-token").length ?? 0;
  assert.ok(longTokens > 200, `panel menyorot blok panjang (${longTokens} tokens)`);
  console.log("ui: long response ok", {
    cards: longCards,
    tokens: longTokens,
    elapsedMs: Date.now() - started,
  });

  await act(async () => {
    root.unmount();
  });
  console.log("ui: unmount clean");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
