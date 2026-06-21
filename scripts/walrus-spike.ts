#!/usr/bin/env node
/**
 * walrus-spike.ts — P0 tracer bullet for the Walrus integration.
 *
 * Proves the two riskiest unknowns round-trip from our environment:
 *   1. A blob through the public Walrus HTTP publisher/aggregator (no WAL token needed).
 *   2. A fact through MemWal remember()/recall() — only if MemWal creds are in .env.
 *
 * Run:  node --env-file=.env --import tsx scripts/walrus-spike.ts
 *
 * DoD: a blob round-trips through Walrus HTTP, and (if provisioned) memory round-trips through MemWal.
 */

import {
  walrusClient,
  walrusArtifacts,
  explorerLinks,
} from "../packages/adapters/walrus/src/index.js";
import { memwalMemory } from "../packages/adapters/memory-memwal/src/index.js";

async function spikeWalrusBlob(): Promise<void> {
  console.log("\n=== Walrus HTTP blob round-trip ===");
  const client = walrusClient({
    publisher: process.env.WALRUS_PUBLISHER_URL,
    aggregator: process.env.WALRUS_AGGREGATOR_URL,
  });
  console.log(`publisher:  ${client.publisher}`);
  console.log(`aggregator: ${client.aggregator}`);

  const payload = `thiny-walrus-spike @ ${new Date().toISOString()}`;
  const ref = await client.putBlob(payload);
  console.log(`PUT  → blobId: ${ref.blobId}`);
  const links = explorerLinks(ref, client.network);
  console.log(`       walrus: ${links.blob}`);
  if (links.tx) console.log(`       tx:     ${links.tx}`);
  if (links.object) console.log(`       object: ${links.object}`);

  const got = new TextDecoder().decode(await client.getBlob(ref.blobId));
  console.log(`GET  → "${got}"`);
  if (got !== payload) throw new Error("blob round-trip mismatch!");

  // Artifact helper sanity check (name survives).
  const art = walrusArtifacts(client);
  const artRef = await art.put("spike.txt", payload);
  const back = await art.get(artRef.blobId);
  console.log(`artifact ${back.name} round-tripped via ${artRef.blobId}`);
  console.log("✓ Walrus blob + artifact round-trip OK");
}

async function spikeMemWal(): Promise<void> {
  console.log("\n=== MemWal memory round-trip ===");
  const { MEMWAL_DELEGATE_KEY, MEMWAL_ACCOUNT_ID, MEMWAL_SERVER_URL, MEMWAL_NAMESPACE } =
    process.env;
  if (!MEMWAL_DELEGATE_KEY || !MEMWAL_ACCOUNT_ID) {
    console.log("⊘ skipped — set MEMWAL_DELEGATE_KEY + MEMWAL_ACCOUNT_ID in .env (Playground) to run this leg.");
    return;
  }
  const memory = await memwalMemory({
    delegateKey: MEMWAL_DELEGATE_KEY,
    accountId: MEMWAL_ACCOUNT_ID,
    serverUrl: MEMWAL_SERVER_URL,
    namespace: MEMWAL_NAMESPACE ?? "thiny-spike",
  });
  const sessionId = "spike-session";
  await memory.append(sessionId, [
    { role: "user", content: "remember: my favourite chain is Sui" },
    { role: "assistant", content: "Noted — Sui." },
  ]);
  const loaded = await memory.load(sessionId);
  console.log(`recalled ${String(loaded.length)} messages for ${sessionId}`);
  if (loaded.length === 0) throw new Error("MemWal recall returned nothing!");
  console.log("✓ MemWal memory round-trip OK");
}

async function main(): Promise<void> {
  await spikeWalrusBlob();
  await spikeMemWal();
  console.log("\nP0 spike complete.");
}

main().catch((err: unknown) => {
  console.error("\n✗ spike failed:", err);
  process.exit(1);
});
