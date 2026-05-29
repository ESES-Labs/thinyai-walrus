import { generateText, streamText, type LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelProvider, Message, ModelResponse, Tool, FinishReason, StreamEvent } from "@thiny/core";
import { toCoreMessages, toAiTools } from "./convert.js";

function mapFinish(reason: string): FinishReason {
  if (reason === "tool-calls") return "tool_calls";
  if (reason === "length")     return "length";
  if (reason === "error")      return "error";
  return "stop";
}

export interface AiSdkOptions {
  /** A LanguageModel from any @ai-sdk provider, or "provider:model-id" shorthand. */
  model: LanguageModel | string;
  maxRetries?: number;
}

function resolveModel(model: LanguageModel | string): LanguageModel {
  if (typeof model !== "string") return model;
  const [provider, ...rest] = model.split(":");
  const id = rest.join(":");
  if (provider === "openai")     return openai(id);
  if (provider === "anthropic")  return anthropic(id);
  throw new Error(`unknown model provider: ${provider} — use "openai:..." or "anthropic:..."`);
}

export function aiSdkModel(opts: AiSdkOptions): ModelProvider {
  const model = resolveModel(opts.model);

  return {
    async generate(messages: Message[], tools: Tool[]): Promise<ModelResponse> {
      const result = await generateText({
        model,
        messages: toCoreMessages(messages),
        tools:      tools.length ? toAiTools(tools) : undefined,
        toolChoice: tools.length ? "auto"           : undefined,
        maxRetries: opts.maxRetries ?? 2,
      });
      return {
        text: result.text || undefined,
        toolCalls: result.toolCalls?.map((tc) => ({
          id:   tc.toolCallId,
          name: tc.toolName,
          args: tc.args,
        })),
        finishReason: mapFinish(result.finishReason),
        usage: result.usage
          ? { inputTokens: result.usage.promptTokens, outputTokens: result.usage.completionTokens }
          : undefined,
      };
    },

    async *stream(messages: Message[], tools: Tool[]): AsyncGenerator<StreamEvent> {
      const result = streamText({
        model,
        messages:   toCoreMessages(messages),
        tools:      tools.length ? toAiTools(tools) : undefined,
        toolChoice: tools.length ? "auto"           : undefined,
        maxRetries: opts.maxRetries ?? 2,
      });
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          yield { type: "text-delta", text: part.textDelta };
        } else if (part.type === "tool-call") {
          yield { type: "tool-call", toolCall: { id: part.toolCallId, name: part.toolName, args: part.args } };
        } else if (part.type === "finish") {
          yield {
            type: "finish",
            finishReason: mapFinish(part.finishReason),
            usage: part.usage
              ? { inputTokens: part.usage.promptTokens, outputTokens: part.usage.completionTokens }
              : undefined,
          };
        }
      }
    },
  };
}
