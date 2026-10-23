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
let scenario: "success" | "error" | "stall" | "long" = "success";
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

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!String(input).endsWith("/api/chat")) return new Response("{}", { status: 200 });
  lastBody = JSON.parse(String(init?.body));

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
  const longBlocks = document.querySelectorAll("pre").length;
  assert.ok(longBlocks >= 12, `code blocks rendered (${longBlocks})`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (document.querySelectorAll(".shiki-token").length > 500) break;
    await wait(200);
  }
  const longTokens = document.querySelectorAll(".shiki-token").length;
  assert.ok(longTokens > 500, `long answer highlighted (${longTokens} tokens)`);
  console.log("ui: long response ok", {
    blocks: longBlocks,
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
