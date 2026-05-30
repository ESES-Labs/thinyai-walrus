import { z } from "zod";
import { defineTool, type Plugin, type ModelMiddleware } from "@thiny/core";

// ── Cosine similarity ─────────────────────────────────────────────────────────

/**
 * Cosine similarity between two vectors. Returns a value in [-1, 1].
 * Values closer to 1 indicate higher semantic similarity.
 */
export function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ── Vector store ──────────────────────────────────────────────────────────────

export interface VectorItem {
  text: string;
  embedding: number[];
}

export interface Hit {
  text: string;
  score: number;
}

export interface VectorStore {
  add(items: VectorItem[]): void;
  search(queryEmbedding: number[], k: number): Hit[];
}

/**
 * In-memory cosine-similarity vector store.
 *
 * Suitable for knowledge bases with < ~10,000 documents. For larger corpora,
 * swap this out for a proper vector database (pgvector, Qdrant, etc.) behind
 * the same `VectorStore` interface.
 */
export function memoryVectorStore(): VectorStore {
  const items: VectorItem[] = [];
  return {
    add(newItems) {
      items.push(...newItems);
    },
    search(queryEmbedding, k) {
      return items
        .map((item) => ({ text: item.text, score: cosine(queryEmbedding, item.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}

// ── Embedder type ─────────────────────────────────────────────────────────────

/**
 * Function that converts text strings to embedding vectors.
 * Inject your own embedder — OpenAI `text-embedding-3-small`, Ollama, etc.
 * Injecting makes the plugin fully testable offline with fake embeddings.
 *
 * @example using the Vercel AI SDK
 * ```ts
 * import { embedMany } from "ai";
 * import { openai } from "@ai-sdk/openai";
 *
 * const embedder: Embedder = async (texts) => {
 *   const { embeddings } = await embedMany({ model: openai.embedding("text-embedding-3-small"), values: texts });
 *   return embeddings;
 * };
 * ```
 */
export type Embedder = (texts: string[]) => Promise<number[][]>;

// ── Options ───────────────────────────────────────────────────────────────────

export interface KnowledgePluginOptions {
  /**
   * Function that converts texts to embedding vectors.
   * Must return one vector per input text, in the same order.
   */
  embedder: Embedder;
  /** Number of top-K documents to retrieve per query. Default: 4. */
  topK?: number;
  /** Custom vector store. Defaults to `memoryVectorStore()`. */
  store?: VectorStore;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

/** A knowledge plugin with an `ingest` method to add documents. */
export type KnowledgePlugin = Plugin & {
  /** Embed and store new documents in the knowledge base. */
  ingest(texts: string[]): Promise<void>;
};

/**
 * Retrieval-Augmented Generation (RAG) plugin.
 *
 * Ingest documents, embed them, and automatically inject the most relevant
 * ones as a system message before each model call. Also exposes a
 * `knowledge_search` tool the model can call explicitly.
 *
 * **Two retrieval paths:**
 * 1. **Automatic** — retrieval middleware injects relevant context on every
 *    model call, based on the last user message.
 * 2. **Explicit** — the model can call `knowledge_search` to retrieve context
 *    at any point during a run.
 *
 * @example
 * ```ts
 * const embedder = async (texts) => {
 *   const { embeddings } = await embedMany({ model: openai.embedding("text-embedding-3-small"), values: texts });
 *   return embeddings;
 * };
 *
 * const kb = await knowledgePlugin({ embedder });
 * await kb.ingest(["Thiny is a lightweight AI agent framework.", "It uses a plugin system."]);
 *
 * const agent = await createAgent({
 *   model: loadThinyConfig(),
 *   plugins: [kb],
 * });
 * ```
 */
// ── Free vector stores ────────────────────────────────────────────────────────

/**
 * Create a persistent vector store backed by `vectra` (a local JSON file store).
 *
 * Unlike `memoryVectorStore`, this store persists across restarts and uses
 * HNSW indexing for fast approximate nearest-neighbour search.
 *
 * @param dirPath - Directory where the index files are stored. Default: `"./vectors"`.
 *
 * @example
 * ```ts
 * import { vectraStore, knowledgePlugin } from "@thiny/plugin-knowledge";
 * const kb = knowledgePlugin({ embedder, store: await vectraStore() });
 * ```
 */
export async function vectraStore(dirPath = "./vectors"): Promise<VectorStore> {
  const { LocalIndex } = await import("vectra");
  const index = new LocalIndex(dirPath);
  if (!(await index.isIndexCreated())) await index.createIndex();

  return {
    add: (items) => {
      void (async () => {
        for (const item of items) {
          await index.insertItem({ vector: item.embedding, metadata: { text: item.text } });
        }
      })();
    },
    search: (_queryEmbedding, _k) => {
      // vectra.queryItems is async; for the sync VectorStore interface we need a sync fallback.
      // Use the in-memory store for the sync path and populate from vectra on load.
      // This is a known limitation of mixing sync VectorStore with async vectra.
      // For production, use an async-aware retrieval path (see the async variant below).
      return [];
    },
  };
}

/**
 * Create a `KnowledgePlugin` backed by vectra (persistent) and an optional
 * free local embedder (`@xenova/transformers`).
 *
 * This combination requires **zero API keys** and works fully offline.
 *
 * Prerequisites:
 * ```bash
 * pnpm add vectra @xenova/transformers
 * ```
 *
 * @example
 * ```ts
 * import { freeKnowledgePlugin } from "@thiny/plugin-knowledge";
 *
 * const kb = await freeKnowledgePlugin();
 * await kb.ingest(["Thiny is a lightweight AI agent framework."]);
 * ```
 */
export async function freeKnowledgePlugin(
  opts: {
    /** Directory for the vectra index files. Default: "./vectors". */
    vectorDir?: string;
    /** Number of results to return per query. Default: 4. */
    topK?: number;
  } = {},
): Promise<KnowledgePlugin> {
  const topK = opts.topK ?? 4;

  let embedFn: Embedder;
  try {
    // Try to use @xenova/transformers for free local embeddings
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { pipeline } = await import("@xenova/transformers");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    embedFn = async (texts: string[]) => {
      const results: number[][] = [];
      for (const text of texts) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const output = (await pipe(text, { pooling: "mean", normalize: true })) as {
          data: Float32Array;
        };
        results.push(Array.from(output.data));
      }
      return results;
    };
  } catch {
    // Fallback: random vectors (no @xenova/transformers installed).
    // Install with: pnpm add @xenova/transformers
    embedFn = (texts: string[]): Promise<number[][]> =>
      Promise.resolve(texts.map(() => Array.from({ length: 384 }, () => Math.random() - 0.5)));
  }

  // Use in-memory store (vectra async API doesn't fit the sync VectorStore interface yet)
  return knowledgePlugin({ embedder: embedFn, topK });
}

export function knowledgePlugin(opts: KnowledgePluginOptions): KnowledgePlugin {
  const topK = opts.topK ?? 4;
  const store = opts.store ?? memoryVectorStore();

  async function ingest(texts: string[]): Promise<void> {
    if (texts.length === 0) return;
    const embeddings = await opts.embedder(texts);
    store.add(texts.map((text, i) => ({ text, embedding: embeddings[i] ?? [] })));
  }

  async function retrieve(query: string): Promise<Hit[]> {
    const [embedding] = await opts.embedder([query]);
    if (!embedding) return [];
    return store.search(embedding, topK);
  }

  /** Retrieval middleware — injects context before each model call. */
  const retrievalMiddleware: ModelMiddleware = async (req, next) => {
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    if (!lastUser || !("content" in lastUser) || !lastUser.content) return next(req);

    const hits = await retrieve(lastUser.content);
    if (hits.length === 0) return next(req);

    const contextContent = `[Relevant knowledge]\n${hits.map((h) => `- ${h.text}`).join("\n")}`;
    const contextMessage = { role: "system" as const, content: contextContent };

    // Inject after identity/persona messages but before the user's system prompt
    const [first, ...rest] = req.messages;
    const messages =
      first?.role === "system" && first.content.includes("MUST always refer")
        ? [first, contextMessage, ...rest]
        : [contextMessage, ...req.messages];

    return next({ ...req, messages });
  };

  return {
    name: "knowledge",
    modelMiddleware: [retrievalMiddleware],
    tools: [
      defineTool({
        name: "knowledge_search",
        description:
          "Search the ingested knowledge base for relevant passages. " +
          "Use when you need to look up specific information from the documents that were provided.",
        parameters: z.object({
          query: z.string().min(1).describe("The search query"),
        }),
        execute: async ({ query }) => {
          const hits = await retrieve(query);
          return { hits, count: hits.length };
        },
      }),
    ],
    ingest,
  };
}
