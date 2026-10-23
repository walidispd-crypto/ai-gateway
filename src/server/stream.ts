import type { ChatMessageInput, StreamEvent } from "@/lib/protocol";
import { findModel } from "@/config/models";
import type { ResolvedModel } from "@/server/models";
import { effectiveUpstreamModel, resolveModel } from "@/server/models";
import { UpstreamError, errorEvent } from "@/server/errors";
import { adapterForFormat } from "@/server/adapters";

type GenerateParams = {
  modelId: string;
  messages: ChatMessageInput[];
  system?: string;
  /** Provider-side model name typed by the owner; ignored for non-OpenAI formats. */
  customModel?: string;
  signal: AbortSignal;
};

class ClientAbortError extends Error {
  constructor() {
    super("Permintaan dibatalkan oleh pengguna.");
    this.name = "ClientAbortError";
  }
}

function buildWorkerBody(
  model: ResolvedModel,
  messages: ChatMessageInput[],
  system: string | undefined,
  upstreamModel: string | undefined,
): string {
  const prepared = messages.map((message) => ({ role: message.role, content: message.content }));

  if (system && !model.config.supportsSystemPrompt) {
    // The Worker has no system slot, so the instruction is folded into the first user turn
    // instead of being dropped silently.
    const first = prepared[0];
    if (first && first.role === "user") {
      prepared.splice(0, 1, { role: "user", content: `${system}\n\n---\n\n${first.content}` });
    } else {
      prepared.unshift({ role: "user", content: system });
    }
  }

  const body: {
    messages: ChatMessageInput[];
    stream: true;
    system?: string;
    model?: string;
  } = { messages: prepared, stream: true };

  if (system && model.config.supportsSystemPrompt) body.system = system;
  if (upstreamModel) body.model = upstreamModel;

  return JSON.stringify(body);
}

function headersFor(model: ResolvedModel): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: model.config.format === "json-text" ? "application/json" : "text/event-stream",
    "User-Agent": "ai-gateway/0.1",
  };
  if (model.token) headers.Authorization = `Bearer ${model.token}`;
  return headers;
}

function classifyFailure(
  cause: unknown,
  params: {
    clientSignal: AbortSignal;
    timedOut: boolean;
    model: ResolvedModel;
    midStream: boolean;
  },
): Error {
  if (cause instanceof UpstreamError) return cause;
  if (params.clientSignal.aborted) return new ClientAbortError();

  const seconds = Math.round(params.model.timeoutMs / 1000);
  if (params.timedOut) {
    return new UpstreamError(
      "timeout",
      `${params.model.config.label} tidak merespons dalam ${seconds} detik.`,
    );
  }
  if (params.midStream) {
    return new UpstreamError("network", "Koneksi ke layanan model terputus di tengah respons.");
  }
  return new UpstreamError("network", `Tidak dapat menghubungi ${params.model.config.label}.`);
}

