import type { StreamEvent } from "@/lib/protocol";

export type UpstreamErrorCode = Extract<StreamEvent, { type: "error" }>["code"];

/** Messages are user-facing: they must never contain Worker URLs, tokens, or raw bodies. */
export class UpstreamError extends Error {
  readonly code: UpstreamErrorCode;

  constructor(code: UpstreamErrorCode, message: string) {
    super(message);
    this.name = "UpstreamError";
    this.code = code;
  }
}

export function errorEvent(error: unknown): Extract<StreamEvent, { type: "error" }> {
  if (error instanceof UpstreamError) {
    return { type: "error", message: error.message, code: error.code };
  }
  return {
    type: "error",
    message: "Terjadi kesalahan tak terduga saat menghubungi model.",
    code: "upstream",
  };
}
