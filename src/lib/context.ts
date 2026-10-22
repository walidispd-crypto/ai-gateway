import type { ChatMessageInput } from "@/lib/protocol";
import type { ChatMessage } from "@/lib/chat-types";

export type ContextSelection = {
  messages: ChatMessageInput[];
  droppedCount: number;
};

function usableMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.content.trim().length > 0);
}

/**
 * Keeps the newest turns that fit the model budget and drops older ones.
 * The last message is always kept so a single huge paste still reaches the model,
 * and the slice is shifted to start with a user turn.
 */
export function selectContext(
  messages: ChatMessage[],
  system: string | undefined,
  maxContextChars: number,
): ContextSelection {
  const usable = usableMessages(messages);
  const budget = Math.max(0, maxContextChars - (system?.length ?? 0));

  let total = 0;
  let start = usable.length;
  for (let index = usable.length - 1; index >= 0; index -= 1) {
    const size = usable[index]!.content.length;
    if (total + size > budget && start < usable.length - 1) break;
    total += size;
    start = index;
  }

  while (start < usable.length && usable[start]!.role !== "user") start += 1;

  return {
    messages: usable
      .slice(start)
      .map((message) => ({ role: message.role, content: message.content })),
    droppedCount: start,
  };
}

export function defaultContextLimit(maxContextChars: number | undefined): number {
  return maxContextChars && maxContextChars > 0 ? maxContextChars : 32_000;
}
