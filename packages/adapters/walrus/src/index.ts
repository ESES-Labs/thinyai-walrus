import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { defineTool } from "@thiny/core";
import type { Logger, MemoryBackend, Message, ModelMiddleware, Plugin } from "@thiny/core";

/**
 * @thiny/walrus — raw-blob adapter for Walrus decentralized storage.
 *
 * Three deliverables share one HTTP client:
 *   - `walrusClient`      — PUT/GET blobs via the public Walrus HTTP publisher/aggregator
 *   - `walrusAuditLogger` — tee the audit trail (every model + tool call) into a Walrus blob
 *   - `walrusArtifacts`   — store/recall named artifacts across runs by blob ID
 *
 * Every write returns a {@link WalrusBlobRef} carrying the content-addressed `blobId`, the Sui
 * `objectId`, and (when the publisher certifies on-chain) the `txDigest` — so the CLI can print
 * Walruscan / Suiscan links and the stored data is independently verifiable.
 *
 * Uses the public testnet publisher/aggregator by default — no WAL/SUI tokens needed.
 */

// Public testnet endpoints. They rotate — override via options or env when they change.
// ponytail: hard-coded defaults; pull fresh from docs.wal.app network-reference if PUTs start 404ing.
const DEFAULT_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const DEFAULT_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

export type WalrusNetwork = "testnet" | "mainnet";

