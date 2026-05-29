# Thiny

**The thin, tiny core for AI agents.**

A lightweight, plugin-based TypeScript microkernel for building AI agents — Web2 tools, on-chain/DeFi, autonomous bots — from a single reusable core.

```
npm create thiny@latest my-agent
```

---

## Why Thiny?

Most agent frameworks (ElizaOS, Hermes, Hummingbot) are built to *run a product*. Thiny is built for builders who create agents repeatedly and need a core they fully own:

- **Tiny by default.** The kernel is ~600 LOC. Read it in one sitting.
- **Extend without touching the core.** Every capability is a plugin. Adding a new API, chain, or tool never requires editing the kernel.
- **Production safety built in.** Deterministic policy engine, approval gates, budget circuit breakers, and audit logs ship as opt-in middleware — not afterthoughts.
- **Web2 + Web3 from one core.** The kernel knows nothing about blockchains. On-chain capability is just plugins.

---

## Quick start

```bash
# prerequisites: Node 20+, pnpm 9+
git clone https://github.com/getthiny/thiny
cd thiny
pnpm install
cp .env.example .env      # add your OPENAI_API_KEY
pnpm cli                  # run the interactive CLI agent
```

Type a message at the `>` prompt. The agent streams responses token-by-token.

---

## The minimal agent

```ts
import { createAgent, defineTool } from "@thiny/core";
import { aiSdkModel } from "@thiny/model-aisdk";
import { z } from "zod";

const agent = await createAgent({
  model: aiSdkModel({ model: "openai:gpt-4o-mini" }),
  systemPrompt: "You are a helpful assistant.",
  tools: [
    defineTool({
      name: "get_time",
      description: "Return the current UTC time.",
      parameters: z.object({}),
      execute: async () => ({ utc: new Date().toISOString() }),
    }),
  ],
});

const reply = await agent.run("What time is it?");
console.log(reply);
```

---

## Adding a plugin

Plugins are the primary extension point. A plugin contributes tools, middleware, and a memory backend — and is loaded without touching the kernel.

```ts
import { webSearchPlugin } from "@thiny/plugin-web-search";

const agent = await createAgent({
  model: aiSdkModel({ model: "openai:gpt-4o-mini" }),
  plugins: [webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY! })],
});

const answer = await agent.run("What happened in tech news today?");
```

See [docs/PLUGINS.md](docs/PLUGINS.md) for a complete guide to building your own plugins.

---

## Streaming

Pass `onToken` to stream responses token-by-token:

```ts
await agent.run("Tell me a story", {
  onToken: (delta) => process.stdout.write(delta),
});
```

Streaming reuses the same composed middleware — budget, audit, and policy all still apply.

---

## Production safety (opt-in middleware)

```ts
import { modelAudit, toolAudit, budgetMiddleware, policyMiddleware } from "@thiny/core";

const agent = await createAgent({
  model: aiSdkModel({ model: "openai:gpt-4o-mini" }),
  plugins: [
    {
      name: "safety",
      modelMiddleware: [
        modelAudit(logger),                                  // log every LLM call
        budgetMiddleware({ maxCalls: 20, maxTokens: 100_000 }), // circuit breaker
      ],
      toolMiddleware: [
        toolAudit(logger),                                   // log every tool call
        policyMiddleware(myRules),                           // deterministic gate
      ],
    },
  ],
  approver: async (req) => {                                 // human-in-the-loop
    const ans = await readline.question(`Approve ${req.tool}? [y/N] `);
    return ans.trim().toLowerCase() === "y";
  },
});
```

---

## Repository layout

```
packages/
  core/                 @thiny/core — domain, ports, loop, registry, middleware, agent
  adapters/
    model-aisdk/        @thiny/model-aisdk — Vercel AI SDK behind the ModelProvider port
  plugins/
    web-search/         @thiny/plugin-web-search — Brave Search API (Web2 example)
heads/
  cli/                  @thiny/cli — interactive terminal agent
docs/
  PLUGINS.md            Plugin development guide
  ARCHITECTURE.md       Architecture deep-dive
  QUICKSTART.md         5-minute getting started guide
```

---

## Packages

| Package | Description |
|---|---|
| `@thiny/core` | The microkernel: loop, registry, ports, middleware, plugin system |
| `@thiny/model-aisdk` | Vercel AI SDK adapter (OpenAI, Anthropic, any `@ai-sdk` provider) |
| `@thiny/plugin-web-search` | Web search via Brave Search API |

More packages arrive in later phases: `@thiny/memory-sqlite`, `@thiny/plugin-evm`, `@thiny/plugin-solana`, `@thiny/runtime` (autonomous scheduler), and more. See the [implementation plan](../thiny-implementation-plan.md).

---

## Documentation

- [Quickstart](docs/QUICKSTART.md) — running your first agent in 5 minutes
- [Plugin Guide](docs/PLUGINS.md) — building and publishing plugins
- [Architecture](docs/ARCHITECTURE.md) — how the kernel works
- [Implementation Plan](../thiny-implementation-plan.md) — the full TDD build roadmap (P0–P20)

---

## Contributing

Thiny is in active development. The implementation plan lives at `../thiny-implementation-plan.md` — each phase is a self-contained tracer bullet. Pick a phase and follow the TDD steps.

---

## License

MIT
