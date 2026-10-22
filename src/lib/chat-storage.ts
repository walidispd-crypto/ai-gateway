import { get, set } from "idb-keyval";
import type { Conversation } from "@/lib/chat-types";

const STORAGE_KEY = "ai-gateway:state:v1";
const SAVE_DEBOUNCE_MS = 400;

export type PersistedChatState = {
  conversations: Conversation[];
  activeId: string | null;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: PersistedChatState | null = null;

export async function loadChatState(): Promise<PersistedChatState | null> {
  let raw: unknown;
  try {
    raw = await get(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === undefined) return null;

  const { persistedStateSchema, normalizeConversations } = await import("@/lib/chat-schema");
  const parsed = persistedStateSchema.safeParse(raw);
  if (!parsed.success) return null;

  return {
    conversations: normalizeConversations(parsed.data.conversations),
    activeId: parsed.data.activeId,
  };
}

async function writeNow(): Promise<void> {
  if (!pendingState) return;
  const state = pendingState;
  pendingState = null;
  try {
    await set(STORAGE_KEY, state);
  } catch {
    // Storage can be unavailable (private mode, quota). The in-memory session keeps working.
  }
}

export function scheduleSave(state: PersistedChatState): void {
  pendingState = state;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void writeNow();
  }, SAVE_DEBOUNCE_MS);
}

/** Called on pagehide so the last tokens are not lost when the tab closes. */
export function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  void writeNow();
}
