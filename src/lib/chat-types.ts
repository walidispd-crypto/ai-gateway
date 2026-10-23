export type MessageStatus = "streaming" | "complete" | "interrupted" | "error";

export type ErrorCode = "upstream" | "timeout" | "network" | "config" | "format" | "aborted";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status: MessageStatus;
  error?: string;
  errorCode?: ErrorCode;
  modelLabel?: string;
  /** Model name actually used upstream, as reported by the server's meta event. */
  modelName?: string;
  fallbackFromLabel?: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  modelId: string;
  /** Provider-side model name typed by the owner; empty means "use the entry's default". */
  customModel?: string;
  system: string;
  messages: ChatMessage[];
};

export const DEFAULT_TITLE = "Percakapan baru";
