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

const encoder = new TextEncoder();
const models = [
  {
    id: "coder-fast",
    label: "Coder Fast",
    description: "Cepat",
    tags: ["code" as const],
    maxContextChars: 48_000,
  },
  {
    id: "general",
    label: "General",
    description: "Umum",
    tags: ["general" as const],
    maxContextChars: 24_000,
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
let lastBody: { messages: { role: string; content: string }[]; system?: string } | null = null;

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
        { type: "meta", modelId: "coder-fast", modelLabel: "Coder Fast" },
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
