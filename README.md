<div align="center">

# Thiny

**A thin, tiny microkernel for AI agents — with verifiable, portable memory on Walrus.**

[![npm](https://img.shields.io/npm/v/thinyai?label=thinyai)](https://www.npmjs.com/package/thinyai)
[![Sui Overflow 2026](https://img.shields.io/badge/Sui%20Overflow%202026-Walrus%20track-6FBCF0)](SUBMISSION.md)
[![license](https://img.shields.io/badge/license-MIT-black)](LICENSE)

One kernel, any LLM, any chain. Agents that **remember and build across sessions** — because their
memory, audit trail, and artifacts live on **Walrus**, pinned by an on-chain pointer on **Sui** —
not trapped inside one app.

```bash
bun add -g thinyai && thiny      # install the CLI, then chat
```

</div>

---

## Why Thiny

Most agent frameworks are built to *run a product*. Thiny is built to *build agents repeatedly* —
hackathons, prototypes, production:

- **Tiny.** The kernel is ~600 LOC — read it in one sitting.
- **Verifiable memory, not siloed memory.** Memory, audit logs, and artifacts persist to Walrus and
  are addressable + verifiable by content hash — portable across agents and tools.
- **Any LLM.** OpenAI, Anthropic, Ollama, Groq, any OpenAI-compatible endpoint — just set a base URL.
- **Web2 + Web3, one contract.** REST calls and on-chain actions are the same plugin shape.
- **Safe by construction.** Policy engine, approval gates, budget breakers, deterministic tool
  routing, and a loop guard — opt-in middleware, not afterthoughts.

---

## ⭐ Verifiable, portable memory on Walrus

Agents today are stateless and fragmented — they forget across sessions and lock memory inside one
app. Thiny makes memory a first-class, verifiable artifact:

| What | Where | Why it matters |
|---|---|---|
| **Memory** (facts the agent learns) | `@thiny/walrus` → content-addressed Walrus blobs | Recall across sessions, verifiable on Walruscan |
| **Audit trail** (every action) | immutable Walrus blob per turn | Tamper-evident, replayable record |
| **Artifacts** (reports, datasets) | named Walrus blobs | Shareable, portable outputs |
| **Pointer** (latest blob IDs) | `move/memory_head` Move object on **Sui** | Any agent/tool can discover + verify the canonical memory |
| **Semantic recall** *(optional)* | `@thiny/memory-memwal` → **MemWal** | Fuzzy fact search across sessions |

Memory is written to a **local cache instantly** (reliable + fast) *and* mirrored to Walrus (durable +
verifiable), so cross-session memory never waits on the network — and you still get a Walruscan link
for every write.

```bash
pnpm walrus-demo                       # autonomous monitor: each tick persists memory + audit + report to Walrus
TICK_MS=15000 MAX_RUNS=5 pnpm walrus-demo
```

→ Full track write-up: **[SUBMISSION.md](SUBMISSION.md)**

---

## On-chain execution on Sui

Thiny signs and submits Sui transactions through a **gated executor**, and pairs with
[Rill](https://rill.naisu.one) for keyless, protocol-aware transaction building.

- **`@thiny/signer-sui`** — `suiSigner` (dry-run + sign, mainnet guard) and `suiMemoryHead` (the on-chain pointer).
- **`@thiny/plugin-sui`** — read + execute tools, all through one gated path *(re-simulate → policy → approval → sign → submit)*:
  - `sui_balances` / `sui_object` — read all coins across all the user's addresses.
  - `sui_transfer` / `sui_move_call` — the agent builds + signs its own transactions.
  - `sui_execute_ptb` — signs an unsigned PTB a builder (e.g. Rill) produced.
- **`@thiny/mcp`** — paste a hosted MCP URL (e.g. Rill) → every protocol it exposes becomes a tool.

```ts
import { createAgent } from "@thiny/agent";
import { mcpHttpPlugin } from "@thiny/mcp";
import { suiPlugin } from "@thiny/plugin-sui";
import { suiSigner } from "@thiny/signer-sui";

const rill = await mcpHttpPlugin({ url: process.env.RILL_MCP_URL!, name: "rill" });
const agent = await createAgent({
  model: loadThinyConfig(),
  plugins: [rill, suiPlugin({ signer: suiSigner({ secretKey: process.env.SUI_PRIVATE_KEY }) })],
});
```

---

## The `thiny` CLI

```bash
bun add -g thinyai      # or:  npm i -g thinyai  /  pnpm add -g thinyai
thiny                   # first launch walks you through setup — no .env to edit
```

| Command | Does |
|---|---|
| `thiny` | Interactive agent (markdown output, streaming) |
| `thiny init` | Pick model + agent name |
| `thiny sui init` | Add Sui: network + wallet (generate / import / Rill) |
| `thiny update` | Self-update to the latest version |

In-chat: type **`/`** for a live command palette · **`/connect`** switch LLM provider ·
**`/models`** change model · ask *"what's my balance?"* → all coins across all your wallets ·
paste a URL → the agent fetches it. Config lives in `~/.thiny/config.json` (chmod `0600`).

> The global package is **`thinyai`** (self-contained — `@thiny/*` bundled in). `thiny web` / `daemon`
> / `walrus-demo` are dev heads, run from a clone.

---

## Quick start (from source)

```bash
git clone https://github.com/ESES-Labs/thinyai-walrus && cd thinyai-walrus
pnpm install
pnpm cli                # interactive agent  (Walrus memory on by default — no creds needed)
```

Any LLM, no prefix needed — just a model + base URL:

```bash
# .env
THINY_MODEL=llama3
THINY_OPENAI_BASE_URL=http://localhost:11434/v1   # Ollama (local, free) — or Groq / OpenAI / etc.
```

Scaffold a fresh project in under a minute:

```bash
pnpm create-thiny my-bot --plugins web-search
```

---

## Architecture

A microkernel with hexagonal **ports** (Model, Memory, Logger, Tool, Plugin, Signer, Approver). The
ReAct loop is the only control flow; everything else is a plugin or middleware.

```
 your head (cli / http / daemon)
        │
   @thiny/core  ──  ReAct loop · tool registry · middleware (audit · budget · policy · compaction)
        │
   ports → adapters:  model-aisdk · walrus · signer-sui · mcp · memory-memwal · …
```

**Robust tool calling (important for Sui):** unambiguous read intents are routed deterministically via
forced `toolChoice`, overlapping tools carry USE-WHEN descriptions, and a repeat-guard stops a weak
model from looping on one tool — so behavior stays consistent even on small models.

<details>
<summary><strong>Packages</strong> (monorepo)</summary>

**Core** — `@thiny/core` (kernel) · `@thiny/agent` (batteries-included barrel) · `@thiny/runtime`
(scheduler) · `@thiny/eval` (deterministic eval harness)

**Walrus & Sui** — `@thiny/walrus` (memory + audit + artifacts) · `@thiny/memory-memwal` (MemWal
semantic recall) · `@thiny/signer-sui` · `@thiny/plugin-sui` · `@thiny/mcp` · `move/memory_head`

**Other adapters** — `@thiny/model-aisdk` · `@thiny/signer-viem` · `@thiny/memory-sqlite` ·
`@thiny/memory-vec` · `@thiny/logger-pino` · `@thiny/otel`

**Plugins** — `plugin-evm` · `plugin-solana` · `plugin-web-search` (Exa / Brave) · `plugin-market` ·
`plugin-tokens` · `plugin-knowledge` (RAG) · `plugin-trading-policy` · `plugin-agents` · `plugin-resilience`

**Heads** — `heads/cli` (the `thinyai` package) · `heads/http` (SSE server) · `heads/daemon` ·
`heads/walrus-demo` · `apps/create-thiny`

</details>

---

## Docs

| Doc | Contents |
|---|---|
| [SUBMISSION.md](SUBMISSION.md) | **Sui Overflow 2026 — Walrus track submission** |
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | Clone → running agent |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Microkernel design, ReAct loop, safety model |
| [docs/PLUGINS.md](docs/PLUGINS.md) | Plugin authoring + security contract |

---

MIT © ESES Labs — see [LICENSE](LICENSE).
