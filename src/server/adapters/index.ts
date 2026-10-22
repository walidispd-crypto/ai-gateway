import type { ModelFormat } from "@/config/models";
import { jsonTextAdapter } from "@/server/adapters/json-text";
import { openAiAdapter } from "@/server/adapters/openai";
import { sseTextAdapter } from "@/server/adapters/sse-text";

export type TextChunkStream = (
  stream: ReadableStream<Uint8Array>,
) => AsyncGenerator<string, void, void>;

const ADAPTERS: Record<ModelFormat, TextChunkStream> = {
  openai: openAiAdapter,
  "sse-text": sseTextAdapter,
  "json-text": jsonTextAdapter,
};

export function adapterForFormat(format: ModelFormat): TextChunkStream {
  return ADAPTERS[format];
}
