import { describe, it, expect, vi } from "vitest";
import type { Logger } from "@thiny/core";
import type { Message } from "@thiny/core";
import {
  walrusClient,
  walrusAuditLogger,
  verifyAuditTrail,
  walrusArtifacts,
  walrusMemory,
  walrusMemoryPlugin,
  inMemoryPointerStore,
  moveObjectPointerStore,
  explorerLinks,
  walruscanBlobUrl,
  type WalrusClient,
  type WalrusBlobRef,
  type WalrusMemoryRef,
  type WalrusFacts,
  type MemoryHeadLike,
} from "../index.js";

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

function nullLogger(): Logger {
  const l: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => l,
  };
  return l;
}

describe("walrusClient", () => {
  it("returns a verifiable ref from newlyCreated (blobId + objectId) and round-trips bytes", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response(
          JSON.stringify({
            newlyCreated: {
              blobObject: { id: "0xobj", blobId: "abc123", storage: { endEpoch: 42 } },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(new TextEncoder().encode("hello"), { status: 200 });
    }) as unknown as typeof fetch;

    const client = walrusClient({ fetchImpl });
    const ref = await client.putBlob("hello");
    expect(ref).toEqual({ blobId: "abc123", objectId: "0xobj", txDigest: undefined, endEpoch: 42 });
    expect(new TextDecoder().decode(await client.getBlob(ref.blobId))).toBe("hello");
  });

  it("extracts txDigest from alreadyCertified", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ alreadyCertified: { blobId: "dup", event: { txDigest: "0xtx" } } }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
    const ref = await walrusClient({ fetchImpl }).putBlob("x");
    expect(ref.blobId).toBe("dup");
    expect(ref.txDigest).toBe("0xtx");
  });

  it("throws on non-OK PUT", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("boom", { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(walrusClient({ fetchImpl }).putBlob("x")).rejects.toThrow(/HTTP 500/);
  });
});

describe("explorerLinks", () => {
  it("builds Walruscan + Suiscan URLs for what's available", () => {
    const ref: WalrusBlobRef = { blobId: "B", objectId: "O", txDigest: "T" };
    expect(explorerLinks(ref, "testnet")).toEqual({
      blob: "https://walruscan.com/testnet/blob/B",
      object: "https://suiscan.xyz/testnet/object/O",
      tx: "https://suiscan.xyz/testnet/tx/T",
    });
    expect(explorerLinks({ blobId: "B" }).object).toBeUndefined();
    expect(walruscanBlobUrl("B", "mainnet")).toBe("https://walruscan.com/mainnet/blob/B");
  });
});

describe("walrusAuditLogger", () => {
  it("captures audit records, flushes to a blob, and verify replays them", async () => {
    const client = fakeWalrus();
    const log = walrusAuditLogger(nullLogger(), client, {
      sessionId: "s1",
      now: () => new Date("2026-06-21T00:00:00Z"),
    });

    log.info({ kind: "model_call", durationMs: 10 }, "model_call");
    log.info({ kind: "tool_call", tool: "evm_send_native", ok: true }, "tool_call");
    log.info({ hello: "world" }); // no kind/event → ignored

    expect(log.entries()).toHaveLength(2);

    const ref = await log.flush("turn-1");
    if (ref === null) throw new Error("expected a manifest blobId");

    const trail = await verifyAuditTrail(client, ref.blobId);
    expect(trail.sessionId).toBe("turn-1");
    expect(trail.count).toBe(2);
    expect(trail.entries[1]?.tool).toBe("evm_send_native");
  });

  it("reset() clears the buffer for a fresh per-turn batch", async () => {
    const log = walrusAuditLogger(nullLogger(), fakeWalrus(), { sessionId: "s1" });
    log.info({ kind: "tool_call", tool: "x" });
    expect(log.entries()).toHaveLength(1);
    log.reset();
    expect(log.entries()).toHaveLength(0);
    expect(await log.flush()).toBeNull();
  });

  it("child loggers share one trail", async () => {
    const log = walrusAuditLogger(nullLogger(), fakeWalrus(), { sessionId: "s1" });
    log.child({ sessionId: "s1" }).info({ kind: "tool_call", tool: "x" });
    expect(log.entries()).toHaveLength(1);
  });
});

describe("walrusArtifacts", () => {
  it("round-trips a named binary artifact across put/get", async () => {
    const art = walrusArtifacts(fakeWalrus());
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const ref = await art.put("report.bin", bytes);
    const got = await art.get(ref.blobId);
    expect(got.name).toBe("report.bin");
    expect([...got.bytes]).toEqual([0, 1, 2, 255]);
  });
});

