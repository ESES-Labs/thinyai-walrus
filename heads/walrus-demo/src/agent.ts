import {
  createAgent,
  denyApprover,
  modelAuditMiddleware,
  toolAuditMiddleware,
  type Agent,
  type Logger,
  type ModelProvider,
  type Plugin,
} from "@thiny/core";
import {
  walrusMemory,
  walrusArtifacts,
  walrusAuditLogger,
  type WalrusClient,
  type WalrusBlobRef,
  type WalrusAuditLogger,
  type WalrusArtifacts,
  type PointerStore,
} from "@thiny/walrus";
import { suiStatusTool } from "./tools.js";

const SYSTEM_PROMPT =
  "You are an autonomous monitoring agent — NOT a chatbot. On each tick:\n" +
  "1. If you have a recall_memory tool, recall what you noted previously.\n" +
  "2. Call check_sui_status to read the current Sui testnet checkpoint.\n" +
  "3. Compare it to the checkpoint you remember from last tick and state whether it advanced (by how much).\n" +
  "4. If you have a remember_fact tool, remember the new checkpoint.\n" +
  "Keep your reply to one or two sentences. Never ask the user anything.";

const SESSION_ID = "walrus-demo";

/** A no-op logger used when the caller doesn't supply one (tests). */
function silentLogger(): Logger {
  const logger: Logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  };
  return logger;
}

export interface WalrusDemoOptions {
  model: ModelProvider;
  /** Walrus blob client (transcript, audit, artifacts all go through it). */
  walrus: WalrusClient;
  /** Where `sessionId → transcript blobId` is recorded (file locally; on-chain memory-head later). */
  pointers: PointerStore;
  /** Forwarding logger (audit records also tee here). Defaults to silent. */
  logger?: Logger;
  /** Optional MemWal facts plugin for semantic memory — omit when no creds. */
  factsPlugin?: Plugin;
  /** Injectable Sui RPC fetch (tests). */
  suiFetch?: typeof fetch;
  /** Sui RPC URL override. */
  suiRpcUrl?: string;
  /** Called after each tick with the stored artifact's verifiable ref. */
  onArtifact?: (ref: WalrusBlobRef) => void;
  /** Called after each tick with the flushed audit trail's verifiable ref. */
  onAudit?: (ref: WalrusBlobRef) => void;
  /** Called after each tick with the persisted transcript's verifiable ref. */
  onMemory?: (ref: WalrusBlobRef) => void;
}

export interface WalrusDemoAgent {
  /** Drop-in {@link Agent} for `Runtime` — each `run` also flushes audit + stores an artifact. */
  agent: Agent;
  audit: WalrusAuditLogger;
  artifacts: WalrusArtifacts;
  /** The fixed session ID the demo persists/recalls under (same across restarts → portability). */
  sessionId: string;
}

/**
 * Build the Walrus demo agent: a monitoring agent whose memory (transcript), action log (audit),
 * and reports (artifacts) all live on Walrus and are independently verifiable.
 *
 * Wrap pattern: the returned `agent.run` calls the real agent, then flushes the per-tick audit
 * trail and stores a report artifact. The transcript pointer is updated inside `walrusMemory.append`.
 */
export async function createWalrusDemoAgent(opts: WalrusDemoOptions): Promise<WalrusDemoAgent> {
  const base = opts.logger ?? silentLogger();
  const audit = walrusAuditLogger(base, opts.walrus, { sessionId: SESSION_ID });
  const artifacts = walrusArtifacts(opts.walrus);
  const memory = walrusMemory({
    client: opts.walrus,
    pointers: opts.pointers,
    onStore: (ref) => opts.onMemory?.(ref),
  });

  const plugins: Plugin[] = [
    {
      name: "observability",
      modelMiddleware: [modelAuditMiddleware(audit)],
      toolMiddleware: [toolAuditMiddleware(audit)],
    },
  ];
  if (opts.factsPlugin) plugins.push(opts.factsPlugin);

  const inner = await createAgent({
    model: opts.model,
    logger: audit,
    memory,
    systemPrompt: SYSTEM_PROMPT,
    approver: denyApprover, // headless: deny sensitive tools by default
    tools: [suiStatusTool({ rpcUrl: opts.suiRpcUrl, fetchImpl: opts.suiFetch })],
    plugins,
  });

  let tick = 0;

  const agent: Agent = {
    registry: inner.registry,
    events: inner.events,
    run: async (input, runOpts) => {
      const reply = await inner.run(input, runOpts);
      tick += 1;

      const artifact = await artifacts.put(
        `tick-${String(tick)}.json`,
        JSON.stringify({ tick, at: new Date().toISOString(), reply }),
      );
      opts.onArtifact?.(artifact);

      const trail = await audit.flush(runOpts?.sessionId ?? SESSION_ID);
      audit.reset();
      if (trail) opts.onAudit?.(trail);

      return reply;
    },
  };

  return { agent, audit, artifacts, sessionId: SESSION_ID };
}
