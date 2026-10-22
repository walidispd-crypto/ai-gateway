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
  fallbackFromLabel?: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  modelId: string;
  system: string;
  messages: ChatMessage[];
};

export const DEFAULT_TITLE = "Percakapan baru";
