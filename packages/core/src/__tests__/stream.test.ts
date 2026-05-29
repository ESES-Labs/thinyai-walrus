import { describe, it, expect } from "vitest";
import { assembleStream } from "../stream.js";
import type { StreamEvent } from "../domain/stream.js";

async function* makeStream(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const ev of events) yield ev;
}

describe("assembleStream", () => {
  it("collects text deltas into final text", async () => {
    const textDeltas: string[] = [];
    const result = await assembleStream(
      makeStream([
        { type: "text-delta", text: "Hello" },
        { type: "text-delta", text: " " },
        { type: "text-delta", text: "World" },
        { type: "finish", finishReason: "stop" },
      ]),
      (delta) => textDeltas.push(delta),
    );
    expect(result.text).toBe("Hello World");
    expect(result.finishReason).toBe("stop");
    expect(textDeltas).toEqual(["Hello", " ", "World"]);
  });

  it("collects tool-call events", async () => {
    const result = await assembleStream(
      makeStream([
        { type: "tool-call", toolCall: { id: "1", name: "echo", args: { text: "hi" } } },
        { type: "finish", finishReason: "tool_calls" },
      ]),
    );
    expect(result.toolCalls).toHaveLength(1);
    const firstCall = result.toolCalls?.at(0);
    expect(firstCall?.name).toBe("echo");
    expect(result.finishReason).toBe("tool_calls");
  });

  it("returns undefined text when only tool calls", async () => {
    const result = await assembleStream(
      makeStream([
        { type: "tool-call", toolCall: { id: "1", name: "search", args: { q: "x" } } },
        { type: "finish", finishReason: "tool_calls" },
      ]),
    );
    expect(result.text).toBeUndefined();
    expect(result.toolCalls).toHaveLength(1);
  });

  it("returns usage from the finish event", async () => {
    const result = await assembleStream(
      makeStream([
        { type: "text-delta", text: "ok" },
        {
          type: "finish",
          finishReason: "stop",
          usage: { inputTokens: 50, outputTokens: 10 },
        },
      ]),
    );
    expect(result.usage).toEqual({ inputTokens: 50, outputTokens: 10 });
  });

  it("works without onText callback", async () => {
    const result = await assembleStream(
      makeStream([
        { type: "text-delta", text: "silent" },
        { type: "finish", finishReason: "stop" },
      ]),
    );
    expect(result.text).toBe("silent");
  });
});
