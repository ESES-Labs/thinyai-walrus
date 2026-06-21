import { describe, it, expect } from "vitest";
import { createAgent, type Message, type ModelProvider, type ModelResponse } from "@thiny/core";
import { walrusMemoryPlugin, inMemoryPointerStore, type WalrusClient } from "@thiny/walrus";

/** In-memory Walrus stand-in (no network). */
function fakeWalrus(): WalrusClient {
  const store = new Map<string, Uint8Array>();
  let n = 0;
  return {
    publisher: "http://fake",
    aggregator: "http://fake",
    network: "testnet",
    async putBlob(data) {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const id = `blob-${String(n++)}`;
      store.set(id, bytes);
      return { blobId: id };
    },
    async getBlob(blobId) {
      const b = store.get(blobId);
      if (!b) throw new Error(`not found: ${blobId}`);
      return b;
    },
  };
}

/** A model that records the messages it's given and replays scripted responses. */
function recordingModel(steps: ModelResponse[], seen: Message[][]): ModelProvider {
  let i = 0;
  return {
    generate: (messages) => {
      seen.push(messages);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return Promise.resolve(steps[Math.min(i++, steps.length - 1)]!);
    },
  };
}

const SYSTEM = "You have persistent memory on Walrus. Save durable facts with remember_fact.";

describe("cross-session memory on Walrus (CLI default wiring)", () => {
  it("remembers a fact from session A when asked in a fresh session B", async () => {
    const walrus = fakeWalrus();
    const pointers = inMemoryPointerStore(); // shared 'pointer store' across both sessions

    // ── Session A: user introduces themselves; the model saves a fact to Walrus. ──
    const seenA: Message[][] = [];
    const agentA = await createAgent({
      model: recordingModel(
        [
          {
            finishReason: "tool_calls",
            toolCalls: [
              { id: "1", name: "remember_fact", args: { fact: "User's name is Alice", kind: "fact" } },
            ],
          },
          { finishReason: "stop", text: "Nice to meet you, Alice!" },
        ],
        seenA,
      ),
      systemPrompt: SYSTEM,
      plugins: [walrusMemoryPlugin({ client: walrus, pointers, userId: "u1" })],
    });
    await agentA.run("Hi, I'm Alice.", { sessionId: "A" });

    // ── Session B: brand-new agent + session, same Walrus + pointer (a new terminal). ──
    const seenB: Message[][] = [];
    const agentB = await createAgent({
      model: recordingModel([{ finishReason: "stop", text: "Yes — you're Alice!" }], seenB),
      systemPrompt: SYSTEM,
      plugins: [walrusMemoryPlugin({ client: walrus, pointers, userId: "u1" })],
    });
    const reply = await agentB.run("Do you remember me?", { sessionId: "B" });

    // The plugin auto-injected the known fact into the messages the model saw.
    expect(JSON.stringify(seenB[0])).toContain("Alice");
    expect(reply).toBe("Yes — you're Alice!");
  });
});
