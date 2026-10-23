import { get, set } from "idb-keyval";

/**
 * Which file panel is open and which tab is active, remembered per conversation. Kept in its own
 * IndexedDB entry so the conversation record (and the export schema) stays untouched.
 */
export type FilePanelEntry = {
  open: boolean;
  name: string | null;
};

export type FilePanelMap = Record<string, FilePanelEntry>;

const STORAGE_KEY = "ai-gateway:file-panel:v1";
const MAX_ENTRIES = 80;
const MAX_NAME_LENGTH = 200;

function sanitizeEntry(raw: unknown): FilePanelEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = raw as { open?: unknown; name?: unknown };
  if (typeof entry.open !== "boolean") return null;
  const name =
    typeof entry.name === "string" && entry.name.length > 0
      ? entry.name.slice(0, MAX_NAME_LENGTH)
      : null;
  return { open: entry.open, name };
}

function sanitize(raw: unknown): FilePanelMap {
  if (typeof raw !== "object" || raw === null) return {};
  const clean: FilePanelMap = {};
  for (const [conversationId, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = sanitizeEntry(value);
    if (entry) clean[conversationId] = entry;
  }
  return clean;
}

export async function loadFilePanelState(): Promise<FilePanelMap> {
  try {
    return sanitize(await get(STORAGE_KEY));
  } catch {
    return {};
  }
}

export async function saveFilePanelState(state: FilePanelMap): Promise<void> {
  const entries = Object.entries(state).slice(-MAX_ENTRIES);
  try {
    await set(STORAGE_KEY, Object.fromEntries(entries));
  } catch {
    // Private mode or quota errors must not break the chat.
  }
}
