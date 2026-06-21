import { defineTool } from "@thiny/core";
import type { MemoryBackend, Message, ModelProvider, Plugin } from "@thiny/core";
import { z } from "zod";

/**
 * @thiny/memory-memwal — MemWal (Walrus Memory) integration.
 *
 * MemWal is a *semantic* memory store on Walrus (auth + encryption + embeddings handled for us).
 * Its real strength is fuzzy recall of durable facts — so the headline export is
 * {@link memwalFactsPlugin} (`remember_fact` / `recall_memory` tools) + {@link finalizeSessionToMemwal}.
 *
 * {@link memwalMemory} (the `MemoryBackend` adapter) is kept as a *caveated convenience*: it forces a
 * semantic store to act as exact-key transcript KV (`recall({ query: sessionId })`), which is fine for
 * a short demo but degrades as memory grows. **For transcript persistence prefer `walrusMemory`
 * (`@thiny/walrus`) — content-addressed blob + pointer.**
 */

/** The slice of the MemWal client we use — the injection seam for tests/custom clients. */
export interface MemWalLike {
  /** Store text (and wait until it's durably indexed). Returns the Walrus blob it landed in. */
  rememberAndWait(text: string, namespace?: string): Promise<MemWalRememberResult>;
  /** Semantic recall — returns nearest memories for a query. */
  recall(params: { query: string; limit?: number; namespace?: string }): Promise<MemWalRecall>;
}

export interface MemWalRememberResult {
  /** Walrus blob ID the memory was stored in (verifiable on Walruscan). */
  blob_id?: string;
}

export interface MemWalRecall {
  results: Array<{ text: string }>;
}

/** A verifiable reference to a memory write, surfaced via {@link MemwalMemoryOptions.onStore}. */
export interface MemwalStoreRef {
  sessionId: string;
  /** Walrus blob ID — feed to `walruscanBlobUrl()` for an explorer link. */
  blobId: string;
}

export interface MemwalMemoryOptions extends MemWalCreds {
  /** How many candidates to pull from recall when loading a session. Default 50. */
  recallLimit?: number;
  /** Called after each write with the Walrus blob ID — wire to the CLI to print explorer links. */
  onStore?: (ref: MemwalStoreRef) => void;
}

const TRANSCRIPT_KIND = "thiny-transcript";

interface TranscriptEnvelope {
  sessionId: string;
  ts: number;
  kind: typeof TRANSCRIPT_KIND;
  messages: Message[];
}

class MemwalMemory implements MemoryBackend {
  constructor(
    private readonly client: MemWalLike,
    private readonly recallLimit: number,
    private readonly onStore?: (ref: MemwalStoreRef) => void,
  ) {}

  async load(sessionId: string): Promise<Message[]> {
    const { results } = await this.client.recall({ query: sessionId, limit: this.recallLimit });
    let latest: TranscriptEnvelope | undefined;
    for (const hit of results) {
      const env = parseEnvelope(hit.text);
      if (env?.sessionId !== sessionId) continue;
      if (!latest || env.ts > latest.ts) latest = env;
    }
    return latest?.messages ?? [];
  }

  async append(sessionId: string, messages: Message[]): Promise<void> {
    // sessionId lives inside the envelope (MemWal recall returns text only, no metadata),
    // so load() can filter by exact session and pick the latest.
    const env: TranscriptEnvelope = { sessionId, ts: Date.now(), kind: TRANSCRIPT_KIND, messages };
    const result = await this.client.rememberAndWait(JSON.stringify(env));
    if (this.onStore && result.blob_id) {
      this.onStore({ sessionId, blobId: result.blob_id });
    }
  }
}

function parseEnvelope(text: string): TranscriptEnvelope | undefined {
  try {
    const obj = JSON.parse(text) as Partial<TranscriptEnvelope>;
    if (
      obj.kind === TRANSCRIPT_KIND &&
      typeof obj.sessionId === "string" &&
      Array.isArray(obj.messages)
    ) {
      return obj as TranscriptEnvelope;
    }
  } catch {
    /* not our envelope — skip */
  }
  return undefined;
}

/** Shared connection inputs: inject a ready `client`, or supply Playground credentials. */
export interface MemWalCreds {
  /** Inject a ready client (tests, or a pre-constructed `@mysten-incubation/memwal` instance). */
  client?: MemWalLike;
  /** Ed25519 delegate key (hex) from the MemWal Playground. Required if `client` is not given. */
  delegateKey?: string;
  /** Walrus Memory account object ID. Required if `client` is not given. */
  accountId?: string;
  /** MemWal relayer server URL (default: the SDK's built-in relayer). */
  serverUrl?: string;
  /** Namespace — share it across agents for shared memory (P5). */
  namespace?: string;
}

/** Resolve a {@link MemWalLike}: use the injected client, or build one from credentials. */
async function resolveMemWalClient(opts: MemWalCreds): Promise<MemWalLike> {
  if (opts.client) return opts.client;
  if (!opts.delegateKey || !opts.accountId) {
    throw new Error(
      "MemWal: provide a `client`, or both delegateKey and accountId. " +
        "Create an account + delegate key at the MemWal Playground.",
    );
  }
  // Dynamic import so the heavy SDK is optional — only loaded when no client is injected.
  const { MemWal } = await import("@mysten-incubation/memwal");
  // MemWal.create() (private constructor) returns the full client; its rememberAndWait/recall
  // surface is structurally assignable to MemWalLike — no cast needed.
  return MemWal.create({
    key: opts.delegateKey,
    accountId: opts.accountId,
    serverUrl: opts.serverUrl,
    namespace: opts.namespace,
  });
}

