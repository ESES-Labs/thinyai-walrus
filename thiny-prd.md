# Thiny — Product Requirements Document

> _The minimal core of an AI agent. Own a kernel, not a framework._

|                  |                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| **Project**      | Thiny — lightweight plugin-based AI-agent microkernel                                                  |
| **Document**     | Product Requirements Document (PRD)                                                                    |
| **Version**      | 0.1 (Draft)                                                                                            |
| **Status**       | Draft — pre-implementation                                                                             |
| **Owner**        | xfajarr (deryanyudianto@gmail.com)                                                                     |
| **Last updated** | 2026-05-29                                                                                             |
| **Related docs** | `thiny-technical-design.md` (architecture), `thiny-implementation-plan.md` (build plan, Phases P0–P9+) |

---

## 1. Summary

**Thiny** is a lightweight, plugin-based AI-agent **microkernel** written in TypeScript. It gives builders a tiny, fully-understood core — an agent loop, a tool registry, and a set of ports (interfaces) — plus a clean plugin contract, so a capable agent (Web2 _or_ on-chain) can be running in minutes and hardened to production without a rewrite.

It exists for people who build agents **repeatedly** — at hackathons, in prototypes, in products — and are caught between two bad options: rebuilding scaffolding from scratch every time (slow, inconsistent), or adopting a heavyweight framework (ElizaOS, Hummingbot, OpenClaw, Hermes) that is bloated, opinionated, and hard to debug at 3am.

Thiny's thesis: **a core small enough to read in one sitting, plus plugins for only what a given project needs, plus production-grade safety shipped as opt-in middleware.**

## 2. Problem statement

1. **The rebuild tax.** Every new agent project starts from a blank page — new architecture, new scaffolding, new agent loop. The result is exhausting to produce and inconsistent in quality.
2. **Heavyweight frameworks don't fit.** Existing frameworks are optimized for _running a product_, not for _winning a hackathon with code you fully control_. They bundle personas, marketplaces, connectors, and strategies you don't need, and you can't hold them in your head.
3. **On-chain agents are a liability.** Agents that can move funds add a money-safety burden — prompt injection, runaway spending, key custody — that most frameworks treat as an afterthought.

**The gap:** a tiny core you _own_, extended only by what you need, with safety as a first-class, deterministic layer.

## 3. Vision & product principles

> Build the smallest thing that is still a real agent framework, and make everything else a plugin.

1. **Own a kernel, not a framework.** The core must be small enough to read and debug completely (~1–1.5k LOC).
2. **Minimal by default, powerful by composition.** A bare agent is a few lines; capability and hardening are opt-in plugins/middleware.
3. **The LLM is an untrusted planner.** It _proposes_ actions; deterministic, non-AI code _enforces_ the rules. This is non-negotiable for on-chain use.
4. **Tools are the primary extension point.** Most projects extend the agent by adding tools.
5. **Same core, Web2 and Web3.** The kernel knows nothing about chains; blockchain capability is just plugins.
6. **Production-readiness is a layer, not a rewrite.** The hexagonal seams let a hackathon agent graduate to mainnet by flipping on middleware.

## 4. Goals & non-goals

**Goals**

- Go from nothing to a running agent in **< 1 minute** via a scaffolder.
- A core a developer can fully understand and modify.
- Extend capability **without touching the core** (plugins).
- Ship production safety (policy, approval, audit, budget) as **opt-in** middleware.
- Be **chain-agnostic** and serve both Web2 and Web3 hackathons from one core.
- Be a strong **learning artifact** for agent architecture.

**Non-goals**

- Not a no-code/low-code platform.
- Not a hosted SaaS or managed runtime.
- Not a character/persona engine (a system prompt suffices).
- Not a model provider (it wraps providers via an adapter).
- Not a kitchen-sink framework — explicit "won't build" list in §7.

## 5. Target users (personas)

