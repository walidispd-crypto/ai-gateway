import { get, set } from "idb-keyval";
import { z } from "zod";
import { isValidModelName, normalizeModelName } from "@/lib/model-name";

const STORAGE_KEY = "ai-gateway:model-suggestions:v1";
const MAX_PER_PROVIDER = 20;

/** Provider id -> model names the owner has saved, newest first. */
export type ModelSuggestions = Record<string, string[]>;

const suggestionsSchema = z.record(z.array(z.string()));

function sanitize(raw: unknown): ModelSuggestions {
  const parsed = suggestionsSchema.safeParse(raw);
  if (!parsed.success) return {};

  const clean: ModelSuggestions = {};
  for (const [providerId, names] of Object.entries(parsed.data)) {
    const seen = new Set<string>();
    const valid = names.filter((name) => {
      if (!isValidModelName(name) || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    if (valid.length > 0) clean[providerId] = valid.slice(0, MAX_PER_PROVIDER);
  }
  return clean;
}

export async function loadModelSuggestions(): Promise<ModelSuggestions> {
  try {
    return sanitize(await get(STORAGE_KEY));
  } catch {
    return {};
  }
}

async function write(suggestions: ModelSuggestions): Promise<ModelSuggestions> {
  const clean = sanitize(suggestions);
  try {
    await set(STORAGE_KEY, clean);
  } catch {
    // Private mode or quota errors must not block saving the conversation itself.
  }
  return clean;
}

export async function saveModelSuggestion(
  providerId: string,
  name: string,
): Promise<ModelSuggestions> {
  const cleanName = normalizeModelName(name);
  const current = await loadModelSuggestions();
  if (!isValidModelName(cleanName)) return current;

  const existing = (current[providerId] ?? []).filter((entry) => entry !== cleanName);
  const next: ModelSuggestions = {
    ...current,
    [providerId]: [cleanName, ...existing].slice(0, MAX_PER_PROVIDER),
  };
  return write(next);
}

export async function deleteModelSuggestion(
  providerId: string,
  name: string,
): Promise<ModelSuggestions> {
  const current = await loadModelSuggestions();
  const remaining = (current[providerId] ?? []).filter((entry) => entry !== name);
  const next: ModelSuggestions = { ...current };
  if (remaining.length > 0) next[providerId] = remaining;
  else delete next[providerId];
  return write(next);
}