export interface WalrusClientOptions {
  /** Publisher base URL (PUT blobs). Default: public testnet publisher. */
  publisher?: string;
  /** Aggregator base URL (GET blobs). Default: public testnet aggregator. */
  aggregator?: string;
  /** Storage duration in epochs. Default 5. */
  epochs?: number;
  /** Sui/Walrus network — drives explorer URLs. Default "testnet". */
  network?: WalrusNetwork;
  /** Injectable fetch (for tests). Default: global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** A verifiable reference to a stored blob. */
export interface WalrusBlobRef {
  /** Content address of the blob — stable, used for reads + Walruscan. */
  blobId: string;
  /** Sui object ID of the blob (present for newly created blobs). */
  objectId?: string;
  /** Sui transaction digest that certified the blob (present when already certified on-chain). */
  txDigest?: string;
  /** Storage end epoch, if reported. */
  endEpoch?: number;
}

export interface WalrusClient {
  /** Store bytes, return a verifiable {@link WalrusBlobRef}. */
  putBlob(data: Uint8Array | string): Promise<WalrusBlobRef>;
  /** Fetch bytes for a blob ID. Throws if not found. */
  getBlob(blobId: string): Promise<Uint8Array>;
  readonly publisher: string;
  readonly aggregator: string;
  readonly network: WalrusNetwork;
}

// PUT /v1/blobs returns either a freshly stored blob or a reference to an existing one.
interface PutBlobResponse {
  newlyCreated?: {
    blobObject?: { id?: string; blobId?: string; storage?: { endEpoch?: number } };
  };
  alreadyCertified?: { blobId?: string; endEpoch?: number; event?: { txDigest?: string } };
}

/** Create a Walrus HTTP blob client. */
export function walrusClient(opts: WalrusClientOptions = {}): WalrusClient {
  const publisher = (opts.publisher ?? DEFAULT_PUBLISHER).replace(/\/$/, "");
  const aggregator = (opts.aggregator ?? DEFAULT_AGGREGATOR).replace(/\/$/, "");
  const epochs = opts.epochs ?? 5;
  const network = opts.network ?? "testnet";
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    publisher,
    aggregator,
    network,

    async putBlob(data) {
      const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const res = await fetchImpl(`${publisher}/v1/blobs?epochs=${String(epochs)}`, {
        method: "PUT",
        body,
      });
      if (!res.ok) {
        throw new Error(`walrus putBlob failed: HTTP ${String(res.status)} ${await res.text()}`);
      }
      const json = (await res.json()) as PutBlobResponse;
      const created = json.newlyCreated?.blobObject;
      const certified = json.alreadyCertified;
      const blobId = created?.blobId ?? certified?.blobId;
      if (!blobId) {
        throw new Error(`walrus putBlob: no blobId in response: ${JSON.stringify(json)}`);
      }
      return {
        blobId,
        objectId: created?.id,
        txDigest: certified?.event?.txDigest,
        endEpoch: created?.storage?.endEpoch ?? certified?.endEpoch,
      };
    },

    async getBlob(blobId) {
      const res = await fetchImpl(`${aggregator}/v1/blobs/${encodeURIComponent(blobId)}`);
      if (!res.ok) {
        throw new Error(`walrus getBlob failed: HTTP ${String(res.status)} for ${blobId}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

// ── Explorer links (verifiability) ──────────────────────────────────────────

export interface ExplorerLinks {
  /** Walruscan blob page — shows the stored blob. */
  blob: string;
  /** Suiscan object page — the on-chain blob object (when known). */
  object?: string;
  /** Suiscan transaction page — the certifying tx (when known). */
  tx?: string;
}

/** Walruscan URL for a blob. */
export function walruscanBlobUrl(blobId: string, network: WalrusNetwork = "testnet"): string {
  return `https://walruscan.com/${network}/blob/${blobId}`;
}

/** Suiscan URL for a Sui object. */
export function suiscanObjectUrl(objectId: string, network: WalrusNetwork = "testnet"): string {
  return `https://suiscan.xyz/${network}/object/${objectId}`;
}

/** Suiscan URL for a Sui transaction digest. */
export function suiscanTxUrl(txDigest: string, network: WalrusNetwork = "testnet"): string {
  return `https://suiscan.xyz/${network}/tx/${txDigest}`;
}

/** Build all available explorer links for a stored blob ref. */
export function explorerLinks(
  ref: WalrusBlobRef,
  network: WalrusNetwork = "testnet",
): ExplorerLinks {
  return {
    blob: walruscanBlobUrl(ref.blobId, network),
    object: ref.objectId ? suiscanObjectUrl(ref.objectId, network) : undefined,
    tx: ref.txDigest ? suiscanTxUrl(ref.txDigest, network) : undefined,
  };
}

// ── Audit sink (P2) ──────────────────────────────────────────────────────────

export interface AuditEntry {
  level: "info" | "warn" | "error";
  at: string;
  msg?: string;
  [k: string]: unknown;
}

export interface AuditManifest {
  sessionId: string;
  createdAt: string;
  count: number;
  entries: AuditEntry[];
}

export interface WalrusAuditLogger extends Logger {
  /**
   * Write the collected audit trail as one Walrus blob and return its verifiable ref
   * (or null if nothing was captured). Pass `sessionId` to stamp this batch.
   */
  flush(sessionId?: string): Promise<WalrusBlobRef | null>;
  /** Clear the in-memory buffer — call after `flush()` to start a fresh batch (e.g. per turn). */
  reset(): void;
  /** The entries collected so far (in memory). */
  entries(): AuditEntry[];
}

export interface WalrusAuditOptions {
  sessionId: string;
  /** Override the clock (tests). */
  now?: () => Date;
}

/**
 * Wrap a Logger so every structured audit record (model_call / tool_call / session_*) is
 * also captured and — on {@link WalrusAuditLogger.flush} — stored as one immutable Walrus blob.
 *
 * The blob ID *is* the tamper-evidence: Walrus is content-addressed, so any edit changes the ID.
 * `thiny audit verify <blobId>` (see {@link verifyAuditTrail}) re-fetches and replays the trail.
 *
 * ponytail: batched — call flush()+reset() per turn (CLI) or once per session. Switch to
 * per-entry streaming only if a demo needs live verification mid-run.
 */
export function walrusAuditLogger(
  base: Logger,
  client: WalrusClient,
  opts: WalrusAuditOptions,
): WalrusAuditLogger {
  const buffer: AuditEntry[] = [];
  const now = opts.now ?? (() => new Date());

  // Only structured audit records carry `kind` (model_call/tool_call) or `event` (session_*).
  const capture = (level: AuditEntry["level"], obj: Record<string, unknown>, msg?: string) => {
    if ("kind" in obj || "event" in obj) {
      buffer.push({ level, at: now().toISOString(), msg, ...obj });
    }
  };

  const wrap = (logger: Logger): WalrusAuditLogger => ({
    info: (obj, msg) => {
      capture("info", obj, msg);
      logger.info(obj, msg);
    },
    warn: (obj, msg) => {
      capture("warn", obj, msg);
      logger.warn(obj, msg);
    },
    error: (obj, msg) => {
      capture("error", obj, msg);
      logger.error(obj, msg);
    },
    // child loggers share the same buffer so the whole session lands in one trail.
    child: (bindings) => wrap(logger.child(bindings)),
    entries: () => [...buffer],
    reset: () => {
      buffer.length = 0;
    },
    flush: async (sessionId) => {
      if (buffer.length === 0) return null;
      const manifest: AuditManifest = {
        sessionId: sessionId ?? opts.sessionId,
        createdAt: now().toISOString(),
        count: buffer.length,
        entries: buffer,
      };
      return client.putBlob(JSON.stringify(manifest));
    },
  });

  return wrap(base);
}

/** Re-fetch an audit trail from Walrus by blob ID and parse it. The "black-box recorder" replay. */
export async function verifyAuditTrail(
  client: WalrusClient,
  blobId: string,
): Promise<AuditManifest> {
  const bytes = await client.getBlob(blobId);
  return JSON.parse(new TextDecoder().decode(bytes)) as AuditManifest;
}

// ── Artifact store (P3) ────────────────────────────────────────────────────────

export interface WalrusArtifacts {
  /** Store named bytes, return a verifiable {@link WalrusBlobRef}. */
  put(name: string, data: Uint8Array | string): Promise<WalrusBlobRef>;
  /** Fetch an artifact by blob ID. */
  get(blobId: string): Promise<{ name: string; bytes: Uint8Array }>;
}

interface ArtifactEnvelope {
  name: string;
  /** base64 payload — keeps binary artifacts intact through JSON. */
  b64: string;
}

/** Name-tagged artifact store over Walrus blobs. Write in run 1, recall by ID in run 2. */
export function walrusArtifacts(client: WalrusClient): WalrusArtifacts {
  return {
    async put(name, data) {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const env: ArtifactEnvelope = { name, b64: Buffer.from(bytes).toString("base64") };
      return client.putBlob(JSON.stringify(env));
    },
    async get(blobId) {
      const bytes = await client.getBlob(blobId);
      const env = JSON.parse(new TextDecoder().decode(bytes)) as ArtifactEnvelope;
      return { name: env.name, bytes: new Uint8Array(Buffer.from(env.b64, "base64")) };
    },
  };
}

// ── Transcript memory (3a): content-addressed blob + pointer ───────────────────

/**
 * Resolves `sessionId → latest transcript blobId`. The indirection is what makes the transcript
 * both *verifiable* (blob is content-addressed) and *portable* (the pointer can move on-chain).
 *
 * Implementations: {@link inMemoryPointerStore} (tests), {@link filePointerStore} (durable local),
 * and — for true cross-machine portability — the on-chain memory-head Move object (see C4).
 */
export interface PointerStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, blobId: string): Promise<void>;
}

/** Ephemeral in-process pointer store — for tests / single-run agents. */
export function inMemoryPointerStore(): PointerStore {
  const map = new Map<string, string>();
  return {
    get: (key) => Promise.resolve(map.get(key)),
    set: (key, blobId) => {
      map.set(key, blobId);
      return Promise.resolve();
    },
  };
}

/**
 * Durable local pointer store backed by a single JSON file.
 *
 * ponytail: whole-file `{ sessionId: blobId }` map — fine for one agent's sessions. Swap to the
 * on-chain memory-head (C4) for cross-machine portability, or sqlite at scale.
 */
export function filePointerStore(path: string): PointerStore {
  async function readAll(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as Record<string, string>;
    } catch {
      return {}; // missing or corrupt → start empty (documented skip)
    }
  }
  return {
    async get(key) {
      return (await readAll())[key];
    },
    async set(key, blobId) {
      const all = await readAll();
      all[key] = blobId;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(all, null, 2));
    },
  };
}

