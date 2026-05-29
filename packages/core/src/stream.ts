import type { StreamEvent } from "./domain/stream.js";
import type { ModelResponse, ToolCall, FinishReason, Usage } from "./domain/messages.js";

/** Drain a provider stream into a ModelResponse, emitting text deltas via onText. */
export async function assembleStream(
  stream: AsyncIterable<StreamEvent>,
  onText?: (delta: string) => void,
): Promise<ModelResponse> {
  let text = "";
  const toolCalls: ToolCall[] = [];
  let finishReason: FinishReason = "stop";
  let usage: Usage | undefined;

  for await (const ev of stream) {
    if (ev.type === "text-delta") {
      text += ev.text;
      onText?.(ev.text);
    } else if (ev.type === "tool-call") {
      toolCalls.push(ev.toolCall);
    } else {
      finishReason = ev.finishReason;
      usage = ev.usage;
    }
  }

  return {
    text: text || undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    finishReason,
    usage,
  };
}