| Persona                         | Need                                           | What Thiny gives them                                      |
| ------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| **Hackathon builder** (primary) | Speed, demo polish, reliability under pressure | Scaffolder, streaming, plugins, a core they can debug live |
| **Indie / product dev**         | A prototype that can graduate to production    | Hexagonal seams, opt-in hardening, persistence             |
| **Learner**                     | Understand how agents actually work            | A tiny, well-named, test-driven core                       |
| **Plugin author** (secondary)   | Extend without forking                         | A stable `Plugin` contract + testing kit                   |

## 6. Use cases / user stories

- _As a hackathon builder,_ I scaffold a running agent in under a minute with the plugins I choose, so I start building features, not plumbing.
- _As a Web3 builder,_ my agent reads chain state freely and can propose transactions that are policy-checked and approval-gated, so it's useful and safe.
- _As a developer,_ I add a new capability (an API, a protocol) as a plugin without editing the core.
- _As a developer,_ I run my agent **always-on** (heartbeat/cron) with hard kill switches, so it can act autonomously without burning money or signing rogue transactions.
- _As a developer,_ I stream responses token-by-token to a web UI for a polished demo.
- _As a security-conscious builder,_ I enforce per-transaction and destination caps **deterministically**, independent of what the LLM says.
- _As a developer,_ I run scripted evals against my agent so it doesn't crash on stage.

## 7. Requirements

### 7.1 Functional (MoSCoW)

**Must have (MVP → safety spine)**

- ReAct-style agent loop (think → act → observe) with a max-steps circuit breaker.
- Tool registry + typed `Tool` contract (Zod-validated inputs).
- `ModelProvider` port + Vercel AI SDK adapter (provider-agnostic).
- Plugin system (two-phase loader: register → setup).
- CLI head (interactive terminal agent).
- `MemoryBackend` port (in-memory default).
- Middleware pipeline (model + tool, onion composition).
- Audit middleware (immutable structured log).
- Budget + step circuit breaker.
- Deterministic **policy engine** + human **approval gate**.
- `Signer` port + testnet signing with a **mainnet guard**.
- Scaffolder (`create-thiny`).
- Token-by-token **streaming**.

**Should have**

- Autonomous **always-on runtime** (interval + cron jobs, kill switches, headless approvers).
- SQLite/libsql memory backend + context **compaction/summarization**.
- EVM plugin (read tools + gated send) and Web2 `web-search` plugin.
- **MCP client adapter** (consume any MCP server as tools).
- HTTP/SSE head (for web frontends).
- **Eval/replay harness** (scripted scenario testing).

**Could have**

- Solana plugin.
- Circle agent-wallet `Signer` adapter (production custody with built-in caps).
- RAG / vector memory adapter.
- Sub-agent / delegation primitive.
- Resilience middleware bundle (retry, timeout, cache, rate-limit, idempotency).
- Minimal web chat UI.

**Won't have (deliberately, to avoid bloat)**

- Sandboxed arbitrary-code execution backends (Docker/SSH/Modal).
- A character/persona DSL.
- A plugin marketplace _service_ (npm already is one).
- A built-in database/ORM (the memory port abstracts this).
- Connectors beyond CLI/HTTP/Telegram out of the box (each is just another head, added on demand).

### 7.2 Non-functional

- **Performance:** kernel overhead negligible relative to LLM latency; streaming delivers a fast first token.
- **Lightweight:** a bare agent pulls in only core + one model adapter; each plugin owns its own domain deps.
- **Security:** untrusted-planner model; all tool inputs Zod-validated; deterministic policy with caps/allowlists; mainnet opt-in only; budget caps; full audit trail. (See `thiny-technical-design.md` §12.)
- **Developer experience:** strict TypeScript end-to-end; TDD; `< 1 min` scaffold; a core readable in one sitting.
- **Portability:** Node 20+, ESM; works with any `@ai-sdk` provider (OpenAI, Anthropic, local).
- **Reliability:** tool failures become observations (no crashes); autonomy has overlap guards + kill switches.

## 8. Success metrics