/**
 * The slice of an on-chain memory-head client a pointer store needs — satisfied structurally by
 * `suiMemoryHead` from `@thiny/signer-sui` (kept as an interface so `@thiny/walrus` stays decoupled).
 */
export interface MemoryHeadLike {
  read(): Promise<{ transcript: string }>;
  update(pointers: { transcript?: string }): Promise<string>;
}

/**
 * On-chain {@link PointerStore} backed by a memory-head Move object: the transcript pointer lives on
 * Sui (readable by anyone, writable only by the owner) instead of in a local file. One head per
 * agent, so the session key is ignored — the head tracks the agent's single latest transcript.
 */
export function moveObjectPointerStore(head: MemoryHeadLike): PointerStore {
  return {
    async get() {
      const { transcript } = await head.read();
      return transcript === "" ? undefined : transcript;
    },
    async set(_sessionId, blobId) {
      await head.update({ transcript: blobId });
    },
  };
}

/** A transcript write surfaced to {@link WalrusMemoryOptions.onStore} (verifiable + portable). */
export interface WalrusMemoryRef extends WalrusBlobRef {
  sessionId: string;
}

export interface WalrusMemoryOptions {
  client: WalrusClient;
  pointers: PointerStore;
  /** Called after each save with the transcript's verifiable ref — wire to the CLI for links. */
  onStore?: (ref: WalrusMemoryRef) => void;
}

