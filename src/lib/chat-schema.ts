import { z } from "zod";
import type { Conversation } from "@/lib/chat-types";
import { MAX_MODEL_NAME_LENGTH, MODEL_NAME_PATTERN } from "@/lib/model-name";

const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
  status: z.enum(["streaming", "complete", "interrupted", "error"]),
  error: z.string().optional(),
  errorCode: z.enum(["upstream", "timeout", "network", "config", "format", "aborted"]).optional(),
  modelLabel: z.string().optional(),
  modelName: z.string().max(MAX_MODEL_NAME_LENGTH).optional(),
  fallbackFromLabel: z.string().optional(),
});

const conversationSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  modelId: z.string().min(1),
  // Optional so files exported before this field existed still import cleanly.
  customModel: z.string().max(MAX_MODEL_NAME_LENGTH).regex(MODEL_NAME_PATTERN).optional(),
  system: z.string(),
  messages: z.array(messageSchema),
});

export const exportFileSchema = z.object({
  app: z.literal("ai-gateway"),
  version: z.literal(1),
  exportedAt: z.string(),
  conversations: z.array(conversationSchema),
});

export const persistedStateSchema = z.object({
  conversations: z.array(conversationSchema),
  activeId: z.string().nullable(),
});

/** A reload in the middle of a stream leaves a dangling status; store it as interrupted. */
export function normalizeConversations(conversations: Conversation[]): Conversation[] {
  return conversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) =>
      message.status === "streaming" ? { ...message, status: "interrupted" as const } : message,
    ),
  }));
}