describe("walrusMemory", () => {
  it("round-trips a transcript via blob + pointer", async () => {
    const memory = walrusMemory({ client: fakeWalrus(), pointers: inMemoryPointerStore() });
    const msgs: Message[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    await memory.append("s1", msgs);
    expect(await memory.load("s1")).toEqual(msgs);
  });

  it("returns [] for an unknown session", async () => {
    const memory = walrusMemory({ client: fakeWalrus(), pointers: inMemoryPointerStore() });
    expect(await memory.load("nope")).toEqual([]);
  });

  it("append overwrites (latest pointer wins)", async () => {
    const memory = walrusMemory({ client: fakeWalrus(), pointers: inMemoryPointerStore() });
    await memory.append("s1", [{ role: "user", content: "old" }]);
    await memory.append("s1", [{ role: "user", content: "new" }]);
    const loaded = await memory.load("s1");
    expect(loaded).toHaveLength(1);
    expect((loaded[0] as { content: string }).content).toBe("new");
  });

  it("fires onStore with the verifiable ref", async () => {
    const refs: WalrusMemoryRef[] = [];
    const memory = walrusMemory({
      client: fakeWalrus(),
      pointers: inMemoryPointerStore(),
      onStore: (r) => refs.push(r),
    });
    await memory.append("s1", [{ role: "user", content: "a" }]);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.sessionId).toBe("s1");
    expect(refs[0]?.blobId).toMatch(/^blob-/);
  });

  it("works over an on-chain memory-head pointer store (round-trip via Walrus)", async () => {
    // A fake memory-head: holds the transcript pointer in memory (stands in for the Move object).
    let onchain = "";
    const head: MemoryHeadLike = {
      read: () => Promise.resolve({ transcript: onchain }),
      update: ({ transcript }) => {
        onchain = transcript ?? onchain;
        return Promise.resolve("0xdigest");
      },
    };
    const memory = walrusMemory({ client: fakeWalrus(), pointers: moveObjectPointerStore(head) });
    expect(await memory.load("agent")).toEqual([]); // empty pointer → no transcript
    await memory.append("agent", [{ role: "user", content: "remembered" }]);
    expect(onchain).toMatch(/^blob-/); // pointer now on-chain
    expect(await memory.load("agent")).toEqual([{ role: "user", content: "remembered" }]);
  });
});

describe("walrusMemoryPlugin (cross-session memory, default)", () => {
  function toolNamed(plugin: ReturnType<typeof walrusMemoryPlugin>, name: string) {
    const t = plugin.tools?.find((x) => x.name === name);
    if (!t) throw new Error(`missing tool ${name}`);
    return t;
  }

  it("remember_fact stores on Walrus; a fresh agent recalls + auto-injects it", async () => {
    const client = fakeWalrus();
    const pointers = inMemoryPointerStore();
    const stored: WalrusBlobRef[] = [];

    // Session A: save a fact.
    const a = walrusMemoryPlugin({
      client,
      pointers,
      userId: "u1",
      onStore: (r) => stored.push(r),
    });
    await toolNamed(a, "remember_fact").execute(
      { fact: "User's name is Alice", kind: "fact" },
      {} as never,
    );
    expect(stored).toHaveLength(1);

    // Session B: a brand-new plugin instance (fresh cache), same Walrus + pointer.
    const b = walrusMemoryPlugin({ client, pointers, userId: "u1" });
    const facts = (await toolNamed(b, "recall_memory").execute({}, {} as never)) as WalrusFacts;
    expect(facts.facts).toContain("User's name is Alice");

    // contextMiddleware injects the known fact into the model's messages.
    const mw = b.modelMiddleware?.[0];
    if (!mw) throw new Error("no middleware");
    const out = await mw({ messages: [{ role: "user", content: "hi" }], tools: [] }, (req) =>
      Promise.resolve({ text: JSON.stringify(req.messages), finishReason: "stop" }),
    );
    expect(out.text).toContain("Alice");
  });

  it("injects nothing for a user with no stored facts", async () => {
    const p = walrusMemoryPlugin({
      client: fakeWalrus(),
      pointers: inMemoryPointerStore(),
      userId: "fresh",
    });
    const mw = p.modelMiddleware?.[0];
    if (!mw) throw new Error("no middleware");
    let seen: unknown;
    await mw({ messages: [{ role: "user", content: "hi" }], tools: [] }, (req) => {
      seen = req.messages;
      return Promise.resolve({ text: "", finishReason: "stop" });
    });
    expect(seen).toEqual([{ role: "user", content: "hi" }]);
  });

  it("resilient: a Walrus read error degrades to empty memory (never breaks the turn)", async () => {
    const pointers = inMemoryPointerStore();
    await pointers.set("facts:u1", "missing");
    const badClient: WalrusClient = {
      ...fakeWalrus(),
      getBlob: () => Promise.reject(new Error("boom")),
    };
    const p = walrusMemoryPlugin({ client: badClient, pointers, userId: "u1" });
    const facts = (await toolNamed(p, "recall_memory").execute({}, {} as never)) as WalrusFacts;
    expect(facts.facts).toEqual([]);
  });
});
