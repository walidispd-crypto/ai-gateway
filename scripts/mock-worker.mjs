/**
 * Local stand-in for the Cloudflare Workers.
 * Run: npm run mock-worker  (listens on 127.0.0.1:8787)
 *
 * Endpoints: /openai, /sse-text, /json-text, /_requests (inspection for smoke tests).
 * Scenario flags come from the last user message: MOCK_500, MOCK_502, MOCK_DISCONNECT,
 * MOCK_HANG, MOCK_SLOW_HEADERS, MOCK_STALL, MOCK_SLOW, MOCK_LONG.
 * Sending body.model === "fail-model" fails that single model, which exercises fallback.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 8787);
const requests = [];

const DEFAULT_TEXT = `Berikut perbaikannya.

\`\`\`ts
export function add(a: number, b: number): number {
  return a + b;
}
\`\`\`

- Periksa tipe input.
- Tambahkan tes untuk kasus negatif.

| Kasus | Hasil |
| --- | --- |
| 1 + 2 | 3 |
`;

function longText() {
  const parts = ["# Jawaban panjang\n"];
  for (let block = 0; block < 12; block += 1) {
    parts.push(`\n## Bagian ${block + 1}\n\nPenjelasan singkat untuk bagian ${block + 1}.\n\n`);
    parts.push("```ts\n");
    for (let line = 0; line < 40; line += 1) {
      parts.push(`const value${block}_${line} = compute(${block}, ${line});\n`);
    }
    parts.push("```\n");
  }
  return parts.join("");
}

function chunkText(text, size) {
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function sseFrame(text) {
  const lines = text.split("\n").map((line) => `data: ${line}`);
  return `${lines.join("\n")}\n\n`;
}

function openAiFrame(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function lastUserText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return String(messages[index].content ?? "");
  }
  return "";
}

function sendChunks(response, chunks, frame, { disconnect = false, slow = false, record } = {}) {
  const interval = slow ? 120 : 12;
  let index = 0;
  let finished = false;

  const timer = setInterval(() => {
    if (index >= chunks.length) {
      clearInterval(timer);
      finished = true;
      if (disconnect) {
        response.destroy();
      } else {
        if (frame === openAiFrame) response.write("data: [DONE]\n\n");
        response.end();
      }
      return;
    }
    response.write(frame(chunks[index]));
    index += 1;
  }, interval);

  response.on("close", () => {
    if (!finished) {
      record.aborted = true;
      clearInterval(timer);
    }
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (url.pathname === "/_requests") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(requests));
    return;
  }

  const format = url.pathname.replace("/", "");
  if (!["openai", "sse-text", "json-text"].includes(format)) {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "unknown endpoint" }));
    return;
  }

  const raw = await readBody(request);
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "invalid json" }));
    return;
  }

  const record = {
    format,
    authorization: request.headers.authorization ?? null,
    body,
    at: new Date().toISOString(),
    aborted: false,
  };
  requests.push(record);

  const prompt = lastUserText(body);

  if (body.model === "fail-model") {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "model unavailable" }));
    return;
  }

  // Only the OpenAI endpoint fails on MOCK_500, so the fallback path can be exercised end to end.
  // MOCK_502 fails everywhere, for testing the plain error path.
  if ((prompt.includes("MOCK_500") && format === "openai") || prompt.includes("MOCK_502")) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "worker exploded" }));
    return;
  }

  if (prompt.includes("MOCK_HANG")) {
    setTimeout(() => {
      if (response.writableEnded) return;
      response.writeHead(504, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "gateway timeout" }));
    }, 5_000);
    return;
  }

  if (prompt.includes("MOCK_SLOW_HEADERS")) {
    setTimeout(() => {
      if (response.writableEnded) return;
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end();
    }, 2_000);
    return;
  }

  const text = prompt.includes("MOCK_LONG") ? longText() : DEFAULT_TEXT;
  const disconnect = prompt.includes("MOCK_DISCONNECT");
  const slow = prompt.includes("MOCK_SLOW");

  if (format === "json-text") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ text }));
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });

  if (prompt.includes("MOCK_STALL")) {
    response.write(format === "openai" ? openAiFrame("awal") : sseFrame("awal"));
    record.stalled = true;
    return;
  }

  if (format === "openai") {
    sendChunks(response, chunkText(text, 24), openAiFrame, { disconnect, slow, record });
  } else {
    sendChunks(response, chunkText(text, 24), sseFrame, { disconnect, slow, record });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock worker listening on http://127.0.0.1:${PORT}`);
});