/**
 * A {@link MemoryBackend} that stores each session's transcript as a content-addressed Walrus blob
 * and tracks `sessionId → blobId` in a {@link PointerStore}.
 *
 * `append` overwrites (port semantics) → one blob per save; `load` resolves the pointer then GETs
 * the blob. Unlike `memwalMemory` (semantic, fuzzy), this is exact and verifiable — the right
 * backend for transcript persistence. Pair with the on-chain pointer (C4) for portability.
 *
 * @example
 * ```ts
 * const memory = walrusMemory({
 *   client: walrusClient(),
 *   pointers: filePointerStore("thiny-pointers.json"),
 * });
 * const agent = await createAgent({ model, memory });
 * ```
 */
export function walrusMemory(opts: WalrusMemoryOptions): MemoryBackend {
  return {
    async load(sessionId) {
      const blobId = await opts.pointers.get(sessionId);
      if (blobId === undefined) return [];
      const bytes = await opts.client.getBlob(blobId);
      return JSON.parse(new TextDecoder().decode(bytes)) as Message[];
    },
    async append(sessionId, messages) {
      const ref = await opts.client.putBlob(JSON.stringify(messages));
      await opts.pointers.set(sessionId, ref.blobId);
      opts.onStore?.({ sessionId, ...ref });
    },
  };
}

// ── Cross-session memory (default) — durable facts on Walrus, no platform lock-in ──

/** The durable, portable memory carried across sessions: who the user is + what they prefer. */
export interface WalrusFacts {
  userId: string;
  facts: string[];
  preferences: string[];
  updatedAt: string;
}

export interface WalrusMemoryPluginOptions {
  /** Walrus blob client (public HTTP — no creds needed). */
  client: WalrusClient;
  /** Tracks `facts:<userId> → blobId`. Local file by default; on-chain memory-head for portability. */
  pointers: PointerStore;
  /** Identity this memory belongs to. Share it across agents to share context. */
  userId: string;
  /** Cap on stored facts/preferences (oldest dropped). Default 50. */
  maxFacts?: number;
  /** Called after a write with the verifiable blob ref — wire to the CLI to print links. */
  onStore?: (ref: WalrusBlobRef) => void;
}

