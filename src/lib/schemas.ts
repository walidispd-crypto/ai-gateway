import { z } from "zod";

const MAX_MESSAGES = 200;
const MAX_MESSAGE_CHARS = 200_000;
const MAX_SYSTEM_CHARS = 20_000;

export const chatRequestSchema = z.object({
  modelId: z.string().min(1).max(64),
  system: z.string().max(MAX_SYSTEM_CHARS).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(MAX_MESSAGE_CHARS),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
});

export const loginRequestSchema = z.object({
  password: z.string().min(1).max(512),
});

const MAX_BODY_BYTES = 1_500_000;

/** Reads a JSON body while enforcing a hard byte cap, so a huge paste cannot exhaust the function. */
export async function readJsonBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    throw new BodyTooLargeError();
  }

  if (!request.body) {
    throw new InvalidBodyError("Body request kosong.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new InvalidBodyError("Body request bukan JSON yang valid.");
  }
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("Body request terlalu besar.");
    this.name = "BodyTooLargeError";
  }
}

export class InvalidBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBodyError";
  }
}
