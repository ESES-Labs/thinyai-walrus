# Thiny — Technical Design Document

> _Microkernel + hexagonal architecture for AI agents. The kernel orchestrates; plugins do the work; deterministic code keeps it safe._

|                  |                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------- |
| **Project**      | Thiny — AI-agent microkernel                                                             |
| **Document**     | Technical Design / Architecture                                                          |
| **Version**      | 0.1 (Draft)                                                                              |
| **Status**       | Draft — pre-implementation                                                               |
| **Owner**        | xfajarr (deryanyudianto@gmail.com)                                                       |
| **Last updated** | 2026-05-29                                                                               |
| **Related docs** | `thiny-prd.md` (product), `thiny-implementation-plan.md` (TDD build plan with full code) |

---

## 1. Architecture overview

Thiny combines two established patterns:

- **Microkernel (plugin architecture):** a minimal core provides _mechanism_ only (a loop, a registry, a composer, an event bus). All _capability_ lives in plugins. (cf. VS Code, the Linux kernel.)
- **Hexagonal (Ports & Adapters):** the core defines interfaces (_ports_) for everything it depends on and never imports a concrete implementation. The outside world plugs in via _adapters_. **The dependency arrow always points inward.**

```
                    ┌─────────── HEADS (transports) ───────────┐
                    │   CLI    │   HTTP/SSE   │  Daemon (cron)  │
                    └────┬─────┴──────┬───────┴────────┬────────┘
                         ▼            ▼                ▼
        ╔══════════════════════════════════════════════════════╗
        ║                    THE KERNEL                          ║
        ║   ┌──────────────┐  drives   ┌────────────────────┐   ║
        ║   │  Agent Loop  │ ────────► │   Tool Registry    │   ║
        ║   └──────┬───────┘           └────────────────────┘   ║
        ║          │ via composed middleware (the onion)        ║
        ║          ▼  depends on PORTS (interfaces only)         ║
        ║   ┌─────────────┐ ┌──────────────┐ ┌──────────────┐   ║
        ║   │ModelProvider│ │MemoryBackend │ │Signer / Logger│  ║
        ║   └──────△──────┘ └──────△───────┘ └──────△───────┘   ║
        ╚═════════ │ ═══════════════ │ ═══════════════ │ ═══════╝
                   │ implements      │ implements      │ implements
        ┌──────────┴─────────────────┴─────────────────┴────────┐
        │  ADAPTERS + PLUGINS (the outside world)                │
        │  ai-sdk · sqlite · viem · circle · mcp · evm · solana  │
        └────────────────────────────────────────────────────────┘
```

## 2. Design principles & invariants

These are enforced, not aspirational:

1. **Core imports nothing concrete.** `@thiny/core` depends only on its own ports + Zod. No provider, no chain lib, no DB.
2. **The LLM is untrusted.** Tool arguments are Zod-validated at the boundary. Policy decisions are computed from tool definitions + parsed args **only** — never from model free-text.
3. **Errors are observations.** A failed tool call is caught and fed back to the model as `ERROR: …`, not thrown out of the loop.
4. **Safety is middleware.** Policy, approval, audit, budget, compaction all compose around the loop; the loop itself stays tiny.
5. **Streaming changes delivery, not gates.** The streaming path sits _inside_ the composed middleware and reuses the same tool execution.
6. **Layers depend downward only.** Heads → agent API → kernel → ports → domain. Plugins → core. Never the reverse.

## 3. System layers

| Layer               | Responsibility                         | Examples                                                            |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| **0 — Domain**      | Pure data types, no deps               | `Message`, `ToolCall`, `ModelResponse`, `StreamEvent`, `Hex`        |
| **1 — Kernel**      | Orchestration mechanism                | agent loop, tool registry, composer, event bus, plugin loader       |
| **2 — Ports**       | Interfaces the core owns               | `ModelProvider`, `MemoryBackend`, `Signer`, `Logger`, `Approver`    |
| **3 — Adapters**    | Concrete port implementations          | `model-aisdk`, `memory-sqlite`, `signer-viem`, `logger-pino`, `mcp` |
| **3 — Plugins**     | Domain capability (tools/middleware)   | `evm`, `solana`, `web-search`, safety middleware                    |
| **4 — Heads**       | Transports / how the world talks to it | CLI, HTTP/SSE, daemon                                               |
| **(aux) — Runtime** | Scheduler above the agent              | `@thiny/runtime` (interval + cron)                                  |

## 4. Core domain model

The whole system is built from ~5 types (full code in the implementation plan, Phase 1).

```ts
type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}
interface Usage {
  inputTokens: number;
  outputTokens: number;
}
type FinishReason = "stop" | "tool_calls" | "length" | "error";

interface ModelResponse {
  text?: string;
  toolCalls?: ToolCall[];
  finishReason: FinishReason;
  usage?: Usage;
}

type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolCall: ToolCall }
  | { type: "finish"; finishReason: FinishReason; usage?: Usage };
```