function emptyFacts(userId: string): WalrusFacts {
  return { userId, facts: [], preferences: [], updatedAt: "" };
}

/**
 * Cross-session memory **on Walrus** — the default durable foundation (no SQLite, no platform lock-in).
 *
 * Auto-injects what's known about the user as a system message every model call (so the agent simply
 * "remembers"), and exposes `remember_fact` / `recall_memory` tools. Facts live as a content-addressed
 * Walrus blob; the pointer (local file, or on-chain memory-head) tracks the latest. Resilient: a Walrus
 * hiccup degrades to "no memory this turn" rather than breaking the conversation.
 *
 * @example
 * ```ts
 * walrusMemoryPlugin({ client: walrusClient(), pointers: filePointerStore("pointers.json"), userId })
 * ```
 */
export function walrusMemoryPlugin(opts: WalrusMemoryPluginOptions): Plugin {
  const key = `facts:${opts.userId}`;
  const maxFacts = opts.maxFacts ?? 50;
  let cache: WalrusFacts | undefined; // avoids a Walrus GET on every model call within a process

  async function load(): Promise<WalrusFacts> {
    if (cache) return cache;
    try {
      const blobId = await opts.pointers.get(key);
      cache =
        blobId === undefined
          ? emptyFacts(opts.userId)
          : (JSON.parse(
              new TextDecoder().decode(await opts.client.getBlob(blobId)),
            ) as WalrusFacts);
    } catch {
      cache = emptyFacts(opts.userId); // resilient — never break a turn on a Walrus error
    }
    return cache;
  }

  async function save(facts: WalrusFacts): Promise<void> {
    cache = facts;
    const ref = await opts.client.putBlob(JSON.stringify(facts));
    await opts.pointers.set(key, ref.blobId);
    opts.onStore?.(ref);
  }

  const contextMiddleware: ModelMiddleware = async (req, next) => {
    const mem = await load();
    if (mem.facts.length === 0 && mem.preferences.length === 0) return next(req);
    const parts = [`[User Memory for ${mem.userId}] (durable, stored on Walrus)`];
    if (mem.facts.length > 0)
      parts.push(`Known facts:\n${mem.facts.map((f) => `- ${f}`).join("\n")}`);
    if (mem.preferences.length > 0)
      parts.push(`Preferences:\n${mem.preferences.map((p) => `- ${p}`).join("\n")}`);
    const ctxMsg = { role: "system" as const, content: parts.join("\n\n") };
    const [first, ...rest] = req.messages;
    const messages =
      first?.role === "system" && first.content.includes("MUST always refer")
        ? [first, ctxMsg, ...rest]
        : [ctxMsg, ...req.messages];
    return next({ ...req, messages });
  };

  return {
    name: "walrus-memory",
    modelMiddleware: [contextMiddleware],
    tools: [
      defineTool({
        name: "remember_fact",
        description:
          "Store a durable fact or preference about the user on Walrus, to recall in future sessions. " +
          "Use whenever the user shares something durable — their name, role, preferences, projects, or goals.",
        parameters: z.object({
          fact: z.string().min(1).describe("The fact or preference, phrased to stand on its own."),
          kind: z.enum(["fact", "preference"]).default("fact"),
        }),
        execute: async ({ fact, kind }) => {
          const mem = await load();
          const list = kind === "preference" ? mem.preferences : mem.facts;
          if (!list.includes(fact)) {
            list.push(fact);
            if (list.length > maxFacts) list.shift();
          }
          mem.updatedAt = new Date().toISOString();
          await save(mem);
          return {
            stored: fact,
            kind,
            totalFacts: mem.facts.length,
            totalPreferences: mem.preferences.length,
          };
        },
      }),
      defineTool({
        name: "recall_memory",
        description:
          "Retrieve everything currently remembered about the user (facts + preferences). " +
          "Use when asked what you remember.",
        parameters: z.object({}),
        execute: () => load(),
      }),
    ],
  };
}
