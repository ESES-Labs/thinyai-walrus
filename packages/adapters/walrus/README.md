# @thiny/walrus

> Walrus blob adapter for Thiny — verifiable audit trail, artifact store, and HTTP blob client.

## Install

```bash
pnpm add @thiny/walrus
```

## Usage

```ts
import { walrusClient, walrusAuditLogger, verifyAuditTrail, walrusArtifacts } from "@thiny/walrus";
import { modelAuditMiddleware, toolAuditMiddleware } from "@thiny/core";

const client = walrusClient(); // public testnet publisher/aggregator — no WAL token needed

// Tee the audit trail into Walrus, then wire the wrapped logger into the audit middleware.
const audit = walrusAuditLogger(baseLogger, client, { sessionId });
const agent = await createAgent({
  model,
  plugins: [
    {
      name: "observability",
      modelMiddleware: [modelAuditMiddleware(audit)],
      toolMiddleware: [toolAuditMiddleware(audit)],
    },
  ],
});

await agent.run("...");
const blobId = await audit.flush(); // immutable, content-addressed action log

// Anyone can independently replay it by ID — the money shot:
const trail = await verifyAuditTrail(client, blobId!);
```

## Transcript memory (verifiable + portable)

```ts
import { walrusMemory, walrusClient, filePointerStore } from "@thiny/walrus";

const memory = walrusMemory({
  client: walrusClient(),
  pointers: filePointerStore("thiny-pointers.json"), // swap for the on-chain memory-head later
});
const agent = await createAgent({ model, memory });
```

Each `append` stores the full transcript as a content-addressed Walrus blob and records
`sessionId → blobId` in the pointer store; `load` resolves the pointer and GETs the blob. Exact and
verifiable — the right backend for transcripts (unlike `memwalMemory`, which is fuzzy/semantic).

## Public API

| Export                                                                                   | Description                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `walrusClient(opts)`                                                                     | HTTP blob client: `putBlob` → `WalrusBlobRef` / `getBlob`            |
| `walrusMemory(opts)`                                                                     | `MemoryBackend` over a content-addressed blob + `PointerStore`       |
| `inMemoryPointerStore()` / `filePointerStore(path)`                                      | Pointer stores (`sessionId → blobId`)                                |
| `walrusAuditLogger(base, client, opts)`                                                  | Logger wrapper that captures + `flush()`es the audit trail to a blob |
| `verifyAuditTrail(client, blobId)`                                                       | Re-fetch and parse an audit trail by blob ID                         |
| `walrusArtifacts(client)`                                                                | Named artifact store: `put(name, bytes)` / `get(blobId)`             |
| `explorerLinks(ref, network)` / `walruscanBlobUrl` / `suiscanTxUrl` / `suiscanObjectUrl` | Explorer URL helpers                                                 |

Defaults to the public Walrus testnet endpoints (override `publisher` / `aggregator` — they rotate).
