/**
 * Wire protocol between the Vercel route handler and the browser.
 * One JSON object per line (NDJSON) so chunks survive proxies that buffer SSE comments.
 */
export type StreamEvent =
  | {
      type: "meta";
      modelId: string;
      modelLabel: string;
      fallbackFrom?: { modelId: string; modelLabel: string };
    }
  | { type: "delta"; text: string }
  | { type: "done" }
  | {
      type: "error";
      message: string;
      code: "upstream" | "timeout" | "network" | "config" | "format" | "aborted";
    };

export type ChatRole = "user" | "assistant";

export type ChatMessageInput = {
  role: ChatRole;
  content: string;
};
