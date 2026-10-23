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

// Tiga Worker = tiga penyedia. Nama variabel di Vercel harus sama persis dengan
// endpointEnv / tokenEnv di bawah ini.
export const MODELS: ModelConfig[] = [
  // Penyedia 1 (radox)
  {
    id: "luna",
    label: "GPT-5.6 Luna",
    description: "Penyedia 1 (radox)",
    endpointEnv: "WORKER_RADOX_URL",
    tokenEnv: "WORKER_RADOX_TOKEN",
    format: "openai",
    supportsSystemPrompt: true,
    upstreamModel: "gpt-5.6-luna",
    maxContextChars: 120_000,
    tags: ["general", "fast"],
    timeoutMs: 90_000,
    fallbackId: "glm-p2",
  },
  // Penyedia 2
  {
    id: "glm-p2",
    label: "GLM 5.3 (penyedia 2)",
    description: "Model reasoning, jawaban pertama bisa agak lama",
    endpointEnv: "WORKER_P2_URL",
    tokenEnv: "WORKER_P2_TOKEN",
    format: "openai",
    supportsSystemPrompt: true,
    upstreamModel: "glm-5.3",
    maxContextChars: 120_000,
    tags: ["general", "reasoning"],
    timeoutMs: 90_000,
    fallbackId: "glm-p3",
  },
  // Penyedia 3
  {
    id: "glm-p3",
    label: "glm-5.3 (penyedia 3)",
    description: "Penyedia 3, belum terverifikasi",
    endpointEnv: "WORKER_P3_URL",
    tokenEnv: "WORKER_P3_TOKEN",
    format: "openai",
    supportsSystemPrompt: true,
    upstreamModel: "glm-5.3",
    maxContextChars: 120_000,
    tags: ["general", "reasoning"],
    timeoutMs: 90_000,
  },
];

export const DEFAULT_MODEL_ID = "glm-p2";

export type PublicModel = Pick<
  ModelConfig,
  "id" | "label" | "description" | "tags" | "maxContextChars"
>;

export function findModel(id: string): ModelConfig | undefined {
  return MODELS.find((model) => model.id === id);
}
