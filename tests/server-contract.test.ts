import assert from "node:assert/strict";
import type { ModelConfig } from "@/config/models";
import { effectiveUpstreamModel } from "@/server/models";

const encoder = new TextEncoder();

function streamOf(...parts: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

async function collect(chunks: AsyncGenerator<string, void, void>): Promise<string> {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

function config(overrides: Partial<ModelConfig>): ModelConfig {
  return {
    id: "p",
    label: "P",
    endpointEnv: "P_URL",
    format: "openai",
    supportsSystemPrompt: true,
    ...overrides,
  };
}

async function main() {
  // Override rules: OpenAI format only, and never for a fallback candidate.
  const openai = config({ format: "openai", upstreamModel: "default-model" });
  const sse = config({ format: "sse-text", upstreamModel: "default-model" });
  const plain = config({ format: "json-text" });

  assert.equal(effectiveUpstreamModel(openai, "claude-opus-5", false), "claude-opus-5");
  assert.equal(effectiveUpstreamModel(openai, "claude-opus-5", true), "default-model");
  assert.equal(effectiveUpstreamModel(sse, "claude-opus-5", false), "default-model");
  assert.equal(effectiveUpstreamModel(plain, "claude-opus-5", false), undefined);
  assert.equal(effectiveUpstreamModel(openai, undefined, false), "default-model");
  console.log("server: aturan override model ok");

  // Adapter coverage for the two formats the current registry no longer uses.
  const { openAiAdapter } = await import("@/server/adapters/openai");
  const { sseTextAdapter } = await import("@/server/adapters/sse-text");
  const { jsonTextAdapter } = await import("@/server/adapters/json-text");

  const openaiText = await collect(
    openAiAdapter(
      streamOf(
        'data: {"choices":[{"delta":{"content":"Halo"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" dunia"}}]}\n\n',
        "data: [DONE]\n\n",
      ),
    ),
  );
  assert.equal(openaiText, "Halo dunia");

  const sseText = await collect(sseTextAdapter(streamOf("data: baris satu\ndata: baris dua\n\n")));
  assert.equal(sseText, "baris satu\nbaris dua", "multi-line data digabung dengan newline");

  const sseTail = await collect(sseTextAdapter(streamOf("data: tiga\n\n")));
  assert.equal(sseTail, "tiga");
  console.log("server: adapter openai + sse-text ok");

  const jsonText = await collect(jsonTextAdapter(streamOf('{"text":"jawaban utuh"}')));
  assert.equal(jsonText, "jawaban utuh");

  await assert.rejects(
    () => collect(jsonTextAdapter(streamOf('{"tidak":"ada teks"}'))),
    /field "text"/,
  );
  console.log("server: adapter json-text ok");

  console.log("\nSemua pemeriksaan kontrak server lulus.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
