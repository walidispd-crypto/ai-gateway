import { z } from "zod";
import { UpstreamError } from "@/server/errors";
import { readSseData } from "@/server/adapters/sse";

const chunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }).optional(),
        message: z.object({ content: z.string().nullish() }).optional(),
      }),
    )
    .optional(),
});

const errorEnvelopeSchema = z.object({
  error: z.union([z.string(), z.object({ message: z.string().optional() })]),
});

function extractText(payload: unknown): string | null {
  const errorEnvelope = errorEnvelopeSchema.safeParse(payload);
  if (errorEnvelope.success) {
    throw new UpstreamError("upstream", "Layanan model melaporkan error di tengah stream.");
  }

  const chunk = chunkSchema.safeParse(payload);
  if (!chunk.success) {
    throw new UpstreamError("format", "Format stream model tidak sesuai kontrak OpenAI.");
  }

  const choice = chunk.data.choices?.[0];
  const text = choice?.delta?.content ?? choice?.message?.content ?? "";
  return text.length > 0 ? text : null;
}

/** Normalises OpenAI-style chat-completion SSE into plain text chunks. */
export async function* openAiAdapter(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, void> {
  for await (const data of readSseData(stream)) {
    if (data.trim() === "[DONE]") return;

    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      throw new UpstreamError("format", "Stream model berisi JSON yang tidak valid.");
    }

    const text = extractText(payload);
    if (text) yield text;
  }
}
