# @thiny/memory-memwal

> MemWal (Walrus Memory) integration for Thiny — portable, **semantic** long-term memory on Walrus.

## Install

```bash
pnpm add @thiny/memory-memwal @mysten-incubation/memwal
```

## Primary use: semantic facts (what MemWal is for)

```ts
import { memwalFactsPlugin } from "@thiny/memory-memwal";

const agent = await createAgent({
  model,
  plugins: [
    memwalFactsPlugin({
      delegateKey: process.env.MEMWAL_DELEGATE_KEY!, // hex, from the MemWal Playground
      accountId: process.env.MEMWAL_ACCOUNT_ID!,
      namespace: "my-agent", // share across agents for shared memory
    }),
  ],
});
```

Gives the agent two tools:

| Tool                   | What it does                                                                   |
| ---------------------- | ------------------------------------------------------------------------------ |
| `remember_fact(fact)`  | Store a durable fact (preference/goal/decision) in long-term memory on Walrus. |
| `recall_memory(query)` | Fuzzy-search prior facts — call at the start of a task.                        |

Auto-extract facts at the end of a session:

```ts
import { finalizeSessionToMemwal } from "@thiny/memory-memwal";
await finalizeSessionToMemwal({ model, delegateKey, accountId, transcript });
```

A fact stored on one machine is recalled on another — the brain lives on Walrus, not local disk.

## Transcript persistence?

For storing the **conversation transcript**, prefer **`walrusMemory` (`@thiny/walrus`)** — a
content-addressed blob + pointer, which is exact and verifiable. MemWal is semantic (fuzzy), so
`memwalMemory` (below) only emulates exact-key KV and degrades as memory grows.

`memwalMemory(opts)` remains as a documented, caveated convenience for short demos.

## Public API

| Export                          | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `memwalFactsPlugin(opts)`       | `remember_fact` + `recall_memory` tools (the headline)           |
| `finalizeSessionToMemwal(opts)` | Extract durable facts from a transcript and store them           |
| `memwalMemory(opts)`            | Caveated `MemoryBackend` (prefer `walrusMemory` for transcripts) |
| `MemWalCreds` / `MemWalLike`    | Shared credential inputs / injectable client seam                |
