import type { Conversation } from "@/lib/chat-types";

const IMPORT_SIZE_LIMIT = 10 * 1024 * 1024;

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

function triggerDownload(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "percakapan";
}

export function downloadConversationsJson(conversations: Conversation[]): void {
  const payload = {
    app: "ai-gateway" as const,
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    conversations,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(`ai-gateway-${stamp}.json`, JSON.stringify(payload, null, 2), "application/json");
}

export function downloadConversationMarkdown(conversation: Conversation, modelLabel: string): void {
  const lines: string[] = [`# ${conversation.title}`, ""];
  lines.push(`- Model: ${modelLabel}`);
  lines.push(`- Dibuat: ${new Date(conversation.createdAt).toISOString()}`);
  lines.push(`- Terakhir diubah: ${new Date(conversation.updatedAt).toISOString()}`);
  if (conversation.system.trim().length > 0) {
    lines.push(
      "",
      "<details><summary>System prompt</summary>",
      "",
      conversation.system,
      "",
      "</details>",
    );
  }
  lines.push("");

  for (const message of conversation.messages) {
    lines.push(message.role === "user" ? "## Kamu" : "## Asisten");
    lines.push("");
    lines.push(message.content);
    lines.push("");
  }

  triggerDownload(`${safeFilename(conversation.title)}.md`, lines.join("\n"), "text/markdown");
}

export async function parseImportFile(file: File): Promise<Conversation[]> {
  if (file.size > IMPORT_SIZE_LIMIT) {
    throw new ImportError("File terlalu besar untuk diimpor.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new ImportError("File bukan JSON yang valid.");
  }

  const { exportFileSchema, normalizeConversations } = await import("@/lib/chat-schema");
  const parsed = exportFileSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ImportError("Struktur file tidak dikenali sebagai ekspor AI Gateway.");
  }

  return normalizeConversations(parsed.data.conversations);
}
