import { generateText, streamText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type {
  ModelProvider,
  Message,
  ModelResponse,
  Tool,
  FinishReason,
  StreamEvent,
  Usage,
  ToolChoice,
} from "@thiny/core";
import { toCoreMessages, toAiTools } from "./convert.js";

// Re-export dynamic factories so callers only need one import.
export { modelFromEnv } from "./env.js";
export { ENV_KEYS, readEnvKey } from "./env-keys.js";
export { loadThinyConfig, readThinyConfig, type ThinyConfig } from "./config.js";

/** Map AI SDK finish reasons to Thiny's normalised FinishReason. */
function toFinishReason(reason: string): FinishReason {
  if (reason === "tool-calls") return "tool_calls";
  if (reason === "length") return "length";
  if (reason === "error") return "error";
  return "stop";
}

/** Normalise an AI SDK usage object to Thiny's Usage shape. */
function normalizeUsage(
  usage: { promptTokens: number; completionTokens: number } | undefined,
): Usage | undefined {
  if (!usage) return undefined;
  return { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens };
}

type AiToolChoice =
  | "auto"
  | "required"
  | { type: "tool"; toolName: string };

function toAiToolChoice(choice: ToolChoice | undefined): AiToolChoice {
  if (choice === "required") return "required";
  if (choice && typeof choice === "object") return { type: "tool", toolName: choice.tool };
  return "auto";
}

/** Build the tool-related fields shared by generateText and streamText. */
function buildToolOptions(tools: Tool[], choice?: ToolChoice) {
  if (tools.length === 0) return { tools: undefined, toolChoice: undefined };
  return { tools: toAiTools(tools), toolChoice: toAiToolChoice(choice) };
}

/** Per-provider connection options. */
export interface ProviderOptions {
  /** Custom base URL — point at any compatible endpoint (Ollama, Together, Groq, etc.). */
  baseURL?: string;
  /** API key override. Falls back to the provider's default env var when omitted. */
  apiKey?: string;
}

export interface AiSdkOptions {
  /**
   * Which model to use. Four forms:
   *
   * 1. **Bare model ID** (simplest) — `"gpt-4o-mini"`, `"mimo-v2.5-pro"`, `"llama3"`
   *    Provider is auto-detected: if `openai.baseURL` is set → OpenAI-compatible;
   *    if `anthropic.baseURL` is set → Anthropic-compatible; otherwise → standard OpenAI.
   *
   * 2. **Prefixed string** — `"openai:gpt-4o-mini"` / `"anthropic:claude-haiku-4-5-20251001"`
   *    Explicit provider, no base URL needed for the official APIs.
   *
   * 3. **Compat prefix** — `"openai-compat:model-id"` + `openai.baseURL`
   *    For any OpenAI-compatible endpoint (Ollama, Groq, Mimo, etc.).
   *    Equivalent to form 1 when `openai.baseURL` is set.
   *
   * 4. **Pre-built instance** — pass a `LanguageModel` from any `@ai-sdk/*` package directly.
   */
  model: LanguageModel | string;

  /**
   * OpenAI connection options.
   * Set `baseURL` to use any OpenAI-compatible endpoint:
   *   - Ollama:      `http://localhost:11434/v1`
   *   - LM Studio:   `http://localhost:1234/v1`
   *   - Groq:        `https://api.groq.com/openai/v1`
   *   - Together:    `https://api.together.xyz/v1`
   *   - OpenRouter:  `https://openrouter.ai/api/v1`
   *   - Azure OpenAI, any self-hosted vLLM / llama.cpp server
   */
  openai?: ProviderOptions;

  /**
   * Anthropic connection options.
   * Set `baseURL` to route through a proxy or a compatible backend.
   */
  anthropic?: ProviderOptions;

  maxRetries?: number;
}

const KNOWN_PROVIDERS = new Set(["openai", "openai-compat", "anthropic"]);

function resolveModel(model: LanguageModel | string, opts: AiSdkOptions): LanguageModel {
  if (typeof model !== "string") return model;

  // Treat the text before the first colon as a provider ONLY when it's one we recognise.
  // Otherwise the whole string is a bare model id — crucially, ids may contain colons
  // (e.g. Ollama's "gpt-oss:120b", "llama3:8b"), which must NOT be split into provider:id.
  const colonIdx = model.indexOf(":");
  const prefix = colonIdx === -1 ? "" : model.slice(0, colonIdx);

  if (KNOWN_PROVIDERS.has(prefix)) {
    const modelId = model.slice(colonIdx + 1);
    if (prefix === "anthropic") {
      return createAnthropic({ baseURL: opts.anthropic?.baseURL, apiKey: opts.anthropic?.apiKey })(
        modelId,
      );
    }
    return createOpenAI({ baseURL: opts.openai?.baseURL, apiKey: opts.openai?.apiKey })(modelId);
  }

  // ── Bare model ID ─────────────────────────────────────────────────────────
  // Auto-detect the provider from whichever base URL is configured:
  //   - THINY_OPENAI_BASE_URL set    → OpenAI-compatible endpoint (Ollama, Groq, vLLM, …)
  //   - THINY_ANTHROPIC_BASE_URL set → Anthropic-compatible endpoint
  //   - Neither set                  → standard OpenAI (default)
  if (opts.anthropic?.baseURL) {
    return createAnthropic({ baseURL: opts.anthropic.baseURL, apiKey: opts.anthropic.apiKey })(
      model,
    );
  }
  return createOpenAI({ baseURL: opts.openai?.baseURL, apiKey: opts.openai?.apiKey })(model);
}

/**
 * Create a `ModelProvider` backed by the Vercel AI SDK.
 *
 * Supports all `@ai-sdk/*` providers and any OpenAI-compatible or
 * Anthropic-compatible endpoint via `baseURL` override.
 * Both blocking (`generate`) and streaming (`stream`) are implemented.
 *
 * For env-driven configuration, prefer `modelFromEnv()` or `loadThinyConfig()`.
 *
 * @example
 * ```ts
 * aiSdkModel({ model: "openai:gpt-4o-mini" })
 * aiSdkModel({ model: "openai-compat:llama3", openai: { baseURL: "http://localhost:11434/v1" } })
 * ```
 */
export function aiSdkModel(opts: AiSdkOptions): ModelProvider {
  const model = resolveModel(opts.model, opts);
  const maxRetries = opts.maxRetries ?? 2;

  return {
    async generate(
      messages: Message[],
      tools: Tool[],
      signal?: AbortSignal,
      toolChoice?: ToolChoice,
    ): Promise<ModelResponse> {
      const result = await generateText({
        model,
        messages: toCoreMessages(messages),
        ...buildToolOptions(tools, toolChoice),
        maxRetries,
        abortSignal: signal,
      });
      return {
        text: result.text || undefined,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        toolCalls: result.toolCalls?.map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          args: tc.args as Record<string, unknown>,
        })),
        finishReason: toFinishReason(result.finishReason),

        usage: normalizeUsage(result.usage),
      };
    },

    async *stream(
      messages: Message[],
      tools: Tool[],
      signal?: AbortSignal,
      toolChoice?: ToolChoice,
    ): AsyncGenerator<StreamEvent> {
      const result = streamText({
        model,
        messages: toCoreMessages(messages),
        ...buildToolOptions(tools, toolChoice),
        maxRetries,
        abortSignal: signal,
      });
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          yield { type: "text-delta", text: part.textDelta };
        } else if (part.type === "error") {
          // The AI SDK reports API failures (bad model, bad key, rate limit, network) as an
          // `error` part on fullStream rather than rejecting — surface it instead of ending the
          // stream silently, which otherwise looks like an empty model response.
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        } else if (part.type === "tool-call") {
          yield {
            type: "tool-call",
            toolCall: {
              id: part.toolCallId,
              name: part.toolName,
              args: part.args as Record<string, unknown>,
            },
          };
        } else if (part.type === "finish") {
          yield {
            type: "finish",
            finishReason: toFinishReason(part.finishReason),

            usage: normalizeUsage(part.usage),
          };
        }
      }
    },
  };
}
