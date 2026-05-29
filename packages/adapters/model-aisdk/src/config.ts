import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { aiSdkModel, type AiSdkOptions } from "./index.js";
import type { ModelProvider } from "@thiny/core";

/**
 * Shape of thiny.config.json.
 * Any value can be a literal or an "env:VAR_NAME" reference resolved at load time.
 */
export interface ThinyConfig {
  /** Model string: "openai:gpt-4o-mini", "anthropic:...", "openai-compat:..." */
  model?: string;
  openai?: { baseURL?: string; apiKey?: string };
  anthropic?: { baseURL?: string; apiKey?: string };
  maxRetries?: number;
}

/**
 * Resolve an "env:VAR_NAME" reference, or return the value unchanged.
 * Keeps secrets out of committed config files.
 */
function resolveConfigValue(value: string | undefined): string | undefined {
  if (!value) return value;
  if (value.startsWith("env:")) return process.env[value.slice(4)];
  return value;
}

/**
 * Resolve a provider options block from the config file,
 * expanding any "env:" references and returning undefined if the block is empty.
 */
function resolveProviderOptions(
  options: { baseURL?: string; apiKey?: string } | undefined,
): { baseURL?: string; apiKey?: string } | undefined {
  if (!options) return undefined;
  const resolved = {
    baseURL: resolveConfigValue(options.baseURL),
    apiKey: resolveConfigValue(options.apiKey),
  };
  if (!resolved.baseURL && !resolved.apiKey) return undefined;
  return resolved;
}

/**
 * Load a thiny.config.json file and return a ModelProvider.
 * Environment variables override config file values (same resolution order as modelFromEnv).
 *
 * Config file lookup order:
 *   1. Explicit path passed to loadThinyConfig()
 *   2. ./thiny.config.json  (current working directory)
 *   3. Falls back to env-only resolution if no config file is found
 *
 * @example thiny.config.json
 * ```json
 * {
 *   "model": "openai-compat:llama3",
 *   "openai": { "baseURL": "http://localhost:11434/v1", "apiKey": "ollama" }
 * }
 * ```
 *
 * @example with env references (keeps secrets out of the config file)
 * ```json
 * { "model": "openai:gpt-4o-mini", "openai": { "apiKey": "env:OPENAI_API_KEY" } }
 * ```
 */
export function loadThinyConfig(configPath?: string): ModelProvider {
  const candidates = configPath
    ? [configPath]
    : [resolve(process.cwd(), "thiny.config.json"), resolve(process.cwd(), ".thinyrc.json")];

  let fileConfig: ThinyConfig = {};
  for (const candidatePath of candidates) {
    if (existsSync(candidatePath)) {
      try {
        fileConfig = JSON.parse(readFileSync(candidatePath, "utf8")) as ThinyConfig;
        break;
      } catch (err: unknown) {
        throw new Error(
          `failed to parse Thiny config at ${candidatePath}: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    }
  }

  // Env vars take precedence over config file values
  const model =
    process.env.THINY_MODEL ?? process.env.AGENT_MODEL ?? fileConfig.model ?? "openai:gpt-4o-mini";

  const openaiFromEnv = {
    baseURL: process.env.THINY_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL,
    apiKey: process.env.THINY_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
  };
  const anthropicFromEnv = {
    baseURL: process.env.THINY_ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL,
    apiKey: process.env.THINY_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
  };

  const openaiFromFile = resolveProviderOptions(fileConfig.openai);
  const anthropicFromFile = resolveProviderOptions(fileConfig.anthropic);

  const adapterOptions: AiSdkOptions = { model, maxRetries: fileConfig.maxRetries };

  const openai = {
    baseURL: openaiFromEnv.baseURL ?? openaiFromFile?.baseURL,
    apiKey: openaiFromEnv.apiKey ?? openaiFromFile?.apiKey,
  };
  if (openai.baseURL ?? openai.apiKey) adapterOptions.openai = openai;

  const anthropic = {
    baseURL: anthropicFromEnv.baseURL ?? anthropicFromFile?.baseURL,
    apiKey: anthropicFromEnv.apiKey ?? anthropicFromFile?.apiKey,
  };
  if (anthropic.baseURL ?? anthropic.apiKey) adapterOptions.anthropic = anthropic;

  return aiSdkModel(adapterOptions);
}

/** Re-export so callers only need one import. */
export { modelFromEnv } from "./env.js";