async function nextWithIdleTimeout(
  chunks: AsyncGenerator<string, void, void>,
  model: ResolvedModel,
  controller: AbortController,
  markTimedOut: () => void,
): Promise<IteratorResult<string, void>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      markTimedOut();
      controller.abort();
      const seconds = Math.round(model.idleTimeoutMs / 1000);
      reject(
        new UpstreamError(
          "timeout",
          `${model.config.label} berhenti mengirim data selama ${seconds} detik.`,
        ),
      );
    }, model.idleTimeoutMs);
  });

  const pending = chunks.next();
  // The race can settle on the timeout first; swallow the later settlement of `pending`.
  pending.catch(() => undefined);

  try {
    return await Promise.race([pending, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function* streamAttempt(
  model: ResolvedModel,
  messages: ChatMessageInput[],
  system: string | undefined,
  clientSignal: AbortSignal,
  upstreamModel: string | undefined,
): AsyncGenerator<string, void, void> {
  const controller = new AbortController();
  let timedOut = false;
  const onClientAbort = () => controller.abort();
  clientSignal.addEventListener("abort", onClientAbort, { once: true });

  const headerTimer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, model.timeoutMs);

  let response: Response;
  try {
    response = await fetch(model.url, {
      method: "POST",
      headers: headersFor(model),
      body: buildWorkerBody(model, messages, system, upstreamModel),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (cause) {
    throw classifyFailure(cause, { clientSignal, timedOut, model, midStream: false });
  } finally {
    clearTimeout(headerTimer);
  }

  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // Body cancellation only frees the socket; there is nothing to recover here.
    }
    clientSignal.removeEventListener("abort", onClientAbort);
    if (clientSignal.aborted) throw new ClientAbortError();
    throw new UpstreamError(
      "upstream",
      `${model.config.label} menolak permintaan (HTTP ${response.status}).`,
    );
  }

  if (!response.body) {
    clientSignal.removeEventListener("abort", onClientAbort);
    throw new UpstreamError("format", `${model.config.label} tidak mengirim body respons.`);
  }

  const chunks = adapterForFormat(model.config.format)(response.body);

  try {
    for (;;) {
      const next = await nextWithIdleTimeout(chunks, model, controller, () => {
        timedOut = true;
      });
      if (next.done) return;
      if (next.value.length > 0) yield next.value;
    }
  } catch (cause) {
    throw classifyFailure(cause, { clientSignal, timedOut, model, midStream: true });
  } finally {
    clientSignal.removeEventListener("abort", onClientAbort);
    // Releases a socket that is still open when the consumer stops early.
    controller.abort();
  }
}

/**
 * Opens the requested model (plus its configured fallback) and normalises every failure
 * into a stream the route handler can forward line by line.
 */
export async function* generateReply({
  modelId,
  messages,
  system,
  customModel,
  signal,
}: GenerateParams): AsyncGenerator<StreamEvent> {
  const requested = findModel(modelId);
  const candidates: ResolvedModel[] = [];
  const resolutionErrors: unknown[] = [];

  try {
    candidates.push(resolveModel(modelId));
  } catch (error) {
    resolutionErrors.push(error);
  }

  const fallbackId = requested?.fallbackId;
  if (fallbackId && fallbackId !== modelId) {
    try {
      candidates.push(resolveModel(fallbackId));
    } catch (error) {
      resolutionErrors.push(error);
    }
  }

  const metaFor = (model: ResolvedModel, modelName: string | undefined): StreamEvent => {
    const isFallback = model.config.id !== modelId;
    return {
      type: "meta",
      modelId: model.config.id,
      modelLabel: model.config.label,
      modelName,
      fallbackFrom: isFallback ? { modelId, modelLabel: requested?.label ?? modelId } : undefined,
    };
  };

  if (candidates.length === 0) {
    yield { type: "meta", modelId, modelLabel: requested?.label ?? modelId };
    yield errorEvent(
      resolutionErrors[0] ?? new UpstreamError("config", "Model tidak tersedia di server."),
    );
    return;
  }

  let lastError: unknown = resolutionErrors[0];

  for (const model of candidates) {
    const isFallback = model.config.id !== modelId;
    const modelName = effectiveUpstreamModel(model.config, customModel, isFallback);
    const iterator = streamAttempt(model, messages, system, signal, modelName);

    let first: IteratorResult<string, void>;
    try {
      first = await iterator.next();
    } catch (error) {
      await iterator.return(undefined);
      if (signal.aborted) return;
      lastError = error;
      continue;
    }

    if (first.done) {
      await iterator.return(undefined);
      lastError = new UpstreamError("format", `${model.config.label} tidak mengirim teks apa pun.`);
      continue;
    }

    yield metaFor(model, modelName);

    try {
      yield { type: "delta", text: first.value };
      for (;;) {
        const next = await iterator.next();
        if (next.done) break;
        if (next.value.length > 0) yield { type: "delta", text: next.value };
      }
      yield { type: "done" };
    } catch (error) {
      if (signal.aborted) return;
      yield errorEvent(error);
    } finally {
      await iterator.return(undefined);
    }
    return;
  }

  if (signal.aborted) return;
  yield { type: "meta", modelId, modelLabel: requested?.label ?? modelId };
  yield errorEvent(lastError);
}
