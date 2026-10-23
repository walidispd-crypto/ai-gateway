/**
 * Worker contoh untuk AI Gateway.
 *
 * Satu Worker melayani tiga kontrak respons, dipilih lewat path:
 *   POST /openai     -> SSE gaya OpenAI (`data: {"choices":[{"delta":{"content":...}}]}`, diakhiri [DONE])
 *   POST /sse-text   -> SSE dengan teks mentah per event (`data: <teks>`)
 *   POST /json-text  -> JSON non-stream `{ "text": "..." }`
 *
 * Dua mode:
 *   - MOCK=1 (atau UPSTREAM_URL kosong): menjawab dengan teks contoh, tanpa memanggil model.
 *   - UPSTREAM_URL diisi: meneruskan ke endpoint chat-completions yang kompatibel OpenAI.
 *
 * Konfigurasi lewat wrangler.jsonc (`vars`) dan `wrangler secret put` untuk token.
 */

type Role = "user" | "assistant";

type ChatMessage = { role: Role; content: string };

type ChatBody = {
  messages?: unknown;
  system?: unknown;
  model?: unknown;
  stream?: unknown;
};

export interface Env {
  /** Bila diisi, request wajib membawa `Authorization: Bearer <token>`. */
  WORKER_TOKEN?: string;
  /** Endpoint chat-completions kompatibel OpenAI, mis. https://api.openai.com/v1/chat/completions */
  UPSTREAM_URL?: string;
  /** Bearer token untuk UPSTREAM_URL (simpan lewat `wrangler secret put`). */
  UPSTREAM_TOKEN?: string;
  /** Nama model yang dikirim ke upstream, mis. "gpt-4.1-mini". */
  UPSTREAM_MODEL?: string;
  /** "1" = jawab dengan teks contoh tanpa memanggil upstream. */
  MOCK?: string;
}

type Format = "openai" | "sse-text" | "json-text";

const FORMATS: readonly Format[] = ["openai", "sse-text", "json-text"];
const MAX_BODY_BYTES = 2_000_000;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  // Instructs intermediaries not to buffer; the response must reach the client incrementally.
  "X-Accel-Buffering": "no",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { role?: unknown; content?: unknown };
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
}

/** Membandingkan hash, bukan string mentah, supaya panjang token tidak bocor lewat timing. */
async function tokenMatches(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index]! ^ right[index]!;
  return diff === 0;
}

async function readBody(request: Request): Promise<ChatBody | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === "object" && parsed !== null ? (parsed as ChatBody) : null;
  } catch {
    return null;
  }
}

function parseMessages(body: ChatBody): ChatMessage[] {
  if (!Array.isArray(body.messages)) return [];
  return body.messages.filter(isChatMessage).map(({ role, content }) => ({ role, content }));
}

/* ------------------------------------------------------------------ framing */

function openAiFrame(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

/**
 * Teks bisa berisi newline. Setiap baris dikirim sebagai `data:` terpisah, dan konsumen
 * (proxy Next.js) menggabungkannya lagi dengan "\n", sehingga tidak ada karakter hilang.
 */
function textFrame(text: string): string {
  const lines = text.split("\n").map((line) => `data: ${line}`);
  return `${lines.join("\n")}\n\n`;
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

const encoder = new TextEncoder();

/** ReadableStream yang menarik satu potong dari generator setiap kali konsumen siap. */
function streamFrom(
  produce: () => AsyncGenerator<string, void, void>,
  frame: (text: string) => string,
  trailer?: string,
): ReadableStream<Uint8Array> {
  const generator = produce();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await generator.next();
        if (next.done) {
          if (trailer) controller.enqueue(encoder.encode(trailer));
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(frame(next.value)));
      } catch (error) {
        // Upstream putus di tengah jalan: tutup stream apa adanya supaya teks parsial tetap sampai.
        controller.error(error);
      }
    },
    async cancel() {
      await generator.return(undefined);
    },
  });
}

/* ------------------------------------------------------------------ upstream */

function findBoundary(buffer: string): { index: number; length: number } | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  if (!match || match.index === undefined) return null;
  return { index: match.index, length: match[0].length };
}

