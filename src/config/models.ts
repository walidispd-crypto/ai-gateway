export type ModelFormat = "openai" | "sse-text" | "json-text";

export type ModelConfig = {
  id: string;
  label: string;
  description?: string;
  endpointEnv: string;
  tokenEnv?: string;
  format: ModelFormat;
  supportsSystemPrompt: boolean;
  maxContextChars?: number;
  tags?: ("code" | "general" | "fast" | "reasoning")[];
  /** Wall-clock budget for headers + first token. Defaults to 60s. */
  timeoutMs?: number;
  /** Maximum silence between two stream chunks. Defaults to 30s. */
  idleTimeoutMs?: number;
  /** Model id to try when the primary fails before its first token. */
  fallbackId?: string;
  /** Sent as `model` for OpenAI-format Workers; omit when the Worker ignores it. */
  upstreamModel?: string;
};

// TODO(owner): point the env vars below at your Workers and set `format` to match each
// Worker's response contract (README, "Kontrak endpoint"). Remove entries you do not use.
export const MODELS: ModelConfig[] = [
  {
    id: "coder-fast",
    label: "Coder Fast",
    description: "Cepat, untuk snippet dan perbaikan kecil",
    endpointEnv: "WORKER_CODER_FAST_URL",
    tokenEnv: "WORKER_CODER_FAST_TOKEN",
    format: "openai",
    supportsSystemPrompt: true,
    maxContextChars: 48_000,
    tags: ["code", "fast"],
    fallbackId: "coder-deep",
  },
  {
    id: "coder-deep",
    label: "Coder Deep",
    description: "Lebih lambat, untuk refactor dan penalaran",
    endpointEnv: "WORKER_CODER_DEEP_URL",
    tokenEnv: "WORKER_CODER_DEEP_TOKEN",
    format: "sse-text",
    supportsSystemPrompt: true,
    maxContextChars: 120_000,
    tags: ["code", "reasoning"],
  },
  {
    id: "general",
    label: "General",
    description: "Pertanyaan umum, menulis, dan analisis",
    endpointEnv: "WORKER_GENERAL_URL",
    tokenEnv: "WORKER_GENERAL_TOKEN",
    format: "json-text",
    supportsSystemPrompt: true,
    maxContextChars: 24_000,
    tags: ["general"],
  },
];

export const DEFAULT_MODEL_ID = "coder-fast";

export type PublicModel = Pick<
  ModelConfig,
  "id" | "label" | "description" | "tags" | "maxContextChars"
>;

export function findModel(id: string): ModelConfig | undefined {
  return MODELS.find((model) => model.id === id);
}
