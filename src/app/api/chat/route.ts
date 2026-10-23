import { cookies } from "next/headers";
import type { StreamEvent } from "@/lib/protocol";
import { chatRequestSchema, BodyTooLargeError, readJsonBody } from "@/lib/schemas";
import { SESSION_COOKIE, getSessionSecret, verifySessionToken } from "@/server/auth";
import { generateReply } from "@/server/stream";

// Node runtime: Workers and the fetch/stream pipeline are plain Web APIs, and it keeps
// the door open for self-hosted deployments. See DECISIONS.md.
export const runtime = "nodejs";
// With Fluid compute (now the default) Hobby allows 300s and Pro 800s; see docs/DEPLOY.md.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const secret = getSessionSecret();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!secret || !(await verifySessionToken(token, secret))) {
    return jsonError("Tidak terautentikasi.", 401);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return jsonError("Percakapan terlalu besar untuk dikirim. Hapus beberapa pesan.", 413);
    }
    return jsonError("Body request tidak valid.", 400);
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Permintaan tidak valid: periksa model dan isi pesan.", 400);
  }

  const encoder = new TextEncoder();
  const events = generateReply({
    modelId: parsed.data.modelId,
    messages: parsed.data.messages,
    system: parsed.data.system,
    customModel: parsed.data.customModel,
    signal: request.signal,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        for await (const event of events) send(event);
      } catch {
        send({
          type: "error",
          message: "Terjadi kesalahan di proxy chat.",
          code: "upstream",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // The client may have disconnected and closed the stream already.
        }
      }
    },
    cancel() {
      // Closing the controller also ends the generator on the next yield, which aborts
      // the in-flight upstream fetch.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
