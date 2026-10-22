import { readSseData } from "@/server/adapters/sse";

/** SSE where each `data:` payload is the raw text chunk. */
export async function* sseTextAdapter(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, void> {
  for await (const data of readSseData(stream)) {
    if (data.length > 0) yield data;
  }
}