| Metric                             | Target                                        |
| ---------------------------------- | --------------------------------------------- |
| Time from clone to a running agent | < 5 min (manual), < 1 min (scaffolder)        |
| Core size (readability)            | ~1–1.5k LOC, readable in one sitting          |
| New capability without core edits  | 100% of cases                                 |
| Unguarded mainnet sends            | 0 (policy-enforced)                           |
| Test coverage of core logic units  | High; loop/registry/policy/middleware all TDD |
| Reuse across projects              | Carried into every hackathon without rebuild  |

## 9. Scope & phasing

| Milestone | Phases             | Delivers                                                                         |
| --------- | ------------------ | -------------------------------------------------------------------------------- |
| **MVP**   | P0–P3              | Runnable kernel: loop, plugins, middleware (audit/budget)                        |
| **v0.2**  | P4–P6              | Persistence + compaction, Web3 read, safety spine (policy/approval/testnet sign) |
| **v0.3**  | P7–P9              | Scaffolder, streaming, autonomous runtime                                        |
| **v0.4+** | P10–P13 (proposed) | MCP adapter, HTTP head + web UI, eval harness, Solana plugin                     |

Each phase leaves a **running, testable** system (vertical tracer-bullet slices). Full task breakdown in `thiny-implementation-plan.md`.

## 10. Competitive landscape

|                   | **Thiny**                                               | ElizaOS         | Hummingbot          | OpenClaw          | Hermes                  |
| ----------------- | ------------------------------------------------------- | --------------- | ------------------- | ----------------- | ----------------------- |
| Footprint         | **Tiny owned core**                                     | Large           | Large               | Large             | Large                   |
| Extensibility     | Plugins (own contract)                                  | Plugins/actions | Strategies          | Skills/ClawHub    | Skills/sub-agents       |
| Web2 + Web3       | **Both, one core**                                      | Both            | Trading-focused     | Web2-focused      | Web2-focused            |
| Safety (on-chain) | **Deterministic policy + approval + caps, first-class** | Minimal         | Risk mgmt (coupled) | N/A               | Sandboxes               |
| Autonomy          | Interval + cron runtime                                 | Yes             | Continuous ticks    | Cron + heartbeats | Scheduling + sub-agents |
| Streaming         | Yes                                                     | Varies          | N/A                 | Yes               | Yes                     |
| Comprehensibility | **Read in one sitting**                                 | Hard            | Hard                | Hard              | Hard                    |

**Positioning:** Thiny is _deliberately smaller_ than all of them, _stronger on deterministic on-chain safety_, and _uniquely chain-agnostic from one core_. Breadth (connectors, sub-agents, sandboxes) is added per-project as plugins/heads rather than carried by default.

## 11. Risks & mitigations

| Risk                                     | Impact            | Mitigation                                                                                                    |
| ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| LLM SDK churn (AI SDK v4→v5 API changes) | Breakage          | Isolated behind a single `ModelProvider` adapter — one file changes                                           |
| Prompt injection → fund loss             | Severe (on-chain) | Untrusted-planner model; deterministic policy; approval gate; caps/allowlists; testnet default; mainnet guard |
| Scope creep back into bloat              | Loses core value  | Hard "won't build" list (§7); plugin-first rule; core LOC budget                                              |
| Many packages → maintenance burden       | Slows dev         | pnpm monorepo + shared tsconfig/vitest; minimal per-package surface                                           |
| Autonomous agent misbehaves unattended   | Cost/safety       | Overlap guard, `maxRuns` kill switch, headless deny-by-default approver, budget caps                          |

## 12. Open questions

- How deep should sub-agent orchestration go (a `ctx.spawn` primitive vs a full multi-agent layer)?
- Publish packages publicly (OSS) or keep private to the author's hackathon kit?
- Multi-session/multi-tenant scaling — out of scope for now, but does the memory port shape need to anticipate it?
- Default model: pin a cheap fast model for scaffolds, or force explicit choice?

## 13. Release & rollout

1. **Internal-first:** use across the author's own hackathons; iterate on real demos.
2. **Stabilize the core API** (ports, `Plugin`, `Tool`) toward v1; treat plugin/adapter APIs as the stable surface.
3. **Optional OSS release** once the core and plugin guide are battle-tested.
4. **Semantic versioning;** the core's public contract is the compatibility promise.
