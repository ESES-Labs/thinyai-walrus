import { describe, it, expect, vi } from "vitest";
import { scriptModel } from "@thiny/eval";
import { inMemoryPointerStore, type WalrusClient, type WalrusBlobRef } from "@thiny/walrus";
import { createWalrusDemoAgent } from "../agent.js";

/** In-memory Walrus stand-in: content-addresses by index, round-trips bytes. */
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

function suiFetch(checkpoint: string): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify({ result: checkpoint }), { status: 200 }));
}

/** Model that reads Sui status then answers — exercises the full tool loop. */
function watchModel() {
  return scriptModel([
    { finishReason: "tool_calls", toolCalls: [{ id: "1", name: "check_sui_status", args: {} }] },
    { finishReason: "stop", text: "Checkpoint observed; advanced since last tick." },
  ]);
}

describe("createWalrusDemoAgent", () => {
  it("runs a tick: calls the tool, persists memory + audit + artifact to Walrus", async () => {
    const memory: WalrusBlobRef[] = [];
    const audit: WalrusBlobRef[] = [];
    const artifacts: WalrusBlobRef[] = [];

    const { agent, sessionId } = await createWalrusDemoAgent({
      model: watchModel(),
      walrus: fakeWalrus(),
      pointers: inMemoryPointerStore(),
      suiFetch: suiFetch("12345"),
      onMemory: (r) => memory.push(r),
      onAudit: (r) => audit.push(r),
      onArtifact: (r) => artifacts.push(r),
    });

    const reply = await agent.run("tick", { sessionId });

    expect(reply).toContain("Checkpoint");
    expect(memory).toHaveLength(1); // transcript persisted
    expect(audit).toHaveLength(1); // action log flushed (model_call + tool_call captured)
    expect(artifacts).toHaveLength(1); // report stored
    expect(artifacts[0]?.blobId).toMatch(/^blob-/);
  });

  it("recalls prior ticks from the same session (cross-tick memory)", async () => {
    const walrus = fakeWalrus();
    const pointers = inMemoryPointerStore();

    const first = await createWalrusDemoAgent({
      model: watchModel(),
      walrus,
      pointers,
      suiFetch: suiFetch("100"),
    });
    await first.agent.run("tick 1", { sessionId: first.sessionId });

    // A fresh agent instance (simulating a restart) sharing the same Walrus + pointer store
    // must load the prior transcript rather than starting empty.
    const restarted = await createWalrusDemoAgent({
      model: watchModel(),
      walrus,
      pointers,
      suiFetch: suiFetch("105"),
    });
    const blobId = await pointers.get(restarted.sessionId);
    expect(blobId).toBeDefined();
    const loaded = await walrus.getBlob(blobId ?? "");
    const transcript = JSON.parse(new TextDecoder().decode(loaded)) as unknown[];
    expect(transcript.length).toBeGreaterThan(0); // prior tick survived the "restart"
  });
});
