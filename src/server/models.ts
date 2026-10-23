import { findModel, type ModelConfig } from "@/config/models";
import { UpstreamError } from "@/server/errors";

export type ResolvedModel = {
  config: ModelConfig;
  url: string;
  token?: string;
  timeoutMs: number;
  idleTimeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

/**
 * Chooses the `model` value sent to the Worker. The owner's custom name only applies to the
 * requested provider in the OpenAI format; a fallback keeps its own catalogue entry because the
 * custom name belongs to the primary provider and would likely not exist elsewhere.
 */
export function effectiveUpstreamModel(
  config: ModelConfig,
  customModel: string | undefined,
  isFallback: boolean,
): string | undefined {
  if (customModel && !isFallback && config.format === "openai") return customModel;
  return config.upstreamModel;
}

export function resolveModel(modelId: string): ResolvedModel {
  const config = findModel(modelId);
  if (!config) {
    throw new UpstreamError("config", "Model tidak dikenal.");
  }

  const url = process.env[config.endpointEnv];
  if (!url) {
    throw new UpstreamError("config", `URL Worker untuk ${config.label} belum diatur di server.`);
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new UpstreamError("config", `URL Worker untuk ${config.label} tidak valid.`);
  }

  const token = config.tokenEnv ? process.env[config.tokenEnv] : undefined;

  return {
    config,
    url,
    token,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    idleTimeoutMs: config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
  };
}