/**
 * Create a MemWal-backed {@link MemoryBackend}.
 *
 * **Caveat:** this forces a semantic store to act as exact-key transcript KV — fine for a short demo,
 * fragile as memory grows. Prefer `walrusMemory` (`@thiny/walrus`) for transcript persistence and use
 * {@link memwalFactsPlugin} for what MemWal is actually good at (semantic facts).
 *
 * @example
 * ```ts
 * const memory = await memwalMemory({ delegateKey, accountId, namespace: "my-agent" });
 * const agent = await createAgent({ model, memory });
 * ```
 */
export async function memwalMemory(opts: MemwalMemoryOptions): Promise<MemoryBackend> {
  const client = await resolveMemWalClient(opts);
  return new MemwalMemory(client, opts.recallLimit ?? 50, opts.onStore);
}

// ── Semantic facts layer (3b) — what MemWal is actually for ─────────────────────

export interface MemwalFactsOptions extends MemWalCreds {
  /** Default number of memories `recall_memory` returns. Default 10. */
  recallLimit?: number;
}

/**
 * A plugin exposing MemWal as agent-driven, portable **semantic long-term memory**:
 *  - `remember_fact(fact)` — store a durable fact (preference/goal/decision) for future sessions.
 *  - `recall_memory(query)` — fuzzy-search prior facts; call at the start of a task.
 *
 * The client is built lazily on first tool use (dynamic SDK import), so a bare agent stays light.
 *
 * @example
 * ```ts
 * const agent = await createAgent({ model, plugins: [memwalFactsPlugin({ delegateKey, accountId })] });
 * ```
 */
export function memwalFactsPlugin(opts: MemwalFactsOptions): Plugin {
  let clientPromise: Promise<MemWalLike> | undefined;
  const getClient = (): Promise<MemWalLike> => (clientPromise ??= resolveMemWalClient(opts));
  const defaultLimit = opts.recallLimit ?? 10;

  const rememberFact = defineTool({
    name: "remember_fact",
    description:
      "Store a durable, standalone fact in long-term semantic memory (persisted on Walrus). " +
      "Use for stable user preferences, goals, and decisions worth recalling in future sessions — " +
      "not for transient chatter.",
    parameters: z.object({
      fact: z.string().min(1).describe("The fact to remember, phrased to stand on its own."),
    }),
    execute: async ({ fact }) => {
      const res = await (await getClient()).rememberAndWait(fact, opts.namespace);
      return { stored: true, blobId: res.blob_id };
    },
  });

  const recallMemory = defineTool({
    name: "recall_memory",
    description:
      "Search long-term semantic memory for facts relevant to a query. Call at the start of a task " +
      "to recall what you already know about the user or goal.",
    parameters: z.object({
      query: z.string().min(1).describe("What to recall."),
      limit: z.number().int().min(1).max(50).optional().describe("Max memories to return."),
    }),
    execute: async ({ query, limit }) => {
      const { results } = await (
        await getClient()
      ).recall({
        query,
        limit: limit ?? defaultLimit,
        namespace: opts.namespace,
      });
      return { memories: results.map((r) => r.text) };
    },
  });

  return { name: "memwal-facts", tools: [rememberFact, recallMemory] };
}

export interface FinalizeMemwalOptions extends MemWalCreds {
  /** Model used to extract facts from the transcript. */
  model: ModelProvider;
  /** The session transcript to mine for durable facts. */
  transcript: Message[];
  /** Max facts to extract + store. Default 10. */
  maxFacts?: number;
}

/**
 * Mine a finished session's transcript for durable facts and store them in MemWal.
 * Call after a session ends so future sessions can `recall_memory` them.
 *
 * @returns the facts that were stored.
 */
export async function finalizeSessionToMemwal(opts: FinalizeMemwalOptions): Promise<string[]> {
  const facts = await extractFacts(opts.model, opts.transcript, opts.maxFacts ?? 10);
  if (facts.length === 0) return [];
  const client = await resolveMemWalClient(opts);
  for (const fact of facts) {
    await client.rememberAndWait(fact, opts.namespace);
  }
  return facts;
}

async function extractFacts(
  model: ModelProvider,
  transcript: Message[],
  max: number,
): Promise<string[]> {
  const text = transcript
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role}: ${"content" in m ? m.content : ""}`)
    .join("\n");
  if (text.trim() === "") return [];

  const prompt =
    `Extract up to ${String(max)} durable, standalone facts worth remembering long-term ` +
    `(user goals, preferences, decisions, stable context). Skip transient details. ` +
    `Respond with ONLY a JSON array of strings.\n\nTranscript:\n${text.slice(0, 6000)}`;

  try {
    const res = await model.generate(
      [
        {
          role: "system",
          content: "Extract durable facts. Respond only with a JSON array of strings.",
        },
        { role: "user", content: prompt },
      ],
      [],
    );
    const json = /\[[\s\S]*\]/u.exec(res.text ?? "")?.[0] ?? "[]";
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, max);
  } catch {
    return []; // extraction is best-effort — never break the caller
  }
}