`Message[]` is the agent's working state. The loop grows it until the model stops calling tools.

## 5. Ports (the contracts)

```ts
interface ModelProvider {
  generate(messages: Message[], tools: Tool[]): Promise<ModelResponse>;
  stream?(messages: Message[], tools: Tool[]): AsyncIterable<StreamEvent>; // optional
}

interface MemoryBackend {
  load(sessionId: string): Promise<Message[]>;
  append(sessionId: string, messages: Message[]): Promise<void>;
}

interface Signer {
  address: Hex;
  chainId: number;
  isTestnet: boolean;
  signAndSend(tx: TxRequest): Promise<Hex>;
}

interface Logger {
  info;
  warn;
  error;
  child(bindings): Logger;
} // structured
type Approver = (req: ApprovalRequest) => Promise<boolean>; // human-in-the-loop
```

A `Tool` is the primary plugin contribution:

```ts
interface Tool<A = unknown> {
  name: string;
  description: string; // the LLM reads this to decide when to call
  parameters: z.ZodType<A>; // runtime validation + JSON schema for the model
  sensitive?: boolean; // money/destructive → policy defaults to "approve"
  tags?: string[];
  execute(args: A, ctx: Ctx): Promise<unknown>;
}
```

This is the **Dependency Inversion Principle** in its purest form: the kernel depends on these interfaces; adapters/plugins satisfy them.

## 6. The agent loop (control flow)

The heart of the kernel — the **ReAct** pattern (Reason + Act). Pseudocode (full code in plan Phase 1.5):

```
seed messages (system prompt + loaded history)
push user input
for step in 0..maxSteps:                  # ① circuit breaker
  res = generate(messages, tools)          # ② THINK (composed middleware wraps this)
  push assistant(res.text, res.toolCalls)
  if no toolCalls: return res.text         # ③ termination — model decided it's done
  results = parallel for each toolCall:     # ④ ACT
     validate args with Zod                 # ⑤ untrusted boundary
     try execute(args) else "ERROR: ..."    # ⑥ error-as-observation
  push tool results                         # ⑦ OBSERVE → loop back
throw MaxStepsError
```

The seven numbered ideas _are_ the theory of agents. The model — not your code — decides when it's done (③).

## 7. Middleware pipeline (the onion)

Cross-cutting concerns wrap the loop in composable layers (**Chain of Responsibility**). Two seams:

```ts
// wraps model.generate — for anything about the LLM call
type ModelMiddleware = (req: ModelRequest, next: ModelNext) => Promise<ModelResponse>;
// wraps tool execution — for authorization, audit, rate-limits
type ToolMiddleware = (call: ToolCallCtx, next: ToolNext) => Promise<unknown>;
```

Composed outside-in via `reduceRight`:

```
request → [audit [budget [compaction → MODEL → ] ] ] → response   (model side)
call    → [audit [policy [approval   → TOOL  → ] ] ] → result     (tool side)
```

To **deny**, a middleware throws before calling `next` — the loop turns it into an observation. Plugins contribute middleware; the kernel just composes the arrays. **This is how Thiny stays tiny while growing capability.**

| Middleware                          | Seam  | Purpose                                |
| ----------------------------------- | ----- | -------------------------------------- |
| `modelAudit` / `toolAudit`          | both  | immutable structured log of every call |
| `budget`                            | model | token/$ + call-count circuit breaker   |
| `compaction`                        | model | summarize old turns when context grows |
| `policy`                            | tool  | deterministic allow/deny/approve       |
| (approval is inside policy)         | tool  | human-in-the-loop for sensitive tools  |
| resilience (retry/cache/rate-limit) | both  | opt-in robustness                      |

## 8. Plugin system

A `Plugin` is a plain object; every field optional. Loaded in **two phases** so plugins can depend on each other:

```ts
interface Plugin {
  name: string;
  tools?: Tool[];
  memory?: MemoryBackend;
  modelMiddleware?: ModelMiddleware[];
  toolMiddleware?: ToolMiddleware[];
  setup?(ctx: Ctx): Promise<void>; // runs AFTER all plugins register
}
```

1. **Register** — collect all tools/middleware/memory. Registry is now complete.
2. **Setup** — each plugin's `setup(ctx)` runs; it can look up tools/services another plugin contributed.

This two-phase split (the **composition root** pattern) solves inter-plugin ordering without a dependency-graph engine. Full authoring guide: see `thiny-implementation-plan.md` Part B.

## 9. Memory & context management

The `MemoryBackend` port hides the storage medium. Three strategies, all behind the port:

- **Sliding window** (default, trivial).
- **Compaction/summarization** — a model middleware that, past a message threshold, summarizes the middle into a single system note while keeping the system prompt + recent turns.
- **Retrieval (RAG)** — a future vector-backed adapter; same port.

Memory is a _strategy, not a feature_: start with an in-memory array, upgrade to SQLite, then RAG, without touching the loop.

## 10. Streaming

Streaming is an **optional** `stream()` on `ModelProvider`. The agent's `run(input, { onToken })`:

- builds a model "base" that, when `onToken` is present and `model.stream` exists, drains the provider stream via `assembleStream`, emitting deltas and returning a normal `ModelResponse`;
- that base sits **inside** `composeModel(...)`, so budget/audit/compaction still wrap it, and tools still run through the composed tool middleware.

Invariant: **streaming never bypasses a safety gate.** It changes delivery only.

## 11. Autonomous runtime

A separate package, `@thiny/runtime`, turns the request-driven agent into an always-on one — a _scheduler above_ the agent (so a plain agent pulls in zero scheduler code).

```ts
interface Job {
  name: string;
  trigger: { kind: "interval"; ms: number } | { kind: "cron"; expr: string };
  input: string | (() => string | Promise<string>);
  sessionId?: string;
  maxRuns?: number; // per-job kill switch
}
class Runtime {
  runJob(job);
  start();
  stop();
}
```