function dataOf(rawEvent: string): string | null {
  const lines: string[] = [];
  for (const line of rawEvent.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5);
    lines.push(value.startsWith(" ") ? value.slice(1) : value);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

async function* readSseData(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const boundary = findBoundary(buffer);
        if (!boundary) break;
        const raw = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const data = dataOf(raw);
        if (data !== null) yield data;
      }

      if (done) {
        const tail = dataOf(buffer);
        if (tail !== null) yield tail;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* upstreamDeltas(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, void> {
  for await (const data of readSseData(stream)) {
    if (data.trim() === "[DONE]") return;
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    const choices = (payload as { choices?: { delta?: { content?: unknown } }[] }).choices;
    const content = choices?.[0]?.delta?.content;
    if (typeof content === "string" && content.length > 0) yield content;
  }
}

async function fetchUpstream(
  env: Env,
  messages: ChatMessage[],
  system: string | undefined,
  stream: boolean,
  signal: AbortSignal,
  model?: string,
): Promise<Response> {
  const payload = {
    model: model ?? env.UPSTREAM_MODEL ?? "gpt-4.1-mini",
    stream,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages.map(({ role, content }) => ({ role, content })),
    ],
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.UPSTREAM_TOKEN) headers.Authorization = `Bearer ${env.UPSTREAM_TOKEN}`;

  return fetch(env.UPSTREAM_URL!, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });
}

/* ------------------------------------------------------------------ mock */

function mockAnswer(messages: ChatMessage[]): string {
  const last = messages[messages.length - 1]?.content ?? "";
  const trimmed = last.length > 80 ? `${last.slice(0, 77)}...` : last;

  return `Ini jawaban contoh dari Worker (mode MOCK), belum memanggil model sungguhan.

Permintaan terakhir kamu: **${trimmed.replace(/\n/g, " ")}**

\`\`\`ts
export function add(a: number, b: number): number {
  return a + b;
}
\`\`\`

- Ganti \`MOCK\` menjadi \`"0"\` dan isi \`UPSTREAM_URL\` untuk memakai model sungguhan.
- Format respons mengikuti path: /openai, /sse-text, atau /json-text.
`;
}

async function* mockChunks(text: string): AsyncGenerator<string, void, void> {
  for (const chunk of chunkText(text, 28)) {
    // Jeda kecil meniru token demi token, sehingga streaming bisa diuji dari sisi klien.
    await new Promise((resolve) => setTimeout(resolve, 20));
    yield chunk;
  }
}

/* ------------------------------------------------------------------ handler */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const format = url.pathname.replace(/^\/+|\/+$/g, "");

    if (format === "" || format === "health") {
      return jsonResponse({ ok: true, formats: FORMATS, mock: env.MOCK === "1" });
    }

    if (!FORMATS.includes(format as Format)) {
      return jsonResponse(
        { error: "Unknown endpoint. Gunakan /openai, /sse-text, atau /json-text." },
        404,
      );
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Gunakan POST." }, 405);
    }

    if (env.WORKER_TOKEN) {
      const header = request.headers.get("authorization") ?? "";
      if (!(await tokenMatches(header, `Bearer ${env.WORKER_TOKEN}`))) {
        return jsonResponse({ error: "Unauthorized." }, 401);
      }
    }

    const body = await readBody(request);
    if (!body) return jsonResponse({ error: "Body harus JSON yang valid (< 2 MB)." }, 400);

    const messages = parseMessages(body);
    if (messages.length === 0) {
      return jsonResponse({ error: "Field messages wajib berisi minimal satu pesan." }, 400);
    }

    const system = typeof body.system === "string" ? body.system : undefined;
    const model = typeof body.model === "string" ? body.model : undefined;
    const useMock = env.MOCK === "1" || !env.UPSTREAM_URL;

    if (format === "json-text") {
      if (useMock) {
        return jsonResponse({ text: mockAnswer(messages) });
      }
      const upstream = await fetchUpstream(env, messages, system, false, request.signal, model);
      if (!upstream.ok) return jsonResponse({ error: "Upstream menolak permintaan." }, 502);
      const payload = (await upstream.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const text = payload.choices?.[0]?.message?.content;
      if (typeof text !== "string" || text.length === 0) {
        return jsonResponse({ error: "Upstream tidak mengembalikan teks." }, 502);
      }
      return jsonResponse({ text });
    }

    if (useMock) {
      const text = mockAnswer(messages);
      return new Response(
        streamFrom(
          () => mockChunks(text),
          format === "openai" ? openAiFrame : textFrame,
          format === "openai" ? "data: [DONE]\n\n" : undefined,
        ),
        { headers: SSE_HEADERS },
      );
    }

    const upstream = await fetchUpstream(env, messages, system, true, request.signal, model);
    if (!upstream.ok || !upstream.body) {
      return jsonResponse({ error: `Upstream gagal (HTTP ${upstream.status}).` }, 502);
    }

    // Format openai: upstream sudah OpenAI-compatible, jadi diteruskan apa adanya.
    if (format === "openai") {
      return new Response(upstream.body, { headers: SSE_HEADERS });
    }

    // Format sse-text: bongkar SSE upstream, kirim ulang sebagai teks mentah per event.
    return new Response(
      streamFrom(() => upstreamDeltas(upstream.body!), textFrame),
      { headers: SSE_HEADERS },
    );
  },
};
