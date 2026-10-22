import type { ChatMessageInput, StreamEvent } from "@/lib/protocol";

export type ChatRequestBody = {
  modelId: string;
  messages: ChatMessageInput[];
  system?: string;
};

export class ChatRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Small runtime guard, kept hand-written to avoid pulling a schema library into the client bundle. */
export function parseStreamEvent(raw: string): StreamEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(payload) || typeof payload.type !== "string") return null;

  switch (payload.type) {
    case "meta":
      if (typeof payload.modelId !== "string" || typeof payload.modelLabel !== "string")
        return null;
      return payload as StreamEvent;
    case "delta":
      return typeof payload.text === "string" ? { type: "delta", text: payload.text } : null;
    case "done":
      return { type: "done" };
    case "error":
      if (typeof payload.message !== "string" || typeof payload.code !== "string") return null;
      return payload as StreamEvent;
    default:
      return null;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && typeof payload.error === "string") return payload.error;
  } catch {
    // Non-JSON error bodies fall back to the generic message below.
  }
  return `Permintaan gagal (HTTP ${response.status}).`;
}

export async function streamChat(
  body: ChatRequestBody,
  { signal, onEvent }: { signal: AbortSignal; onEvent: (event: StreamEvent) => void },
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new ChatRequestError(await readErrorMessage(response), response.status);
  }
  if (!response.body) {
    throw new ChatRequestError("Respons server tidak memiliki body.", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) {
      buffer += decoder.decode();
      break;
    }

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim().length > 0) {
        const event = parseStreamEvent(line);
        if (event) onEvent(event);
      }
      newline = buffer.indexOf("\n");
    }
  }

  const tail = buffer.trim();
  if (tail.length > 0) {
    const event = parseStreamEvent(tail);
    if (event) onEvent(event);
  }
}
