import { z } from "zod";
import { UpstreamError } from "@/server/errors";

const responseSchema = z.object({ text: z.string() });

/** Non-streaming JSON Worker. Emitted as a single chunk so the UI path stays identical. */
export async function* jsonTextAdapter(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, void> {
  const raw = await new Response(stream).text();

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new UpstreamError("format", 'Respons Worker bukan JSON (diharapkan { "text": ... }).');
  }

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new UpstreamError("format", 'Respons JSON tidak memiliki field "text" berupa string.');
  }
  if (parsed.data.text.length === 0) {
    throw new UpstreamError("format", "Model mengembalikan teks kosong.");
  }

  yield parsed.data.text;
}
