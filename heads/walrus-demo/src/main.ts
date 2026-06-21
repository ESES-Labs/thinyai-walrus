/**
 * Thiny × Walrus demo head — an autonomous monitoring agent with verifiable, portable memory.
 *
 * Each tick the agent: recalls prior context, reads live Sui testnet state, records its decision,
 * and persists three things to Walrus — the transcript (memory), the action log (audit), and a
 * report (artifact) — each addressable by a content hash you can verify on Walruscan/Suiscan.
 *
 * Usage:
 *   pnpm walrus-demo
 *   TICK_MS=15000 MAX_RUNS=5 pnpm walrus-demo
 *   WALRUS_AUDIT is implicit here (the demo always audits). Set MEMWAL_* for semantic facts.
 */
import { pinoLogger } from "@thiny/logger-pino";
import { loadThinyConfig } from "@thiny/model-aisdk";
import { Runtime } from "@thiny/runtime";
import {
  walrusClient,
  filePointerStore,
  moveObjectPointerStore,
  explorerLinks,
  type PointerStore,
  type WalrusBlobRef,
  type WalrusNetwork,
} from "@thiny/walrus";
import { memwalFactsPlugin } from "@thiny/memory-memwal";
import { suiMemoryHead, type SuiMemoryHead } from "@thiny/signer-sui";
import { createWalrusDemoAgent } from "./agent.js";

function printRef(label: string, ref: WalrusBlobRef, network: WalrusNetwork): void {
  const links = explorerLinks(ref, network);
  // Human-facing verifiable output (the "money shot") — stdout, alongside structured pino logs.
  process.stdout.write(`\n  ${label} → ${ref.blobId}\n    walrus: ${links.blob}\n`);
  if (links.tx) process.stdout.write(`    tx:     ${links.tx}\n`);
  if (links.object) process.stdout.write(`    object: ${links.object}\n`);
}

async function main(): Promise<void> {
  const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info" });
  const network: WalrusNetwork = process.env.WALRUS_NETWORK === "mainnet" ? "mainnet" : "testnet";

  const walrus = walrusClient({
    network,
    publisher: process.env.WALRUS_PUBLISHER_URL,
    aggregator: process.env.WALRUS_AGGREGATOR_URL,
  });

  // Pointer store: on-chain memory-head (verifiable + portable) when SUI_* is configured,
  // otherwise a local JSON file. Same PointerStore interface — drop-in.
  let pointers: PointerStore;
  let head: SuiMemoryHead | undefined;
  if (process.env.SUI_PACKAGE_ID && process.env.SUI_MEMORY_HEAD_ID) {
    head = suiMemoryHead({
      packageId: process.env.SUI_PACKAGE_ID,
      objectId: process.env.SUI_MEMORY_HEAD_ID,
      rpcUrl: process.env.SUI_RPC_URL,
      secretKey: process.env.SUI_SECRET_KEY,
    });
    pointers = moveObjectPointerStore(head);
    logger.info({ event: "pointer_store", kind: "on-chain", head: process.env.SUI_MEMORY_HEAD_ID }, "Pointer store: on-chain memory-head");
  } else {
    pointers = filePointerStore(process.env.WALRUS_POINTERS ?? "thiny-pointers.json");
    logger.info({ event: "pointer_store", kind: "local-file" }, "Pointer store: local file (set SUI_* for on-chain)");
  }

  // Semantic facts layer is opt-in (needs MemWal Playground creds).
  const factsPlugin =
    process.env.MEMWAL_DELEGATE_KEY && process.env.MEMWAL_ACCOUNT_ID
      ? memwalFactsPlugin({
          delegateKey: process.env.MEMWAL_DELEGATE_KEY,
          accountId: process.env.MEMWAL_ACCOUNT_ID,
          serverUrl: process.env.MEMWAL_SERVER_URL,
          namespace: process.env.MEMWAL_NAMESPACE ?? "walrus-demo",
        })
      : undefined;

  const { agent, sessionId } = await createWalrusDemoAgent({
    model: loadThinyConfig(),
    walrus,
    pointers,
    logger,
    factsPlugin,
    onMemory: (ref) => {
      printRef("memory (transcript)", ref, network);
    },
    onAudit: (ref) => {
      printRef("audit trail", ref, network);
      // Also record the audit pointer on-chain (best-effort; never blocks the tick).
      if (head?.address) {
        void head.update({ audit: ref.blobId }).catch((err: unknown) => {
          logger.warn(
            { event: "audit_pointer_update_failed", error: String(err) },
            "Failed to update on-chain audit pointer",
          );
        });
      }
    },
    onArtifact: (ref) => {
      printRef("artifact (report)", ref, network);
    },
  });

  const tickMs = Number(process.env.TICK_MS ?? 60_000);
  const maxRuns = process.env.MAX_RUNS ? Number(process.env.MAX_RUNS) : undefined;

  const runtime = new Runtime({
    agent,
    logger,
    jobs: [
      {
        name: "watch",
        trigger: { kind: "interval", ms: tickMs },
        input: "Monitoring tick. Observe Sui testnet status and note any change since last tick.",
        sessionId, // fixed → memory accumulates and resumes across restarts
        maxRuns,
      },
    ],
  });

  runtime.start();
  logger.info(
    { event: "walrus_demo_ready", tickMs, maxRuns: maxRuns ?? "unlimited", network, facts: !!factsPlugin },
    `Walrus demo ready — tick every ${String(tickMs)}ms. Verify a trail later with: thiny /verify <blobId>`,
  );

  const shutdown = async (): Promise<void> => {
    logger.info({ event: "walrus_demo_shutdown" }, "Shutting down…");
    await runtime.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
