import { describe, it, expect } from "vitest";
import type { Message, ModelProvider, Tool } from "@thiny/core";
import {
  memwalMemory,
  memwalFactsPlugin,
  finalizeSessionToMemwal,
  type MemWalLike,
} from "../index.js";

/** Fake MemWal: append-only store, recall returns every item (load() filters by sessionId exactly). */
function fakeMemWal(): MemWalLike {
  const texts: string[] = [];
  return {
    async rememberAndWait(text) {
      texts.push(text);
      return { blob_id: `fake-blob-${String(texts.length)}` };
    },
    async recall() {
      return { results: texts.map((text) => ({ text })) };
    },
  };
}

describe("memwalMemory", () => {
  it("round-trips a transcript for a session", async () => {
    const mem = await memwalMemory({ client: fakeMemWal() });
    const msgs: Message[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    await mem.append("s1", msgs);
    expect(await mem.load("s1")).toEqual(msgs);
  });

  it("returns empty array for an unknown session", async () => {
    const mem = await memwalMemory({ client: fakeMemWal() });
    await mem.append("s1", [{ role: "user", content: "a" }]);
    expect(await mem.load("unknown")).toEqual([]);
  });

  it("load picks the latest append (upsert emulation over append-only store)", async () => {
    const mem = await memwalMemory({ client: fakeMemWal() });
    await mem.append("s1", [{ role: "user", content: "old" }]);
    await new Promise((r) => setTimeout(r, 2)); // ensure ts advances
    await mem.append("s1", [{ role: "user", content: "new" }]);
    const result = await mem.load("s1");
    expect(result).toHaveLength(1);
    expect((result[0] as { content: string }).content).toBe("new");
  });

  it("isolates data between sessions", async () => {
    const client = fakeMemWal();
    const mem = await memwalMemory({ client });
    await mem.append("s1", [{ role: "user", content: "one" }]);
    await mem.append("s2", [{ role: "user", content: "two" }]);
    expect((await mem.load("s1"))[0]).toEqual({ role: "user", content: "one" });
    expect((await mem.load("s2"))[0]).toEqual({ role: "user", content: "two" });
  });

  it("fires onStore with the Walrus blobId after each append", async () => {
    const refs: Array<{ sessionId: string; blobId: string }> = [];
    const mem = await memwalMemory({ client: fakeMemWal(), onStore: (r) => refs.push(r) });
    await mem.append("s1", [{ role: "user", content: "a" }]);
    expect(refs).toEqual([{ sessionId: "s1", blobId: "fake-blob-1" }]);
  });

  it("throws when neither client nor full credentials are given", async () => {
    await expect(memwalMemory({ delegateKey: "0xabc" })).rejects.toThrow(/Playground/);
  });
});

function toolNamed(tools: Tool[] | undefined, name: string): Tool {
  const tool = tools?.find((t) => t.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

describe("memwalFactsPlugin", () => {
  it("remember_fact stores and recall_memory returns the texts", async () => {
    const plugin = memwalFactsPlugin({ client: fakeMemWal() });
    const remember = toolNamed(plugin.tools, "remember_fact");
    const recall = toolNamed(plugin.tools, "recall_memory");

    const stored = (await remember.execute({ fact: "user likes Sui" }, {} as never)) as {
      stored: boolean;
    };
    expect(stored.stored).toBe(true);

    const out = (await recall.execute({ query: "preferences" }, {} as never)) as {
      memories: string[];
    };
    expect(out.memories).toContain("user likes Sui");
  });
});

describe("finalizeSessionToMemwal", () => {
  const jsonModel = (text: string): ModelProvider => ({
    generate: () => Promise.resolve({ text, finishReason: "stop" }),
  });

  it("extracts facts via the model and stores them (recallable)", async () => {
    const client = fakeMemWal();
    const stored = await finalizeSessionToMemwal({
      client,
      model: jsonModel('["fact one","fact two"]'),
      transcript: [{ role: "user", content: "hi" }],
    });
    expect(stored).toEqual(["fact one", "fact two"]);
    const { results } = await client.recall({ query: "x" });
    expect(results.map((r) => r.text)).toEqual(["fact one", "fact two"]);
  });

  it("returns [] for an empty transcript without calling the model", async () => {
    const stored = await finalizeSessionToMemwal({
      client: fakeMemWal(),
      model: jsonModel("[]"),
      transcript: [],
    });
    expect(stored).toEqual([]);
  });
});