Guards: **no-overlap** (a job won't run while its previous run is in flight), **`maxRuns`** kill switch, graceful shutdown. Every autonomous run still flows through the agent's policy + budget. Because no human is present, the interactive `Approver` is replaced by a **headless** one (`denyApprover` default, or `autoApprover([...])` scoped to an allowlist). Detailed autonomy safety model in the plan, Phase 9.

## 12. Security architecture

> The governing rule: **the LLM is an untrusted planner. It proposes; deterministic, non-AI code enforces.** Especially on-chain.

| Threat                                                               | Control                                                                                                                                                           | Where                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Prompt injection** (malicious web/chain content hijacks the agent) | Validate tool inputs at the boundary; policy decisions never read model/free-text; treat tool _outputs_ as untrusted too                                          | loop ⑤, `policy`                      |
| **Over-privileged actions**                                          | `sensitive: true` tools default to requiring approval; least-privilege tool sets                                                                                  | `Tool`, `policy`                      |
| **Fund loss** (rogue/over-large tx)                                  | Deterministic value caps + destination allowlists + testnet-only-by-default                                                                                       | `evmTransferRules`, `policy`          |
| **Key custody**                                                      | `Signer` port; testnet adapter ships first; **mainnet guard** refuses real-value signing unless explicitly opted in; prefer custodial wallet (Circle) for mainnet | `signer-viem`, future `signer-circle` |
| **Runaway cost**                                                     | Token/$ + call-count budget; max-steps loop guard                                                                                                                 | `budget`, loop ①                      |
| **Unattended autonomy**                                              | Headless deny-by-default approver, overlap guard, `maxRuns`, pause flag                                                                                           | `runtime`, `approvers`                |
| **Auditability**                                                     | Immutable structured log of every model + tool call                                                                                                               | `audit` (pino)                        |

Key design choice: caps and allowlists live in the **policy engine** (code), _not_ in the system prompt. "Please don't send more than X" is not a control; a `maxValueWei` rule is.

## 13. Repository structure

pnpm monorepo (full tree in the plan's appendix):

```
packages/
  core/                 @thiny/core — domain, ports, loop, registry, plugin,
                        middleware, compose, stream, approvers, agent
    middleware/         audit · budget · compaction · policy
  adapters/
    model-aisdk/        Vercel AI SDK behind ModelProvider
    memory-sqlite/      libsql
    signer-viem/        testnet + mainnet guard
    logger-pino/        structured audit
    mcp/                (proposed) MCP servers → tools
  plugins/
    web-search/         Web2 proof
    evm/                read tools + gated send + transfer rules
    solana/             (proposed)
  runtime/              @thiny/runtime — interval + cron scheduler
heads/
  cli/                  terminal head + approver + streaming
  http/                 (proposed) SSE head + web UI
  daemon/               headless always-on runtime
apps/
  create-thiny/         scaffolder
```

## 14. Tech stack & dependencies

| Concern            | Choice                                                         | Notes                                           |
| ------------------ | -------------------------------------------------------------- | ----------------------------------------------- |
| Language / runtime | TypeScript (strict, ESM) / Node 20+                            | `verbatimModuleSyntax`, `NodeNext`              |
| Model layer        | Vercel AI SDK v4 (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) | **only** behind the model adapter               |
| Validation         | Zod                                                            | tool params → JSON schema + runtime validation  |
| Web3               | viem                                                           | read + testnet sign                             |
| Memory             | `@libsql/client` (SQLite)                                      | swap behind the port                            |
| Logging/audit      | pino                                                           | structured JSON                                 |
| Scheduling         | croner                                                         | cron triggers in the runtime                    |
| Tests              | vitest                                                         | TDD throughout                                  |
| Monorepo           | pnpm workspaces                                                | shared `tsconfig.base.json`, `vitest.config.ts` |

> **Version isolation:** any AI SDK breaking change (v4→v5: `parameters`→`inputSchema`, usage field renames) is contained to a single adapter file. That containment _is_ the point of the port.

## 15. Data-flow examples

**A. Web2 request (with a tool call):**

```
user input → run() → [history loaded] → loop:
  generate (audit→budget→model)  → toolCalls=[web_search]
  execute web_search (audit→policy→tool)  → results
  generate again → final text  → persisted → returned
```

**B. On-chain transaction (the safety spine):**

```
"send 0.001 test ETH to 0xAllowed"
  → model proposes evm_send_native(to, valueWei)
  → tool middleware: audit → POLICY(evmTransferRules):
        value ≤ cap?  to ∈ allowlist?  → effect=approve
     → APPROVER prompt (human types y) [or headless deny]
  → execute: ctx.signer.signAndSend(tx)  → tx hash
  → hash returned to model → final answer
A non-allowlisted address is DENIED before any signing; the denial is fed back as an observation.
```

## 16. Error handling & observability

- **Tool failures** → caught in the loop, returned as `ERROR: <message>` observations; the model can recover.
- **Policy/budget violations** → typed errors (`PolicyError`, `BudgetError`, `MaxStepsError`) that surface clearly.
- **Event bus** emits lifecycle events (`beforeModelCall`, `afterToolCall`, `onError`, `onFinish`); handlers never crash the loop.
- **Audit middleware** writes a structured line per model/tool call (latency, finish reason, usage, errors) — the immutable trail for debugging and compliance.

## 17. Testing strategy

- **TDD throughout** (vitest). Every logic unit — loop, registry, composer, policy, budget, compaction, converters, runtime — is built test-first.
- **Fakes over mocks for I/O:** a fake `ModelProvider` drives the loop deterministically; injected `fetch`/clients keep plugin tests offline; `:memory:` libsql for memory tests; fake timers for the scheduler.
- **Eval harness (proposed, P12):** scripted scenarios with golden-transcript / tool-call assertions, run against a fake or recorded model — reliability before the demo.
- **Gate:** `pnpm -r exec tsc --noEmit && pnpm test` must be green.

## 18. Extensibility — how Thiny grows

- **New capability** → a plugin contributing tools.
- **New cross-cutting concern** → a middleware (no core change).
- **New model/storage/chain/wallet** → an adapter behind the relevant port.
- **New transport** → a head.
- **New ecosystem of tools** → the MCP adapter (consume any MCP server).

Each path leaves the core untouched. That's the whole architecture in one sentence.

## 19. Deployment considerations

- **Dev:** run TS directly via `tsx` (workspace packages resolve to `src/`). Fast iteration, no build step.
- **Production:** `tsc` build to `dist/`, publish packages with `@thiny/core` as a **peerDependency** for plugins; ship types.
- **Daemon/autonomy:** run the `daemon` head as a long-lived process (PM2/systemd/container); ensure budget caps + kill switches + (for on-chain) testnet or custodial wallet before going unattended.
- **Secrets:** never plaintext private keys in production; prefer KMS or a custodial wallet adapter.

## 20. Versioning & API stability

- **Semantic versioning.** The compatibility promise is the **core public contract**: the ports (`ModelProvider`, `MemoryBackend`, `Signer`, `Logger`), the `Plugin`/`Tool`/middleware types, and `createAgent`/`agent.run`.
- Adapters and plugins are the stable _extension surface_; their internals can change freely.
- Pre-1.0: ports may still shift; after v1, port changes are breaking-version events.

---

## Appendix — Glossary

- **Kernel** — the minimal core (loop, registry, composer, ports). Owns no concrete I/O.
- **Port** — an interface the core depends on (`ModelProvider`, etc.).
- **Adapter** — a concrete implementation of a port (`model-aisdk`, `signer-viem`).
- **Plugin** — a bundle of tools/middleware contributed to the kernel.
- **Tool** — a single callable capability with a Zod-validated schema.
- **Middleware** — a composable wrapper around model calls or tool execution (the onion).
- **Head** — a transport that drives the agent (CLI, HTTP, daemon).
- **Policy** — deterministic, non-AI rules that allow/deny/approve tool calls.
- **ReAct** — the Reason→Act→Observe loop that defines an agent.
- **Composition root** — the single place where concrete implementations meet interfaces (`createAgent`).
