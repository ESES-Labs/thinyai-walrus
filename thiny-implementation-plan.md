# Thiny Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, plugin-based TypeScript AI-agent microkernel ("Thiny") that can be reused across Web2 and on-chain/Web3 hackathons — from an empty folder to a runnable agent — with production-grade safety seams shipped as opt-in middleware.

**Architecture:** Microkernel + hexagonal (ports & adapters). A tiny owned core runs a ReAct-style loop (think → act → observe) over a tool registry. Everything external — model providers, memory, signers, domain tools — plugs in behind ports. Cross-cutting concerns (audit, budget, policy, approval, compaction) ship as composable middleware (the "onion"). The LLM is treated as an untrusted planner: it _proposes_ actions; deterministic, non-AI middleware _enforces_ the rules.

**Tech Stack:** TypeScript (strict, ESM) · Node 20+ · Vercel AI SDK v4 (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) behind the model port only · Zod · viem · `@libsql/client` (SQLite) · pino · vitest · pnpm workspaces.

---

## How to use this plan

- **Two parts.** _Part A_ is the build (Phases 0–7, each a vertical tracer-bullet slice that runs end-to-end). _Part B_ is the Plugin Development Guide & Architecture reference.
- **TDD where it has teeth.** Pure-logic units (loop, registry, middleware, policy, memory, converters) are built test-first. Scaffolding/config tasks give exact file contents + a verify command instead.
- **Commit conventions.** Conventional Commits (`feat:`, `test:`, `chore:`). If Claude Code runs the commits, append the footer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Project root.** Everything is created under `/Users/xfajarr/JarProjects/thiny/`. This plan file lives one level up, at `/Users/xfajarr/JarProjects/thiny-implementation-plan.md`.
- **Phase = milestone.** After each phase the system runs. Phases 1–3 are the reusable kernel; 5–6 are the Web3 safety spine; 7 is the scaffolder that ends "rebuild every hackathon."

### Table of contents

- Phase 0 — Monorepo scaffolding
- Phase 1 — Walking skeleton (domain → loop → model adapter → echo tool → CLI)
- Phase 2 — Plugin system (two-phase loader + first plugin)
- Phase 3 — Middleware pipeline (audit + budget + step circuit breaker)
- Phase 4 — Memory port (SQLite + compaction/summarization)
- Phase 5 — Web3 read slice (evm read tools + signer port stub)
- Phase 6 — Policy engine + approval gate + testnet signing
- Phase 7 — `create-thiny` scaffolder
- Phase 8 — Streaming responses (token-by-token)
- Phase 9 — Autonomous / always-on runtime (interval + cron, with safety)
- Phase 10 — MCP client adapter (consume any MCP server as tools)
- Phase 11 — HTTP/SSE head + tiny web UI
- Phase 12 — Eval / replay harness
- Phase 13 — Solana plugin
- Phase 14 — RAG / vector memory (knowledge plugin)
- Phase 15 — Sub-agents / delegation (`ctx.spawn`)
- Phase 16 — Resilience middleware bundle + structured output
- Phase 17 — Token ops (ERC-20 + SPL)
- Phase 18 — DEX swaps + simulate-before-send middleware
- Phase 19 — Market data + portfolio tracking
- Phase 20 — Trading strategy runtime + policy rules + paper-trading mode
- **Part B — Plugin Development Guide & Architecture**

---

# PART A — IMPLEMENTATION PLAN

## Phase 0 — Monorepo scaffolding

**Outcome:** An empty but installable pnpm monorepo with TypeScript, vitest, and a root tsconfig. `pnpm install` and `pnpm test` run cleanly.

### Task 0.1: Create the workspace root

**Files:**

- Create: `thiny/package.json`
- Create: `thiny/pnpm-workspace.yaml`
- Create: `thiny/.gitignore`
- Create: `thiny/.npmrc`

- [ ] **Step 1: Create the project directory and init git**

```bash
mkdir -p /Users/xfajarr/JarProjects/thiny
cd /Users/xfajarr/JarProjects/thiny
git init
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "thiny",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit",
    "cli": "tsx heads/cli/src/main.ts"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  },
  "packageManager": "pnpm@9.6.0"
}
```

- [ ] **Step 3: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "packages/adapters/*"
  - "packages/plugins/*"
  - "heads/*"
  - "apps/*"
```

- [ ] **Step 4: Write `.gitignore`**

```gitignore
node_modules
dist
*.log
.env
.env.*
!.env.example
*.sqlite
*.sqlite-journal
coverage
.DS_Store
```

- [ ] **Step 5: Write `.npmrc`** (so workspace deps resolve and tsx can load TS from deps)

```
link-workspace-packages=true
shamefully-hoist=false
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: init pnpm workspace"
```

### Task 0.2: Shared TypeScript + vitest config

**Files:**

- Create: `thiny/tsconfig.base.json`
- Create: `thiny/tsconfig.json`
- Create: `thiny/vitest.config.ts`

- [ ] **Step 1: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 2: Write root `tsconfig.json`** (solution file; references added as packages appear)

```json
{
  "files": [],
  "references": [{ "path": "packages/core" }]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/*.test.ts", "heads/**/*.test.ts", "apps/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Install and verify**

Run:

```bash
cd /Users/xfajarr/JarProjects/thiny
pnpm install
pnpm test
```

Expected: install succeeds; `vitest run` reports **"No test files found"** (exit 0). That's the green baseline.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add shared tsconfig and vitest config"
```

---

## Phase 1 — Walking skeleton

**Outcome:** You type a prompt in a CLI, the agent calls a real LLM, the LLM invokes the `echo` tool, and you see the result. Proves the loop, registry, model port, and one head end-to-end.

### Task 1.1: The domain types (Layer 0 — pure data)

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/domain/messages.ts`
- Create: `packages/core/src/domain/messages.test.ts`

- [ ] **Step 1: Write `packages/core/package.json`**

```json
{
  "name": "@thiny/core",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Write `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write the failing test `packages/core/src/domain/messages.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { isToolMessage, userMessage, type Message } from "./messages.js";

describe("messages", () => {
  it("builds a user message", () => {
    expect(userMessage("hi")).toEqual({ role: "user", content: "hi" });
  });

  it("narrows tool messages", () => {
    const m: Message = { role: "tool", toolCallId: "1", toolName: "echo", content: "ok" };
    expect(isToolMessage(m)).toBe(true);
    expect(isToolMessage({ role: "user", content: "x" })).toBe(false);
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm vitest run packages/core/src/domain/messages.test.ts`
Expected: FAIL — cannot resolve `./messages.js`.

- [ ] **Step 5: Write `packages/core/src/domain/messages.ts`**

```ts
/** A single tool invocation requested by the model. */
export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

/** Token usage for one model call (provider-normalised). */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** The universal currency of the system. One turn in the conversation. */
export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

/** Why the model stopped this step (provider-normalised). */
export type FinishReason = "stop" | "tool_calls" | "length" | "error";

/** What the model returns each step. */
export interface ModelResponse {
  text?: string;
  toolCalls?: ToolCall[];
  finishReason: FinishReason;
  usage?: Usage;
}

export const userMessage = (content: string): Message => ({ role: "user", content });
export const systemMessage = (content: string): Message => ({ role: "system", content });

export function isToolMessage(m: Message): m is Extract<Message, { role: "tool" }> {
  return m.role === "tool";
}
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `pnpm vitest run packages/core/src/domain/messages.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): domain message types"
```

### Task 1.2: The Tool type and ports (interfaces the core owns)

**Files:**

- Create: `packages/core/src/tool.ts`
- Create: `packages/core/src/ports.ts`

- [ ] **Step 1: Write `packages/core/src/tool.ts`**

```ts
import type { z } from "zod";
import type { Ctx } from "./context.js";

/**
 * A capability contributed by a plugin. Tools are the primary extension point.
 * `parameters` doubles as runtime validation AND the JSON schema the LLM sees.
 */
export interface Tool<A = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<A>;
  /** Mark money-moving / destructive tools so policy defaults to "approve". */
  sensitive?: boolean;
  tags?: string[];
  execute(args: A, ctx: Ctx): Promise<unknown>;
}

/** Helper that preserves the arg type through inference. */
export function defineTool<A>(t: Tool<A>): Tool<A> {
  return t;
}
```

- [ ] **Step 2: Write `packages/core/src/ports.ts`**

```ts
import type { Message, ModelResponse } from "./domain/messages.js";
import type { Tool } from "./tool.js";

/** PORT: the LLM. Exactly one method. Providers are adapters behind this. */
export interface ModelProvider {
  generate(messages: Message[], tools: Tool[]): Promise<ModelResponse>;
}

/** PORT: conversation memory. The core never knows the storage medium. */
export interface MemoryBackend {
  load(sessionId: string): Promise<Message[]>;
  append(sessionId: string, messages: Message[]): Promise<void>;
}

/** PORT: structured logging / audit sink. */
export interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

/** PORT: human-in-the-loop approval (provided by the head, e.g. CLI prompt). */
export interface ApprovalRequest {
  tool: string;
  args: unknown;
  reason: string;
}
export type Approver = (req: ApprovalRequest) => Promise<boolean>;
```

- [ ] **Step 3: Commit** (compiles as part of next task; no standalone test yet)

```bash
git add -A
git commit -m "feat(core): tool type and ports"
```

### Task 1.3: Event bus + context

**Files:**

- Create: `packages/core/src/events.ts`
- Create: `packages/core/src/events.test.ts`
- Create: `packages/core/src/context.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/events.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./events.js";

describe("EventBus", () => {
  it("delivers emitted payloads to subscribers", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("beforeModelCall", handler);
    bus.emit("beforeModelCall", { steps: 1 });
    expect(handler).toHaveBeenCalledWith({ steps: 1 });
  });

  it("never throws if a handler throws", () => {
    const bus = new EventBus();
    bus.on("onError", () => {
      throw new Error("boom");
    });
    expect(() => bus.emit("onError", {})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run packages/core/src/events.test.ts`
Expected: FAIL — cannot resolve `./events.js`.

- [ ] **Step 3: Write `packages/core/src/events.ts`**

```ts
export type KernelEvent =
  | "onStart"
  | "beforeModelCall"
  | "afterModelCall"
  | "beforeToolCall"
  | "afterToolCall"
  | "onError"
  | "onFinish";

type Handler = (payload: unknown) => void;

/** A tiny synchronous emitter. Handlers must never break the loop. */
export class EventBus {
  private handlers = new Map<KernelEvent, Set<Handler>>();

  on(event: KernelEvent, handler: Handler): void {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(event, set);
  }

  emit(event: KernelEvent, payload: unknown): void {
    for (const h of this.handlers.get(event) ?? []) {
      try {
        h(payload);
      } catch {
        // Observability must never crash the agent.
      }
    }
  }
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run packages/core/src/events.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `packages/core/src/context.ts`**

```ts
import type { MemoryBackend, ModelProvider, Logger, Approver } from "./ports.js";
import type { ToolRegistry } from "./registry.js";
import type { EventBus } from "./events.js";
import type { Signer } from "./signer.js";

/**
 * Threaded through the loop and into every tool's execute().
 * Gives tools access to shared services without importing concrete impls.
 */
export interface Ctx {
  sessionId: string;
  model: ModelProvider;
  memory: MemoryBackend;
  tools: ToolRegistry;
  events: EventBus;
  logger: Logger;
  /** Per-run scratch space shared between tools/middleware. */
  state: Map<string, unknown>;
  /** Present only when a signer plugin is configured. */
  signer?: Signer;
  /** Present only when a head wired up human approval. */
  approver?: Approver;
  maxSteps: number;
}
```

> Note: `./signer.js` and `./registry.js` are created in later tasks. TypeScript `import type` does not require them to exist at runtime, but `tsc` typecheck will fail until they do. Defer `pnpm typecheck` until Task 1.4 / Phase 5 add them; unit tests run regardless.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): event bus and context"
```

### Task 1.4: The tool registry

**Files:**

- Create: `packages/core/src/registry.ts`
- Create: `packages/core/src/registry.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/registry.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "./registry.js";
import { defineTool } from "./tool.js";

const echo = defineTool({
  name: "echo",
  description: "echo back",
  parameters: z.object({ text: z.string() }),
  execute: async ({ text }) => text,
});

describe("ToolRegistry", () => {
  it("registers and retrieves a tool", () => {
    const r = new ToolRegistry();
    r.register(echo);
    expect(r.get("echo").name).toBe("echo");
    expect(r.all()).toHaveLength(1);
  });

  it("rejects duplicate names", () => {
    const r = new ToolRegistry();
    r.register(echo);
    expect(() => r.register(echo)).toThrow(/already registered/);
  });

  it("throws a clear error for unknown tools", () => {
    const r = new ToolRegistry();
    expect(() => r.get("nope")).toThrow(/unknown tool: nope/);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run packages/core/src/registry.test.ts`
Expected: FAIL — cannot resolve `./registry.js`.

- [ ] **Step 3: Write `packages/core/src/registry.ts`**

```ts
import type { Tool } from "./tool.js";

export class ToolRegistry {
  private map = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.map.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`);
    }
    this.map.set(tool.name, tool);
  }

  get(name: string): Tool {
    const t = this.map.get(name);
    if (!t) throw new Error(`unknown tool: ${name}`);
    return t;
  }

  all(): Tool[] {
    return [...this.map.values()];
  }
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run packages/core/src/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): tool registry"
```

### Task 1.5: The agent loop (the heart)

**Files:**

- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/loop.ts`
- Create: `packages/core/src/loop.test.ts`

- [ ] **Step 1: Write `packages/core/src/errors.ts`**

```ts
export class MaxStepsError extends Error {
  constructor(public steps: number) {
    super(`max steps exceeded: ${steps}`);
    this.name = "MaxStepsError";
  }
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetError";
  }
}
```

- [ ] **Step 2: Write the failing test `packages/core/src/loop.test.ts`** (a fake model drives the loop deterministically — no network)

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { runLoop } from "./loop.js";
import { ToolRegistry } from "./registry.js";
import { EventBus } from "./events.js";
import { defineTool } from "./tool.js";
import type { Ctx } from "./context.js";
import type { ModelProvider } from "./ports.js";
import type { Message, ModelResponse } from "./domain/messages.js";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};

function makeCtx(model: ModelProvider, tools = new ToolRegistry()): Ctx {
  return {
    sessionId: "t",
    model,
    memory: { load: async () => [], append: async () => {} },
    tools,
    events: new EventBus(),
    logger: silentLogger,
    state: new Map(),
    maxSteps: 5,
  };
}

describe("runLoop", () => {
  it("returns model text when no tools are requested", async () => {
    const model: ModelProvider = {
      async generate(): Promise<ModelResponse> {
        return { text: "hello", finishReason: "stop" };
      },
    };
    const out = await runLoop("hi", makeCtx(model));
    expect(out).toBe("hello");
  });

  it("executes a requested tool then loops back for the final answer", async () => {
    const tools = new ToolRegistry();
    tools.register(
      defineTool({
        name: "echo",
        description: "echo",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }) => `echoed:${text}`,
      }),
    );
    let step = 0;
    const model: ModelProvider = {
      async generate(messages: Message[]): Promise<ModelResponse> {
        step++;
        if (step === 1) {
          return {
            finishReason: "tool_calls",
            toolCalls: [{ id: "c1", name: "echo", args: { text: "yo" } }],
          };
        }
        // second call: the tool result is now in the messages
        const toolMsg = messages.find((m) => m.role === "tool");
        return { text: `done: ${(toolMsg as { content: string }).content}`, finishReason: "stop" };
      },
    };
    const out = await runLoop("please echo", makeCtx(model, tools));
    expect(out).toBe('done: "echoed:yo"');
  });

  it("feeds tool errors back to the model instead of throwing", async () => {
    const tools = new ToolRegistry();
    tools.register(
      defineTool({
        name: "boom",
        description: "always fails",
        parameters: z.object({}),
        execute: async () => {
          throw new Error("kaboom");
        },
      }),
    );
    let step = 0;
    const model: ModelProvider = {
      async generate(messages: Message[]): Promise<ModelResponse> {
        step++;
        if (step === 1) {
          return { finishReason: "tool_calls", toolCalls: [{ id: "c1", name: "boom", args: {} }] };
        }
        const toolMsg = messages.find((m) => m.role === "tool") as { content: string };
        return { text: toolMsg.content, finishReason: "stop" };
      },
    };
    const out = await runLoop("go", makeCtx(model, tools));
    expect(out).toMatch(/ERROR: kaboom/);
  });

  it("throws MaxStepsError if the model never stops calling tools", async () => {
    const tools = new ToolRegistry();
    tools.register(
      defineTool({
        name: "noop",
        description: "",
        parameters: z.object({}),
        execute: async () => "x",
      }),
    );
    const model: ModelProvider = {
      async generate(): Promise<ModelResponse> {
        return { finishReason: "tool_calls", toolCalls: [{ id: "c", name: "noop", args: {} }] };
      },
    };
    await expect(runLoop("loop forever", makeCtx(model, tools))).rejects.toThrow(/max steps/);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm vitest run packages/core/src/loop.test.ts`
Expected: FAIL — cannot resolve `./loop.js`.

- [ ] **Step 4: Write `packages/core/src/loop.ts`**

```ts
import type { Ctx } from "./context.js";
import type { Message } from "./domain/messages.js";
import type { ModelProvider } from "./ports.js";
import type { Tool } from "./tool.js";
import { MaxStepsError } from "./errors.js";

/** Executes one tool call with validation; errors become observations. */
async function execTool(tool: Tool, args: unknown, ctx: Ctx): Promise<string> {
  const parsed = tool.parameters.parse(args); // validate untrusted LLM JSON at the boundary
  const result = await tool.execute(parsed, ctx);
  return JSON.stringify(result ?? null);
}

export interface RunLoopOptions {
  /** Override the model.generate call (used to inject composed middleware). */
  generate?: ModelProvider["generate"];
  /** Override single-tool execution (used to inject tool middleware). */
  runTool?: (tool: Tool, args: unknown, ctx: Ctx) => Promise<string>;
  /** Seed messages (e.g. loaded history + system prompt). */
  seed?: Message[];
}

/**
 * The ReAct loop: THINK (model) → ACT (tools) → OBSERVE (results) → repeat
 * until the model returns text with no tool calls.
 */
export async function runLoop(input: string, ctx: Ctx, opts: RunLoopOptions = {}): Promise<string> {
  const generate = opts.generate ?? ctx.model.generate.bind(ctx.model);
  const runTool = opts.runTool ?? execTool;

  const messages: Message[] = [...(opts.seed ?? []), { role: "user", content: input }];
  ctx.events.emit("onStart", { sessionId: ctx.sessionId });

  for (let step = 0; step < ctx.maxSteps; step++) {
    ctx.events.emit("beforeModelCall", { step, messages });
    const res = await generate(messages, ctx.tools.all());
    ctx.events.emit("afterModelCall", { step, res });

    messages.push({ role: "assistant", content: res.text ?? "", toolCalls: res.toolCalls });

    if (!res.toolCalls || res.toolCalls.length === 0) {
      ctx.events.emit("onFinish", { step, text: res.text });
      return res.text ?? "";
    }

    // ACT: execute every requested tool in parallel, feeding errors back as observations.
    const results = await Promise.all(
      res.toolCalls.map(async (call) => {
        ctx.events.emit("beforeToolCall", { call });
        let content: string;
        try {
          content = await runTool(ctx.tools.get(call.name), call.args, ctx);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          content = `ERROR: ${message}`;
          ctx.events.emit("onError", { call, error: message });
        }
        ctx.events.emit("afterToolCall", { call, content });
        return {
          role: "tool" as const,
          toolCallId: call.id,
          toolName: call.name,
          content,
        };
      }),
    );
    messages.push(...results);
  }

  throw new MaxStepsError(ctx.maxSteps);
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm vitest run packages/core/src/loop.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): ReAct agent loop with boundary validation and error-as-observation"
```

### Task 1.6: The core barrel + `createAgent` (minimal)

**Files:**

- Create: `packages/core/src/agent.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/signer.ts` (stub now so `context.ts` types resolve)

- [ ] **Step 1: Write `packages/core/src/signer.ts`** (interface only; viem adapter arrives Phase 5)

```ts
import type { Hex } from "./domain/web3.js";

export interface TxRequest {
  to: Hex;
  value?: bigint;
  data?: Hex;
  chainId: number;
}

/** PORT: transaction signer. Adapters: testnet (Phase 5), KMS/Circle (later). */
export interface Signer {
  address: Hex;
  chainId: number;
  isTestnet: boolean;
  signAndSend(tx: TxRequest): Promise<Hex>;
}
```

- [ ] **Step 2: Write `packages/core/src/domain/web3.ts`** (shared web3 primitive types, no deps)

```ts
/** 0x-prefixed hex string. Kept dependency-free in the domain layer. */
export type Hex = `0x${string}`;
```

- [ ] **Step 3: Write `packages/core/src/agent.ts`**

```ts
import type { ModelProvider, MemoryBackend, Logger, Approver } from "./ports.js";
import type { Tool } from "./tool.js";
import type { Message } from "./domain/messages.js";
import type { Signer } from "./signer.js";
import type { Ctx } from "./context.js";
import { ToolRegistry } from "./registry.js";
import { EventBus } from "./events.js";
import { runLoop } from "./loop.js";
import { systemMessage } from "./domain/messages.js";

/** In-memory default so a bare agent needs zero infrastructure. */
class EphemeralMemory implements MemoryBackend {
  private store = new Map<string, Message[]>();
  async load(sessionId: string): Promise<Message[]> {
    return [...(this.store.get(sessionId) ?? [])];
  }
  async append(sessionId: string, messages: Message[]): Promise<void> {
    this.store.set(sessionId, messages);
  }
}

const consoleLogger: Logger = {
  info: (o, m) => console.error("[info]", m ?? "", o),
  warn: (o, m) => console.error("[warn]", m ?? "", o),
  error: (o, m) => console.error("[error]", m ?? "", o),
  child: () => consoleLogger,
};

export interface AgentConfig {
  model: ModelProvider;
  memory?: MemoryBackend;
  tools?: Tool[];
  systemPrompt?: string;
  maxSteps?: number;
  logger?: Logger;
  signer?: Signer;
  approver?: Approver;
}

export interface Agent {
  run(input: string, opts?: { sessionId?: string }): Promise<string>;
  registry: ToolRegistry;
}

export function createAgent(config: AgentConfig): Agent {
  const registry = new ToolRegistry();
  for (const t of config.tools ?? []) registry.register(t);

  const memory = config.memory ?? new EphemeralMemory();
  const events = new EventBus();
  const logger = config.logger ?? consoleLogger;

  async function run(input: string, opts: { sessionId?: string } = {}): Promise<string> {
    const sessionId = opts.sessionId ?? "default";
    const ctx: Ctx = {
      sessionId,
      model: config.model,
      memory,
      tools: registry,
      events,
      logger: logger.child({ sessionId }),
      state: new Map(),
      signer: config.signer,
      approver: config.approver,
      maxSteps: config.maxSteps ?? 12,
    };

    const history = await memory.load(sessionId);
    const seed: Message[] =
      config.systemPrompt && !history.some((m) => m.role === "system")
        ? [systemMessage(config.systemPrompt), ...history]
        : history;

    const text = await runLoop(input, ctx, { seed });
    await memory.append(sessionId, [
      ...seed,
      { role: "user", content: input },
      { role: "assistant", content: text },
    ]);
    return text;
  }

  return { run, registry };
}
```

> Note: this minimal `createAgent` persists a flattened transcript; Phase 4 replaces persistence with the proper memory port and Phase 2/3 inject plugins + middleware. Keeping it simple here keeps the skeleton honest.

- [ ] **Step 4: Write `packages/core/src/index.ts`** (the public surface)

```ts
export * from "./domain/messages.js";
export * from "./domain/web3.js";
export * from "./tool.js";
export * from "./ports.js";
export * from "./signer.js";
export * from "./events.js";
export * from "./context.js";
export * from "./registry.js";
export * from "./errors.js";
export * from "./loop.js";
export * from "./agent.js";
```

- [ ] **Step 5: Typecheck the core**

Run: `pnpm --filter @thiny/core exec tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): createAgent assembly and public barrel"
```

### Task 1.7: The model adapter (Vercel AI SDK behind the port)

**Files:**

- Create: `packages/adapters/model-aisdk/package.json`
- Create: `packages/adapters/model-aisdk/tsconfig.json`
- Create: `packages/adapters/model-aisdk/src/convert.ts`
- Create: `packages/adapters/model-aisdk/src/convert.test.ts`
- Create: `packages/adapters/model-aisdk/src/index.ts`

- [ ] **Step 1: Write `packages/adapters/model-aisdk/package.json`**

```json
{
  "name": "@thiny/model-aisdk",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@thiny/core": "workspace:*",
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "@ai-sdk/anthropic": "^1.0.0"
  }
}
```

> **AI SDK version note:** this adapter targets **AI SDK v4** (`ai@^4`), where tool schemas use the `parameters` key and usage is `{ promptTokens, completionTokens }`. If you bump to v5, rename to `inputSchema` and `{ inputTokens, outputTokens }` — the change is isolated to this one file, which is the entire point of the port.

- [ ] **Step 2: Write `packages/adapters/model-aisdk/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/adapters/model-aisdk/src/convert.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { toCoreMessages } from "./convert.js";
import type { Message } from "@thiny/core";

describe("toCoreMessages", () => {
  it("maps an assistant tool call into AI SDK tool-call parts", () => {
    const messages: Message[] = [
      { role: "assistant", content: "", toolCalls: [{ id: "1", name: "echo", args: { t: "x" } }] },
      { role: "tool", toolCallId: "1", toolName: "echo", content: '"x"' },
    ];
    const core = toCoreMessages(messages);
    expect(core[0]).toMatchObject({
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "1", toolName: "echo", args: { t: "x" } }],
    });
    expect(core[1]).toMatchObject({
      role: "tool",
      content: [{ type: "tool-result", toolCallId: "1", toolName: "echo" }],
    });
  });

  it("passes plain user/system messages through as strings", () => {
    const core = toCoreMessages([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ]);
    expect(core).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ]);
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run packages/adapters/model-aisdk/src/convert.test.ts`
Expected: FAIL — cannot resolve `./convert.js`.

- [ ] **Step 5: Write `packages/adapters/model-aisdk/src/convert.ts`**

```ts
import type { CoreMessage } from "ai";
import { tool as aiTool } from "ai";
import type { Message, Tool } from "@thiny/core";

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** Our domain Message[] → AI SDK CoreMessage[]. */
export function toCoreMessages(messages: Message[]): CoreMessage[] {
  return messages.map((m): CoreMessage => {
    switch (m.role) {
      case "system":
        return { role: "system", content: m.content };
      case "user":
        return { role: "user", content: m.content };
      case "assistant":
        if (m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: "assistant",
            content: [
              ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
              ...m.toolCalls.map((tc) => ({
                type: "tool-call" as const,
                toolCallId: tc.id,
                toolName: tc.name,
                args: tc.args,
              })),
            ],
          };
        }
        return { role: "assistant", content: m.content };
      case "tool":
        return {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: m.toolCallId,
              toolName: m.toolName,
              result: safeJson(m.content),
            },
          ],
        };
    }
  });
}

/** Our Tool[] → AI SDK tool set (no execute: the kernel runs tools itself). */
export function toAiTools(tools: Tool[]): Record<string, ReturnType<typeof aiTool>> {
  const out: Record<string, ReturnType<typeof aiTool>> = {};
  for (const t of tools) {
    out[t.name] = aiTool({ description: t.description, parameters: t.parameters });
  }
  return out;
}
```

- [ ] **Step 6: Run to confirm pass**

Run: `pnpm vitest run packages/adapters/model-aisdk/src/convert.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Write `packages/adapters/model-aisdk/src/index.ts`**

```ts
import { generateText, type LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelProvider, Message, ModelResponse, Tool, FinishReason } from "@thiny/core";
import { toCoreMessages, toAiTools } from "./convert.js";

function mapFinish(reason: string): FinishReason {
  if (reason === "tool-calls") return "tool_calls";
  if (reason === "length") return "length";
  if (reason === "error") return "error";
  return "stop";
}

export interface AiSdkOptions {
  /** A LanguageModel from any @ai-sdk provider, OR a string id resolved below. */
  model: LanguageModel | string;
  maxRetries?: number;
}

/** Resolve "openai:gpt-4o-mini" / "anthropic:claude-..." shorthand to a model. */
function resolveModel(model: LanguageModel | string): LanguageModel {
  if (typeof model !== "string") return model;
  const [provider, ...rest] = model.split(":");
  const id = rest.join(":");
  if (provider === "openai") return openai(id);
  if (provider === "anthropic") return anthropic(id);
  throw new Error(`unknown model provider: ${provider}`);
}

export function aiSdkModel(opts: AiSdkOptions): ModelProvider {
  const model = resolveModel(opts.model);
  return {
    async generate(messages: Message[], tools: Tool[]): Promise<ModelResponse> {
      const result = await generateText({
        model,
        messages: toCoreMessages(messages),
        tools: tools.length ? toAiTools(tools) : undefined,
        toolChoice: tools.length ? "auto" : undefined,
        maxRetries: opts.maxRetries ?? 2,
      });
      return {
        text: result.text || undefined,
        toolCalls: result.toolCalls?.map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          args: tc.args,
        })),
        finishReason: mapFinish(result.finishReason),
        usage: result.usage
          ? { inputTokens: result.usage.promptTokens, outputTokens: result.usage.completionTokens }
          : undefined,
      };
    },
  };
}
```

- [ ] **Step 8: Install new deps + typecheck**

Run:

```bash
pnpm install
pnpm --filter @thiny/model-aisdk exec tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(adapter): Vercel AI SDK model provider behind the port"
```

### Task 1.8: The CLI head + echo plugin, run it for real

**Files:**

- Create: `heads/cli/package.json`
- Create: `heads/cli/tsconfig.json`
- Create: `heads/cli/src/main.ts`
- Create: `thiny/.env.example`

- [ ] **Step 1: Write `heads/cli/package.json`**

```json
{
  "name": "@thiny/cli",
  "version": "0.0.0",
  "type": "module",
  "bin": { "agent": "./src/main.ts" },
  "dependencies": {
    "@thiny/core": "workspace:*",
    "@thiny/model-aisdk": "workspace:*",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Write `heads/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../packages/core" },
    { "path": "../../packages/adapters/model-aisdk" }
  ]
}
```

- [ ] **Step 3: Write `heads/cli/src/main.ts`**

```ts
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { z } from "zod";
import { createAgent, defineTool } from "@thiny/core";
import { aiSdkModel } from "@thiny/model-aisdk";

const echo = defineTool({
  name: "echo",
  description: "Echo the given text back to the user verbatim.",
  parameters: z.object({ text: z.string().describe("the text to echo") }),
  execute: async ({ text }) => ({ echoed: text }),
});

async function main() {
  const agent = createAgent({
    model: aiSdkModel({ model: process.env.AGENT_MODEL ?? "openai:gpt-4o-mini" }),
    systemPrompt: "You are a helpful CLI agent. Use the echo tool when asked to echo.",
    tools: [echo],
  });

  const rl = createInterface({ input: stdin, output: stdout });
  stdout.write("agent ready. type a message (ctrl+c to quit)\n");
  while (true) {
    const input = await rl.question("> ");
    if (!input.trim()) continue;
    try {
      const reply = await agent.run(input, { sessionId: "cli" });
      stdout.write(`${reply}\n`);
    } catch (err) {
      stdout.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Write `thiny/.env.example`**

```
# One of these depending on AGENT_MODEL provider:
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
AGENT_MODEL=openai:gpt-4o-mini
```

- [ ] **Step 5: Install, then run the agent for real**

Run:

```bash
pnpm install
cp .env.example .env   # then edit .env with a real key
node --env-file=.env --import tsx heads/cli/src/main.ts
```

At the `>` prompt type: `echo the word banana`
Expected: the agent calls the `echo` tool and replies with the banana text. **This is the walking skeleton working end-to-end.**

- [ ] **Step 6: Add a convenience script + commit**

Edit `thiny/package.json` `scripts.cli` to:

```json
"cli": "node --env-file=.env --import tsx heads/cli/src/main.ts"
```

```bash
git add -A
git commit -m "feat(cli): runnable CLI head with echo tool — walking skeleton complete"
```

**Phase 1 milestone reached: a real LLM-driven agent runs from the terminal.**

---

## Phase 2 — Plugin system

**Outcome:** Capabilities are added via plugins, not by editing the core. A `web-search` plugin proves the contract works for a Web2 tool. Two-phase loading supports inter-plugin dependencies.

### Task 2.1: The Plugin contract + two-phase loader

**Files:**

- Create: `packages/core/src/plugin.ts`
- Create: `packages/core/src/plugin.test.ts`
- Modify: `packages/core/src/index.ts` (export plugin)
- Modify: `packages/core/src/agent.ts` (load plugins)

- [ ] **Step 1: Write the failing test `packages/core/src/plugin.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { loadPlugins } from "./plugin.js";
import { ToolRegistry } from "./registry.js";
import { defineTool } from "./tool.js";
import type { Plugin } from "./plugin.js";

describe("loadPlugins", () => {
  it("registers tools then runs setup in two phases", async () => {
    const order: string[] = [];
    const a: Plugin = {
      name: "a",
      tools: [
        defineTool({
          name: "a_tool",
          description: "",
          parameters: z.object({}),
          execute: async () => 1,
        }),
      ],
      setup: async (ctx) => {
        order.push("setup-a");
        // during setup, tools from OTHER plugins are already registered:
        expect(ctx.tools.get("b_tool").name).toBe("b_tool");
      },
    };
    const b: Plugin = {
      name: "b",
      tools: [
        defineTool({
          name: "b_tool",
          description: "",
          parameters: z.object({}),
          execute: async () => 2,
        }),
      ],
      setup: async () => {
        order.push("setup-b");
      },
    };
    const registry = new ToolRegistry();
    const collected = await loadPlugins([a, b], {
      registry,
      makeSetupCtx: () => ({ tools: registry }) as never,
    });
    expect(
      registry
        .all()
        .map((t) => t.name)
        .sort(),
    ).toEqual(["a_tool", "b_tool"]);
    expect(order).toEqual(["setup-a", "setup-b"]);
    expect(collected.middleware.model).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run packages/core/src/plugin.test.ts`
Expected: FAIL — cannot resolve `./plugin.js`.

- [ ] **Step 3: Write `packages/core/src/plugin.ts`** (middleware types are finalised in Phase 3; declared here so plugins can contribute them)

```ts
import type { Tool } from "./tool.js";
import type { MemoryBackend } from "./ports.js";
import type { Ctx } from "./context.js";
import type { ModelMiddleware, ToolMiddleware } from "./middleware.js";
import type { ToolRegistry } from "./registry.js";

/**
 * A plugin contributes capabilities to the kernel. Every field is optional —
 * the smallest plugin is just `{ name, tools }`.
 */
export interface Plugin {
  name: string;
  tools?: Tool[];
  /** Replace the memory backend (last one wins). */
  memory?: MemoryBackend;
  modelMiddleware?: ModelMiddleware[];
  toolMiddleware?: ToolMiddleware[];
  /** Phase 2: runs after ALL plugins have registered. May read ctx services. */
  setup?(ctx: Ctx): Promise<void>;
}

export interface CollectedExtensions {
  memory?: MemoryBackend;
  middleware: { model: ModelMiddleware[]; tool: ToolMiddleware[] };
}

export interface LoadPluginsDeps {
  registry: ToolRegistry;
  /** Built lazily so setup sees the fully-populated registry/services. */
  makeSetupCtx: () => Ctx;
}

/** Two phases: (1) register everything, (2) setup so plugins can see each other. */
export async function loadPlugins(
  plugins: Plugin[],
  deps: LoadPluginsDeps,
): Promise<CollectedExtensions> {
  const collected: CollectedExtensions = { middleware: { model: [], tool: [] } };

  // Phase 1: register
  for (const p of plugins) {
    for (const t of p.tools ?? []) deps.registry.register(t);
    if (p.memory) collected.memory = p.memory;
    if (p.modelMiddleware) collected.middleware.model.push(...p.modelMiddleware);
    if (p.toolMiddleware) collected.middleware.tool.push(...p.toolMiddleware);
  }

  // Phase 2: setup (now every tool/service is visible)
  const ctx = deps.makeSetupCtx();
  for (const p of plugins) await p.setup?.(ctx);

  return collected;
}
```

- [ ] **Step 4: Create `packages/core/src/middleware.ts`** (type-only for now; logic in Phase 3)

```ts
import type { Message, ModelResponse } from "./domain/messages.js";
import type { Tool } from "./tool.js";
import type { Ctx } from "./context.js";

export interface ModelRequest {
  messages: Message[];
  tools: Tool[];
}
export type ModelNext = (req: ModelRequest) => Promise<ModelResponse>;
export type ModelMiddleware = (req: ModelRequest, next: ModelNext) => Promise<ModelResponse>;

export interface ToolCallCtx {
  tool: Tool;
  args: unknown;
  ctx: Ctx;
}
export type ToolNext = (call: ToolCallCtx) => Promise<unknown>;
export type ToolMiddleware = (call: ToolCallCtx, next: ToolNext) => Promise<unknown>;
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm vitest run packages/core/src/plugin.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Wire plugins into `createAgent`** — Modify `packages/core/src/agent.ts`

Add to imports:

```ts
import { loadPlugins, type Plugin } from "./plugin.js";
```

Add `plugins?: Plugin[]` to `AgentConfig`. Replace the registry-population block with an async builder. Because `loadPlugins` is async, change `createAgent` to return a promise via a builder:

```ts
export async function createAgent(config: AgentConfig): Promise<Agent> {
  const registry = new ToolRegistry();
  for (const t of config.tools ?? []) registry.register(t);

  const events = new EventBus();
  const logger = config.logger ?? consoleLogger;

  const collected = await loadPlugins(config.plugins ?? [], {
    registry,
    makeSetupCtx: () =>
      ({
        sessionId: "setup",
        model: config.model,
        memory: config.memory ?? new EphemeralMemory(),
        tools: registry,
        events,
        logger,
        state: new Map(),
        signer: config.signer,
        approver: config.approver,
        maxSteps: config.maxSteps ?? 12,
      }) satisfies Ctx,
  });

  const memory = collected.memory ?? config.memory ?? new EphemeralMemory();
  // ... (run() body unchanged, but reads `memory` from here)
}
```

Add `import type { Ctx } from "./context.js";` if not present.

- [ ] **Step 7: Update CLI for the async factory** — Modify `heads/cli/src/main.ts`

Change `const agent = createAgent({...})` to `const agent = await createAgent({...})`.

- [ ] **Step 8: Export + typecheck + commit**

Add to `packages/core/src/index.ts`:

```ts
export * from "./plugin.js";
export * from "./middleware.js";
```

Run: `pnpm -r exec tsc --noEmit` (typecheck all). Expected: no errors.

```bash
git add -A
git commit -m "feat(core): plugin contract and two-phase loader"
```

### Task 2.2: The `web-search` plugin (proves Web2 extensibility)

**Files:**

- Create: `packages/plugins/web-search/package.json`
- Create: `packages/plugins/web-search/tsconfig.json`
- Create: `packages/plugins/web-search/src/index.ts`
- Create: `packages/plugins/web-search/src/index.test.ts`

- [ ] **Step 1: Write `packages/plugins/web-search/package.json`**

```json
{
  "name": "@thiny/plugin-web-search",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@thiny/core": "workspace:*",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Write `packages/plugins/web-search/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/plugins/web-search/src/index.test.ts`** (inject `fetch` so the test is offline)

```ts
import { describe, it, expect, vi } from "vitest";
import { webSearchPlugin } from "./index.js";

describe("webSearchPlugin", () => {
  it("contributes a web_search tool that returns normalized results", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            web: { results: [{ title: "T", url: "https://x", description: "D" }] },
          }),
          { status: 200 },
        ),
    );
    const plugin = webSearchPlugin({
      apiKey: "k",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const tool = plugin.tools![0]!;
    expect(tool.name).toBe("web_search");
    const out = (await tool.execute({ query: "hi", count: 1 }, {} as never)) as {
      results: unknown[];
    };
    expect(out.results).toEqual([{ title: "T", url: "https://x", snippet: "D" }]);
    expect(fakeFetch).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run packages/plugins/web-search/src/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 5: Write `packages/plugins/web-search/src/index.ts`** (Brave Search API shape; swap provider freely)

```ts
import { z } from "zod";
import { defineTool, type Plugin } from "@thiny/core";

export interface WebSearchOptions {
  apiKey: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

interface BraveResponse {
  web?: { results?: Array<{ title: string; url: string; description: string }> };
}

export function webSearchPlugin(opts: WebSearchOptions): Plugin {
  const endpoint = opts.endpoint ?? "https://api.search.brave.com/res/v1/web/search";
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    name: "web-search",
    tools: [
      defineTool({
        name: "web_search",
        description: "Search the public web and return the top results (title, url, snippet).",
        parameters: z.object({
          query: z.string().describe("the search query"),
          count: z.number().int().min(1).max(10).default(5),
        }),
        execute: async ({ query, count }) => {
          const url = `${endpoint}?q=${encodeURIComponent(query)}&count=${count}`;
          const res = await doFetch(url, {
            headers: { Accept: "application/json", "X-Subscription-Token": opts.apiKey },
          });
          if (!res.ok) throw new Error(`web_search failed: ${res.status}`);
          const data = (await res.json()) as BraveResponse;
          return {
            results: (data.web?.results ?? []).map((r) => ({
              title: r.title,
              url: r.url,
              snippet: r.description,
            })),
          };
        },
      }),
    ],
  };
}
```

- [ ] **Step 6: Run to confirm pass**

Run: `pnpm vitest run packages/plugins/web-search/src/index.test.ts`
Expected: PASS (1 test).

- [ ] **Step 7: Wire it into the CLI and run** — Modify `heads/cli/src/main.ts`

Add import and add to `plugins` (only if `BRAVE_API_KEY` is set):

```ts
import { webSearchPlugin } from "@thiny/plugin-web-search";
// ...
const plugins = [];
if (process.env.BRAVE_API_KEY) plugins.push(webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY }));

const agent = await createAgent({
  model: aiSdkModel({ model: process.env.AGENT_MODEL ?? "openai:gpt-4o-mini" }),
  systemPrompt: "You are a helpful CLI agent.",
  tools: [echo],
  plugins,
});
```

Add `"@thiny/plugin-web-search": "workspace:*"` to `heads/cli/package.json` dependencies, then `pnpm install`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(plugin): web-search plugin and CLI wiring"
```

**Phase 2 milestone: new capability added with zero kernel edits.**

---

## Phase 3 — Middleware pipeline

**Outcome:** Cross-cutting concerns compose as onion layers around model calls and tool calls. Ship audit (immutable structured log) and budget (token/$ + step circuit breaker). The loop wires composed pipelines.

### Task 3.1: The composer

**Files:**

- Create: `packages/core/src/compose.ts`
- Create: `packages/core/src/compose.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/compose.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { composeModel, composeTool } from "./compose.js";
import type { ModelMiddleware, ToolMiddleware } from "./middleware.js";

describe("composeModel", () => {
  it("runs middleware outside-in and base last (onion order)", async () => {
    const order: string[] = [];
    const a: ModelMiddleware = async (req, next) => {
      order.push("a-before");
      const r = await next(req);
      order.push("a-after");
      return r;
    };
    const b: ModelMiddleware = async (req, next) => {
      order.push("b-before");
      const r = await next(req);
      order.push("b-after");
      return r;
    };
    const run = composeModel([a, b], async () => {
      order.push("base");
      return { finishReason: "stop", text: "ok" };
    });
    await run({ messages: [], tools: [] });
    expect(order).toEqual(["a-before", "b-before", "base", "b-after", "a-after"]);
  });
});

describe("composeTool", () => {
  it("lets middleware short-circuit by throwing before base runs", async () => {
    const block: ToolMiddleware = async () => {
      throw new Error("blocked");
    };
    const run = composeTool([block], async () => "should-not-run");
    await expect(run({ tool: {} as never, args: {}, ctx: {} as never })).rejects.toThrow("blocked");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run packages/core/src/compose.test.ts`
Expected: FAIL — cannot resolve `./compose.js`.

- [ ] **Step 3: Write `packages/core/src/compose.ts`**

```ts
import type { ModelMiddleware, ModelNext, ToolMiddleware, ToolNext } from "./middleware.js";

export function composeModel(mws: ModelMiddleware[], base: ModelNext): ModelNext {
  return mws.reduceRight<ModelNext>((next, mw) => (req) => mw(req, next), base);
}

export function composeTool(mws: ToolMiddleware[], base: ToolNext): ToolNext {
  return mws.reduceRight<ToolNext>((next, mw) => (call) => mw(call, next), base);
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run packages/core/src/compose.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): middleware composer (onion order)"
```

### Task 3.2: Wire composed pipelines into the loop & agent

**Files:**

- Modify: `packages/core/src/agent.ts`

- [ ] **Step 1: Build composed `generate` and `runTool` in `createAgent`**

In `run()`, before calling `runLoop`, construct:

```ts
import { composeModel, composeTool } from "./compose.js";
// inside run(), after ctx is built:
const generate = composeModel(collected.middleware.model, async (req) =>
  config.model.generate(req.messages, req.tools),
);
const runTool = composeTool(collected.middleware.tool, async ({ tool, args, ctx }) => {
  const parsed = tool.parameters.parse(args);
  return tool.execute(parsed, ctx);
});

const text = await runLoop(input, ctx, {
  seed,
  generate: (messages, tools) => generate({ messages, tools }),
  runTool: async (tool, args, c) => {
    const result = await runTool({ tool, args, ctx: c });
    return JSON.stringify(result ?? null);
  },
});
```

`collected` must be in scope — hoist `loadPlugins(...)` result to a `const collected` at factory level (already done in Task 2.1 Step 6).

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm -r exec tsc --noEmit`. Expected: no errors.

```bash
git add -A
git commit -m "feat(core): inject composed model/tool middleware into the loop"
```

### Task 3.3: The audit + budget middleware (in core)

**Files:**

- Create: `packages/core/src/middleware/audit.ts`
- Create: `packages/core/src/middleware/budget.ts`
- Create: `packages/core/src/middleware/budget.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/middleware/budget.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { budgetMiddleware } from "./budget.js";

describe("budgetMiddleware", () => {
  it("throws BudgetError when token cap is exceeded", async () => {
    const mw = budgetMiddleware({ maxTokens: 100 });
    const next = async () => ({
      finishReason: "stop" as const,
      usage: { inputTokens: 80, outputTokens: 40 },
    });
    // first call uses 120 tokens -> over 100
    await expect(mw({ messages: [], tools: [] }, next)).rejects.toThrow(/budget/i);
  });

  it("allows calls under the cap and accumulates", async () => {
    const mw = budgetMiddleware({ maxTokens: 1000 });
    const next = async () => ({
      finishReason: "stop" as const,
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    await expect(mw({ messages: [], tools: [] }, next)).resolves.toMatchObject({
      finishReason: "stop",
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run packages/core/src/middleware/budget.test.ts`
Expected: FAIL — cannot resolve `./budget.js`.

- [ ] **Step 3: Write `packages/core/src/middleware/budget.ts`**

```ts
import type { ModelMiddleware } from "../middleware.js";
import { BudgetError } from "../errors.js";

export interface BudgetOptions {
  /** Hard cap on total tokens across the whole run. */
  maxTokens?: number;
  /** Hard cap on number of model calls. */
  maxCalls?: number;
}

/** Stateful per-construction: create one budget per run for isolation. */
export function budgetMiddleware(opts: BudgetOptions): ModelMiddleware {
  let tokens = 0;
  let calls = 0;
  return async (req, next) => {
    if (opts.maxCalls !== undefined && calls >= opts.maxCalls) {
      throw new BudgetError(`budget exceeded: ${calls} model calls`);
    }
    calls++;
    const res = await next(req);
    tokens += (res.usage?.inputTokens ?? 0) + (res.usage?.outputTokens ?? 0);
    if (opts.maxTokens !== undefined && tokens > opts.maxTokens) {
      throw new BudgetError(`budget exceeded: ${tokens} tokens`);
    }
    return res;
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run packages/core/src/middleware/budget.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `packages/core/src/middleware/audit.ts`**

```ts
import type { ModelMiddleware, ToolMiddleware } from "../middleware.js";
import type { Logger } from "../ports.js";

/** Logs every model call: latency, finish reason, token usage. */
export function modelAudit(logger: Logger): ModelMiddleware {
  return async (req, next) => {
    const t0 = Date.now();
    const res = await next(req);
    logger.info(
      {
        kind: "model_call",
        ms: Date.now() - t0,
        finishReason: res.finishReason,
        toolCalls: res.toolCalls?.map((c) => c.name) ?? [],
        usage: res.usage,
      },
      "model_call",
    );
    return res;
  };
}

/** Logs every tool call: name, args (redactable), latency, error. */
export function toolAudit(logger: Logger): ToolMiddleware {
  return async (call, next) => {
    const t0 = Date.now();
    try {
      const result = await next(call);
      logger.info(
        { kind: "tool_call", tool: call.tool.name, ms: Date.now() - t0, ok: true },
        "tool_call",
      );
      return result;
    } catch (err) {
      logger.error(
        {
          kind: "tool_call",
          tool: call.tool.name,
          ms: Date.now() - t0,
          ok: false,
          error: String(err),
        },
        "tool_call_failed",
      );
      throw err;
    }
  };
}
```

- [ ] **Step 6: Export, typecheck, commit**

Add to `packages/core/src/index.ts`:

```ts
export * from "./middleware/audit.js";
export * from "./middleware/budget.js";
export * from "./compose.js";
```

Run: `pnpm -r exec tsc --noEmit`. Expected: no errors.

```bash
git add -A
git commit -m "feat(core): audit and budget middleware"
```

### Task 3.4: A pino logger adapter + opt-in wiring

**Files:**

- Create: `packages/adapters/logger-pino/package.json`
- Create: `packages/adapters/logger-pino/tsconfig.json`
- Create: `packages/adapters/logger-pino/src/index.ts`
- Modify: `heads/cli/src/main.ts`

- [ ] **Step 1: Write `packages/adapters/logger-pino/package.json`**

```json
{
  "name": "@thiny/logger-pino",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "pino": "^9.2.0" }
}
```

- [ ] **Step 2: Write `packages/adapters/logger-pino/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write `packages/adapters/logger-pino/src/index.ts`**

```ts
import pino from "pino";
import type { Logger } from "@thiny/core";

export function pinoLogger(opts?: { level?: string; file?: string }): Logger {
  const base = pino(
    { level: opts?.level ?? "info" },
    opts?.file ? pino.destination({ dest: opts.file, sync: false }) : undefined,
  );
  const wrap = (p: pino.Logger): Logger => ({
    info: (o, m) => p.info(o, m),
    warn: (o, m) => p.warn(o, m),
    error: (o, m) => p.error(o, m),
    child: (b) => wrap(p.child(b)),
  });
  return wrap(base);
}
```

- [ ] **Step 4: Wire audit + budget into CLI (opt-in)** — Modify `heads/cli/src/main.ts`

```ts
import { modelAudit, toolAudit, budgetMiddleware } from "@thiny/core";
import { pinoLogger } from "@thiny/logger-pino";

const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info", file: "audit.log" });

// add to createAgent config:
//   logger,
//   plugins: [
//     { name: "observability",
//       modelMiddleware: [modelAudit(logger), budgetMiddleware({ maxCalls: 20, maxTokens: 200_000 })],
//       toolMiddleware: [toolAudit(logger)] },
//     ...plugins,
//   ],
```

Add `"@thiny/logger-pino": "workspace:*"` to `heads/cli/package.json`, `pnpm install`.

- [ ] **Step 5: Run and verify the audit trail**

Run: `pnpm cli`, send `echo hi`, then check `thiny/audit.log` contains a `model_call` and `tool_call` line.
Expected: structured JSON audit entries appear.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(adapter): pino logger + opt-in audit/budget middleware in CLI"
```

**Phase 3 milestone: every model and tool call is logged and budget-bounded, all opt-in.**

---

## Phase 4 — Memory port (SQLite + compaction)

**Outcome:** Conversations persist across runs via SQLite, and long conversations are compacted (summarised) before they blow the context window — implemented as model middleware.

### Task 4.1: SQLite memory backend

**Files:**

- Create: `packages/adapters/memory-sqlite/package.json`
- Create: `packages/adapters/memory-sqlite/tsconfig.json`
- Create: `packages/adapters/memory-sqlite/src/index.ts`
- Create: `packages/adapters/memory-sqlite/src/index.test.ts`

- [ ] **Step 1: Write `packages/adapters/memory-sqlite/package.json`**

```json
{
  "name": "@thiny/memory-sqlite",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "@libsql/client": "^0.6.0" }
}
```

- [ ] **Step 2: Write `packages/adapters/memory-sqlite/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/adapters/memory-sqlite/src/index.test.ts`** (uses in-memory libsql `:memory:`)

```ts
import { describe, it, expect } from "vitest";
import { sqliteMemory } from "./index.js";
import type { Message } from "@thiny/core";

describe("sqliteMemory", () => {
  it("round-trips messages for a session", async () => {
    const mem = await sqliteMemory({ url: ":memory:" });
    const msgs: Message[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    await mem.append("s1", msgs);
    expect(await mem.load("s1")).toEqual(msgs);
    expect(await mem.load("other")).toEqual([]);
  });

  it("append replaces the stored transcript for a session", async () => {
    const mem = await sqliteMemory({ url: ":memory:" });
    await mem.append("s1", [{ role: "user", content: "a" }]);
    await mem.append("s1", [{ role: "user", content: "b" }]);
    expect(await mem.load("s1")).toEqual([{ role: "user", content: "b" }]);
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run packages/adapters/memory-sqlite/src/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 5: Write `packages/adapters/memory-sqlite/src/index.ts`**

```ts
import { createClient, type Client } from "@libsql/client";
import type { MemoryBackend, Message } from "@thiny/core";

export interface SqliteMemoryOptions {
  /** ":memory:" or "file:agent.sqlite" or a libsql/turso URL. */
  url: string;
  authToken?: string;
}

class SqliteMemory implements MemoryBackend {
  constructor(private db: Client) {}

  async load(sessionId: string): Promise<Message[]> {
    const res = await this.db.execute({
      sql: "SELECT payload FROM transcripts WHERE session = ?",
      args: [sessionId],
    });
    const row = res.rows[0];
    if (!row) return [];
    return JSON.parse(row.payload as string) as Message[];
  }

  async append(sessionId: string, messages: Message[]): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO transcripts (session, payload) VALUES (?, ?)
            ON CONFLICT(session) DO UPDATE SET payload = excluded.payload`,
      args: [sessionId, JSON.stringify(messages)],
    });
  }
}

export async function sqliteMemory(opts: SqliteMemoryOptions): Promise<MemoryBackend> {
  const db = createClient({ url: opts.url, authToken: opts.authToken });
  await db.execute(
    "CREATE TABLE IF NOT EXISTS transcripts (session TEXT PRIMARY KEY, payload TEXT NOT NULL)",
  );
  return new SqliteMemory(db);
}
```

> Design note: `append` here stores the full transcript (the loop already passes the complete message list). A higher-throughput design would append individual rows with an `idx` column; the port lets you swap that in without touching the kernel.

- [ ] **Step 6: Run to confirm pass**

Run: `pnpm vitest run packages/adapters/memory-sqlite/src/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(adapter): sqlite/libsql memory backend"
```

### Task 4.2: Compaction (summarization) middleware

**Files:**

- Create: `packages/core/src/middleware/compaction.ts`
- Create: `packages/core/src/middleware/compaction.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/middleware/compaction.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { compactionMiddleware } from "./compaction.js";
import type { Message } from "../domain/messages.js";
import type { ModelProvider } from "../ports.js";

const summarizer: ModelProvider = {
  async generate() {
    return { text: "SUMMARY", finishReason: "stop" };
  },
};

describe("compactionMiddleware", () => {
  it("passes through when under the message threshold", async () => {
    const mw = compactionMiddleware({ maxMessages: 10, keepRecent: 2, summarizer });
    let seen: Message[] = [];
    await mw({ messages: [{ role: "user", content: "a" }], tools: [] }, async (req) => {
      seen = req.messages;
      return { finishReason: "stop" };
    });
    expect(seen).toHaveLength(1);
  });

  it("replaces older messages with a summary system note when over threshold", async () => {
    const mw = compactionMiddleware({ maxMessages: 4, keepRecent: 2, summarizer });
    const messages: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "1" },
      { role: "assistant", content: "2" },
      { role: "user", content: "3" },
      { role: "assistant", content: "4" },
    ];
    let seen: Message[] = [];
    await mw({ messages, tools: [] }, async (req) => {
      seen = req.messages;
      return { finishReason: "stop" };
    });
    // keeps system + summary + last 2
    expect(seen[0]).toEqual({ role: "system", content: "sys" });
    expect(seen.some((m) => m.role === "system" && m.content.includes("SUMMARY"))).toBe(true);
    expect(seen.at(-1)).toEqual({ role: "assistant", content: "4" });
    expect(seen.length).toBeLessThan(messages.length);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run packages/core/src/middleware/compaction.test.ts`
Expected: FAIL — cannot resolve `./compaction.js`.

- [ ] **Step 3: Write `packages/core/src/middleware/compaction.ts`**

```ts
import type { ModelMiddleware } from "../middleware.js";
import type { Message } from "../domain/messages.js";
import type { ModelProvider } from "../ports.js";

export interface CompactionOptions {
  /** Trigger compaction when message count exceeds this. */
  maxMessages: number;
  /** How many of the most recent messages to keep verbatim. */
  keepRecent: number;
  /** Model used to produce the summary (often a cheap/fast model). */
  summarizer: ModelProvider;
}

/** Summarises the middle of the conversation into a single system note. */
export function compactionMiddleware(opts: CompactionOptions): ModelMiddleware {
  return async (req, next) => {
    if (req.messages.length <= opts.maxMessages) return next(req);

    const system = req.messages.filter((m) => m.role === "system");
    const body = req.messages.filter((m) => m.role !== "system");
    const recent = body.slice(-opts.keepRecent);
    const toSummarize = body.slice(0, body.length - opts.keepRecent);

    const transcript = toSummarize
      .map((m) => `${m.role}: ${"content" in m ? m.content : ""}`)
      .join("\n");
    const res = await opts.summarizer.generate(
      [
        {
          role: "system",
          content:
            "Summarise the conversation so far, preserving facts, decisions, and open tasks. Be concise.",
        },
        { role: "user", content: transcript },
      ],
      [],
    );

    const summaryNote: Message = {
      role: "system",
      content: `[conversation summary]\n${res.text ?? ""}`,
    };
    return next({ ...req, messages: [...system, summaryNote, ...recent] });
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run packages/core/src/middleware/compaction.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Export + wire (opt-in) + commit**

Add to `packages/core/src/index.ts`: `export * from "./middleware/compaction.js";`
Optionally add `compactionMiddleware({ maxMessages: 30, keepRecent: 8, summarizer: model })` to the observability plugin's `modelMiddleware` in the CLI. Run `pnpm -r exec tsc --noEmit`.

```bash
git add -A
git commit -m "feat(core): compaction/summarization middleware"
```

- [ ] **Step 6: Wire SQLite memory into CLI and verify persistence**

In `heads/cli/src/main.ts`, set `memory: await sqliteMemory({ url: "file:agent.sqlite" })` and add the dep. Run `pnpm cli`, say something, quit, restart, and confirm the agent recalls prior context in the same `sessionId`.

```bash
git add -A
git commit -m "feat(cli): persist sessions via sqlite memory"
```

**Phase 4 milestone: sessions persist and long chats self-compact.**

---

## Phase 5 — Web3 read slice

**Outcome:** An `evm` plugin reads chain state (balances, contract reads) via viem on a testnet, and the `Signer` port is implemented as a stub that refuses to send (signing arrives in Phase 6). Proves the kernel is chain-agnostic.

### Task 5.1: viem read-only EVM plugin

**Files:**

- Create: `packages/plugins/evm/package.json`
- Create: `packages/plugins/evm/tsconfig.json`
- Create: `packages/plugins/evm/src/index.ts`
- Create: `packages/plugins/evm/src/index.test.ts`

- [ ] **Step 1: Write `packages/plugins/evm/package.json`**

```json
{
  "name": "@thiny/plugin-evm",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "viem": "^2.17.0", "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Write `packages/plugins/evm/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/plugins/evm/src/index.test.ts`** (inject a fake public client — no RPC)

```ts
import { describe, it, expect } from "vitest";
import { evmPlugin } from "./index.js";

const fakeClient = {
  getBalance: async () => 1_500_000_000_000_000_000n, // 1.5 ETH
} as never;

describe("evmPlugin", () => {
  it("exposes evm_get_balance returning a human + raw value", async () => {
    const plugin = evmPlugin({ publicClient: fakeClient, chainId: 11155111, isTestnet: true });
    const tool = plugin.tools!.find((t) => t.name === "evm_get_balance")!;
    const out = (await tool.execute({ address: "0xabc" }, {} as never)) as {
      wei: string;
      eth: string;
    };
    expect(out.wei).toBe("1500000000000000000");
    expect(out.eth).toBe("1.5");
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run packages/plugins/evm/src/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 5: Write `packages/plugins/evm/src/index.ts`**

```ts
import { z } from "zod";
import { createPublicClient, http, formatEther, type PublicClient, type Abi } from "viem";
import { sepolia } from "viem/chains";
import { defineTool, type Plugin, type Hex } from "@thiny/core";

export interface EvmOptions {
  rpcUrl?: string;
  chainId?: number;
  isTestnet?: boolean;
  /** Inject a client for tests; otherwise built from rpcUrl. */
  publicClient?: PublicClient;
}

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x EVM address")
  .transform((s) => s as Hex);

export function evmPlugin(opts: EvmOptions = {}): Plugin {
  const client =
    opts.publicClient ?? createPublicClient({ chain: sepolia, transport: http(opts.rpcUrl) });

  return {
    name: "evm",
    tools: [
      defineTool({
        name: "evm_get_balance",
        description: "Get the native token balance of an EVM address.",
        parameters: z.object({ address: addressSchema }),
        execute: async ({ address }) => {
          const wei = await client.getBalance({ address });
          return { wei: wei.toString(), eth: formatEther(wei) };
        },
      }),
      defineTool({
        name: "evm_read_contract",
        description: "Call a read-only (view/pure) contract function and return the result.",
        parameters: z.object({
          address: addressSchema,
          abi: z.array(z.any()).describe("the contract ABI (JSON)"),
          functionName: z.string(),
          args: z.array(z.any()).default([]),
        }),
        execute: async ({ address, abi, functionName, args }) => {
          const result = await client.readContract({
            address,
            abi: abi as Abi,
            functionName,
            args,
          });
          // BigInt is not JSON-serialisable; stringify deeply.
          return JSON.parse(
            JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
          );
        },
      }),
    ],
  };
}
```

- [ ] **Step 6: Run to confirm pass**

Run: `pnpm vitest run packages/plugins/evm/src/index.test.ts`
Expected: PASS (1 test).

- [ ] **Step 7: Wire into CLI (opt-in on RPC env) + commit**

In `heads/cli/src/main.ts`, if `process.env.EVM_RPC_URL` set, `plugins.push(evmPlugin({ rpcUrl: process.env.EVM_RPC_URL, isTestnet: true }))`. Add dep + `pnpm install`. Run `pnpm cli` and ask: "what's the balance of 0x… ?".

```bash
git add -A
git commit -m "feat(plugin): read-only evm plugin (viem) on testnet"
```

### Task 5.2: The signer stub (refuses to send until Phase 6)

**Files:**

- Create: `packages/adapters/signer-viem/package.json`
- Create: `packages/adapters/signer-viem/tsconfig.json`
- Create: `packages/adapters/signer-viem/src/index.ts`
- Create: `packages/adapters/signer-viem/src/index.test.ts`

- [ ] **Step 1: Write `packages/adapters/signer-viem/package.json`**

```json
{
  "name": "@thiny/signer-viem",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "viem": "^2.17.0" }
}
```

- [ ] **Step 2: Write `packages/adapters/signer-viem/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/adapters/signer-viem/src/index.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { viemSigner } from "./index.js";

// A funded-looking but throwaway Anvil/test private key. NEVER use a real key in tests.
const TEST_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("viemSigner", () => {
  it("derives an address and reports testnet", () => {
    const signer = viemSigner({
      privateKey: TEST_PK,
      chainId: 11155111,
      isTestnet: true,
      rpcUrl: "http://localhost:8545",
    });
    expect(signer.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(signer.isTestnet).toBe(true);
  });

  it("refuses mainnet unless explicitly allowed", () => {
    expect(() =>
      viemSigner({ privateKey: TEST_PK, chainId: 1, isTestnet: false, rpcUrl: "http://x" }),
    ).toThrow(/mainnet.*allowMainnet/i);
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run packages/adapters/signer-viem/src/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 5: Write `packages/adapters/signer-viem/src/index.ts`**

```ts
import { createWalletClient, createPublicClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, mainnet } from "viem/chains";
import type { Signer, TxRequest, Hex } from "@thiny/core";

export interface ViemSignerOptions {
  privateKey: Hex;
  chainId: number;
  rpcUrl: string;
  isTestnet: boolean;
  /** Must be explicitly true to permit a mainnet chainId. */
  allowMainnet?: boolean;
}

const CHAINS: Record<number, Chain> = { 11155111: sepolia, 1: mainnet };

export function viemSigner(opts: ViemSignerOptions): Signer {
  if (!opts.isTestnet && opts.chainId === 1 && !opts.allowMainnet) {
    throw new Error("refusing mainnet signer: pass allowMainnet:true to enable real-value signing");
  }
  const chain = CHAINS[opts.chainId];
  if (!chain) throw new Error(`unsupported chainId: ${opts.chainId}`);
  const account = privateKeyToAccount(opts.privateKey);
  const wallet = createWalletClient({ account, chain, transport: http(opts.rpcUrl) });
  const pub = createPublicClient({ chain, transport: http(opts.rpcUrl) });

  return {
    address: account.address,
    chainId: opts.chainId,
    isTestnet: opts.isTestnet,
    async signAndSend(tx: TxRequest): Promise<Hex> {
      const hash = await wallet.sendTransaction({
        to: tx.to,
        value: tx.value,
        data: tx.data,
      });
      await pub.waitForTransactionReceipt({ hash });
      return hash;
    },
  };
}
```

- [ ] **Step 6: Run to confirm pass**

Run: `pnpm vitest run packages/adapters/signer-viem/src/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(adapter): viem testnet signer with mainnet guard"
```

**Phase 5 milestone: agent reads chain state; signer exists but sending is still gated by the absence of a send tool + (next) policy.**

---

## Phase 6 — Policy engine + approval gate + testnet signing

**Outcome:** The agent can propose a testnet transaction; a **deterministic** policy engine (caps, allowlist, testnet-only) plus a human approval gate decide whether it executes. This is the safety spine: _LLM proposes, non-AI layer enforces._

### Task 6.1: The policy engine (tool middleware)

**Files:**

- Create: `packages/core/src/middleware/policy.ts`
- Create: `packages/core/src/middleware/policy.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/middleware/policy.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { policyMiddleware, type PolicyRule } from "./policy.js";
import { defineTool } from "../tool.js";
import type { Ctx } from "../context.js";

const tool = (name: string, sensitive = false) =>
  defineTool({
    name,
    description: "",
    parameters: z.object({}),
    sensitive,
    execute: async () => "ran",
  });

const baseCtx = { approver: undefined } as unknown as Ctx;

describe("policyMiddleware", () => {
  it("allows non-sensitive tools by default", async () => {
    const run = policyMiddleware([]);
    const out = await run({ tool: tool("read"), args: {}, ctx: baseCtx }, async () => "ran");
    expect(out).toBe("ran");
  });

  it("denies when a rule returns deny", async () => {
    const deny: PolicyRule = () => ({ effect: "deny", reason: "nope" });
    const run = policyMiddleware([deny]);
    await expect(
      run({ tool: tool("x"), args: {}, ctx: baseCtx }, async () => "ran"),
    ).rejects.toThrow(/policy denied: nope/);
  });

  it("requires approval for sensitive tools and blocks when no approver", async () => {
    const run = policyMiddleware([]);
    await expect(
      run({ tool: tool("send", true), args: {}, ctx: baseCtx }, async () => "ran"),
    ).rejects.toThrow(/approval/i);
  });

  it("runs the tool when the approver says yes", async () => {
    const approver = vi.fn(async () => true);
    const ctx = { approver } as unknown as Ctx;
    const run = policyMiddleware([]);
    const out = await run({ tool: tool("send", true), args: {}, ctx }, async () => "ran");
    expect(out).toBe("ran");
    expect(approver).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run packages/core/src/middleware/policy.test.ts`
Expected: FAIL — cannot resolve `./policy.js`.

- [ ] **Step 3: Write `packages/core/src/middleware/policy.ts`**

```ts
import type { ToolMiddleware, ToolCallCtx } from "../middleware.js";
import { PolicyError } from "../errors.js";

export interface PolicyDecision {
  effect: "allow" | "deny" | "approve";
  reason: string;
}

/** A deterministic rule. Return null to abstain (let later rules / defaults decide). */
export type PolicyRule = (call: ToolCallCtx) => PolicyDecision | null;

/**
 * Deterministic gate over tool execution. The LLM cannot influence this:
 * decisions are computed from the tool definition + parsed args ONLY.
 */
export function policyMiddleware(rules: PolicyRule[]): ToolMiddleware {
  return async (call, next) => {
    let decision: PolicyDecision = {
      effect: call.tool.sensitive ? "approve" : "allow",
      reason: "default",
    };
    for (const rule of rules) {
      const d = rule(call);
      if (d) {
        decision = d;
        break;
      }
    }

    if (decision.effect === "deny") {
      throw new PolicyError(`policy denied: ${decision.reason}`);
    }
    if (decision.effect === "approve") {
      const approved = call.ctx.approver
        ? await call.ctx.approver({
            tool: call.tool.name,
            args: call.args,
            reason: decision.reason,
          })
        : false;
      if (!approved) throw new PolicyError(`approval required and not granted: ${call.tool.name}`);
    }
    return next(call);
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run packages/core/src/middleware/policy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Export + commit**

Add to `packages/core/src/index.ts`: `export * from "./middleware/policy.js";`

```bash
git add -A
git commit -m "feat(core): deterministic policy engine + approval gate"
```

### Task 6.2: EVM transfer rules + a sensitive send tool

**Files:**

- Create: `packages/plugins/evm/src/rules.ts`
- Create: `packages/plugins/evm/src/rules.test.ts`
- Modify: `packages/plugins/evm/src/index.ts` (add `evm_send_native` + accept a signer)

- [ ] **Step 1: Write the failing test `packages/plugins/evm/src/rules.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { evmTransferRules } from "./rules.js";
import { defineTool } from "@thiny/core";
import type { Ctx } from "@thiny/core";

const sendTool = defineTool({
  name: "evm_send_native",
  description: "",
  parameters: z.object({ to: z.string(), valueWei: z.string() }),
  sensitive: true,
  execute: async () => "0xhash",
});

const ctx = {} as Ctx;

describe("evmTransferRules", () => {
  const rules = evmTransferRules({ maxValueWei: 1_000_000n, allowlist: ["0xaaa"] });

  it("denies sends above the value cap", () => {
    const d = rules[0]!({ tool: sendTool, args: { to: "0xaaa", valueWei: "2000000" }, ctx });
    expect(d).toEqual({ effect: "deny", reason: expect.stringMatching(/cap/) });
  });

  it("denies sends to addresses not on the allowlist", () => {
    const d = rules[0]!({ tool: sendTool, args: { to: "0xbbb", valueWei: "10" }, ctx });
    expect(d).toEqual({ effect: "deny", reason: expect.stringMatching(/allowlist/) });
  });

  it("requires approval for an in-policy send", () => {
    const d = rules[0]!({ tool: sendTool, args: { to: "0xaaa", valueWei: "10" }, ctx });
    expect(d).toEqual({ effect: "approve", reason: expect.any(String) });
  });

  it("abstains (null) for non-send tools", () => {
    const other = { ...sendTool, name: "evm_get_balance" };
    expect(rules[0]!({ tool: other, args: {}, ctx })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run packages/plugins/evm/src/rules.test.ts`
Expected: FAIL — cannot resolve `./rules.js`.

- [ ] **Step 3: Write `packages/plugins/evm/src/rules.ts`**

```ts
import type { PolicyRule } from "@thiny/core";

export interface EvmTransferLimits {
  /** Max native value per transaction, in wei. */
  maxValueWei: bigint;
  /** Lowercased destination addresses permitted to receive funds. */
  allowlist: string[];
}

/** Deterministic guardrails for evm_send_native. Computed from args only. */
export function evmTransferRules(limits: EvmTransferLimits): PolicyRule[] {
  const allow = new Set(limits.allowlist.map((a) => a.toLowerCase()));
  return [
    (call) => {
      if (call.tool.name !== "evm_send_native") return null;
      const args = call.args as { to: string; valueWei: string };
      const value = BigInt(args.valueWei);
      if (value > limits.maxValueWei) {
        return { effect: "deny", reason: `value ${value} exceeds cap ${limits.maxValueWei}` };
      }
      if (!allow.has(args.to.toLowerCase())) {
        return { effect: "deny", reason: `destination ${args.to} not on allowlist` };
      }
      return { effect: "approve", reason: `send ${value} wei to ${args.to}` };
    },
  ];
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run packages/plugins/evm/src/rules.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the sensitive send tool** — Modify `packages/plugins/evm/src/index.ts`

Add to `EvmOptions`: `signer?: import("@thiny/core").Signer;`. Inside `tools: [...]`, append (only meaningful when a signer is present; otherwise it errors clearly, which the loop turns into an observation):

```ts
defineTool({
  name: "evm_send_native",
  description: "Send native testnet tokens to an address. Sensitive: requires policy approval.",
  sensitive: true,
  parameters: z.object({
    to: addressSchema,
    valueWei: z.string().regex(/^\d+$/, "wei as a decimal string"),
  }),
  execute: async ({ to, valueWei }, ctx) => {
    if (!ctx.signer) throw new Error("no signer configured");
    if (!ctx.signer.isTestnet) throw new Error("signer is not testnet; mainnet sends are disabled");
    const hash = await ctx.signer.signAndSend({
      to,
      value: BigInt(valueWei),
      chainId: ctx.signer.chainId,
    });
    return { hash };
  },
}),
```

- [ ] **Step 6: Re-run the evm tests + typecheck**

Run: `pnpm vitest run packages/plugins/evm` then `pnpm -r exec tsc --noEmit`.
Expected: all pass; no type errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(plugin): evm send tool + deterministic transfer rules"
```

### Task 6.3: Terminal approver + full Web3 wiring in the CLI

**Files:**

- Modify: `heads/cli/src/main.ts`

- [ ] **Step 1: Add a terminal approver and wire policy + signer**

```ts
import { policyMiddleware, type Approver } from "@thiny/core";
import { evmPlugin, evmTransferRules } from "@thiny/plugin-evm";
import { viemSigner } from "@thiny/signer-viem";

// ...inside main(), after rl is created:
const approver: Approver = async (req) => {
  const ans = await rl.question(
    `\n⚠️  APPROVE TOOL "${req.tool}"?\n   reason: ${req.reason}\n   args: ${JSON.stringify(req.args)}\n   [y/N] `,
  );
  return ans.trim().toLowerCase() === "y";
};

const signer =
  process.env.AGENT_PRIVATE_KEY && process.env.EVM_RPC_URL
    ? viemSigner({
        privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}`,
        chainId: 11155111,
        rpcUrl: process.env.EVM_RPC_URL,
        isTestnet: true,
      })
    : undefined;

const agent = await createAgent({
  model: aiSdkModel({ model: process.env.AGENT_MODEL ?? "openai:gpt-4o-mini" }),
  systemPrompt:
    "You are a Web3-capable agent. Read chain state freely. To move funds, propose evm_send_native; it will be policy-checked and require human approval.",
  tools: [echo],
  logger,
  memory: await sqliteMemory({ url: "file:agent.sqlite" }),
  signer,
  approver,
  plugins: [
    {
      name: "safety",
      modelMiddleware: [modelAudit(logger), budgetMiddleware({ maxCalls: 20, maxTokens: 200_000 })],
      toolMiddleware: [
        toolAudit(logger),
        policyMiddleware(
          evmTransferRules({
            maxValueWei: 10_000_000_000_000_000n,
            allowlist: (process.env.EVM_ALLOWLIST ?? "").split(",").filter(Boolean),
          }),
        ),
      ],
    },
    ...(signer && process.env.EVM_RPC_URL
      ? [evmPlugin({ rpcUrl: process.env.EVM_RPC_URL, isTestnet: true, signer })]
      : []),
  ],
});
```

Add the new deps to `heads/cli/package.json` (`@thiny/plugin-evm`, `@thiny/signer-viem`, `@thiny/memory-sqlite`) and `pnpm install`.

- [ ] **Step 2: Update `.env.example`**

```
OPENAI_API_KEY=sk-...
AGENT_MODEL=openai:gpt-4o-mini
EVM_RPC_URL=https://sepolia.infura.io/v3/<key>
AGENT_PRIVATE_KEY=0x...        # a TESTNET-ONLY throwaway key
EVM_ALLOWLIST=0xRecipientOne,0xRecipientTwo
LOG_LEVEL=info
BRAVE_API_KEY=                  # optional, enables web_search
```

- [ ] **Step 3: End-to-end Web3 test (testnet)**

Fund the testnet key from a Sepolia faucet. Run `pnpm cli`, then: `send 0.0001 test ETH to 0x<an allowlisted address>`.
Expected sequence: agent proposes `evm_send_native` → policy computes `approve` → CLI prints the approval prompt → you type `y` → tx broadcasts → hash returned. Try a non-allowlisted address: policy **denies** before any signing, and the denial is fed back to the model as an observation.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(cli): testnet signing gated by policy engine + human approval"
```

**Phase 6 milestone: the safety spine works — propose → deterministic policy → human approval → testnet send.**

---

## Phase 7 — `create-thiny` scaffolder

**Outcome:** `pnpm create-thiny <name>` (or `node apps/create-thiny`) generates a ready-to-run agent project wired with chosen plugins in seconds — the thing that ends "rebuild every hackathon."

### Task 7.1: Template files + generator

**Files:**

- Create: `apps/create-thiny/package.json`
- Create: `apps/create-thiny/tsconfig.json`
- Create: `apps/create-thiny/src/index.ts`
- Create: `apps/create-thiny/src/generate.ts`
- Create: `apps/create-thiny/src/generate.test.ts`
- Create: `apps/create-thiny/templates/agent.ts.tmpl`

- [ ] **Step 1: Write `apps/create-thiny/package.json`**

```json
{
  "name": "create-thiny",
  "version": "0.0.0",
  "type": "module",
  "bin": { "create-thiny": "./src/index.ts" },
  "dependencies": { "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Write `apps/create-thiny/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write the failing test `apps/create-thiny/src/generate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { renderAgentFile, planFiles } from "./generate.js";

describe("scaffolder", () => {
  it("includes selected plugin imports and excludes others", () => {
    const code = renderAgentFile({ name: "demo", plugins: ["web-search", "evm"] });
    expect(code).toContain('from "@thiny/plugin-web-search"');
    expect(code).toContain('from "@thiny/plugin-evm"');
    expect(code).not.toContain("plugin-solana");
  });

  it("plans package.json + agent entrypoint + env example", () => {
    const files = planFiles({ name: "demo", plugins: [] });
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual([".env.example", "package.json", "src/agent.ts"]);
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run apps/create-thiny/src/generate.test.ts`
Expected: FAIL — cannot resolve `./generate.js`.

- [ ] **Step 5: Write `apps/create-thiny/src/generate.ts`**

```ts
export interface ScaffoldOptions {
  name: string;
  plugins: string[]; // e.g. ["web-search", "evm"]
}

export interface GeneratedFile {
  path: string;
  contents: string;
}

const PLUGIN_IMPORTS: Record<string, { import: string; factory: string }> = {
  "web-search": {
    import: 'import { webSearchPlugin } from "@thiny/plugin-web-search";',
    factory: "webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY! })",
  },
  evm: {
    import: 'import { evmPlugin } from "@thiny/plugin-evm";',
    factory: "evmPlugin({ rpcUrl: process.env.EVM_RPC_URL!, isTestnet: true })",
  },
};

export function renderAgentFile(opts: ScaffoldOptions): string {
  const imports = opts.plugins
    .map((p) => PLUGIN_IMPORTS[p]?.import)
    .filter(Boolean)
    .join("\n");
  const factories = opts.plugins.map((p) => PLUGIN_IMPORTS[p]?.factory).filter(Boolean);
  return `import { createAgent } from "@thiny/core";
import { aiSdkModel } from "@thiny/model-aisdk";
${imports}

export async function buildAgent() {
  return createAgent({
    model: aiSdkModel({ model: process.env.AGENT_MODEL ?? "openai:gpt-4o-mini" }),
    systemPrompt: "You are ${opts.name}.",
    plugins: [
      ${factories.join(",\n      ")}
    ],
  });
}
`;
}

export function planFiles(opts: ScaffoldOptions): GeneratedFile[] {
  return [
    {
      path: "package.json",
      contents: JSON.stringify(
        {
          name: opts.name,
          private: true,
          type: "module",
          scripts: { agent: "node --env-file=.env --import tsx src/agent.ts" },
          dependencies: {
            "@thiny/core": "workspace:*",
            "@thiny/model-aisdk": "workspace:*",
            ...(opts.plugins.includes("web-search")
              ? { "@thiny/plugin-web-search": "workspace:*" }
              : {}),
            ...(opts.plugins.includes("evm") ? { "@thiny/plugin-evm": "workspace:*" } : {}),
          },
        },
        null,
        2,
      ),
    },
    { path: "src/agent.ts", contents: renderAgentFile(opts) },
    { path: ".env.example", contents: "OPENAI_API_KEY=\nAGENT_MODEL=openai:gpt-4o-mini\n" },
  ];
}
```

- [ ] **Step 6: Run to confirm pass**

Run: `pnpm vitest run apps/create-thiny/src/generate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Write the CLI entrypoint `apps/create-thiny/src/index.ts`**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { planFiles } from "./generate.js";

async function main() {
  const [, , name, ...rest] = process.argv;
  if (!name) {
    console.error("usage: create-thiny <name> [--plugins web-search,evm]");
    process.exit(1);
  }
  const pluginsArg = rest[rest.indexOf("--plugins") + 1] ?? "";
  const plugins = pluginsArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const files = planFiles({ name, plugins });
  for (const f of files) {
    const full = join(process.cwd(), name, f.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, f.contents);
  }
  console.error(`✓ created ${name}/ with plugins: ${plugins.join(", ") || "(none)"}`);
  console.error(`next: cd ${name} && cp .env.example .env && pnpm install && pnpm agent`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 8: Smoke-test the generator**

Run:

```bash
cd /Users/xfajarr/JarProjects/thiny
node --import tsx apps/create-thiny/src/index.ts my-hack --plugins web-search,evm
```

Expected: `my-hack/` is created with `package.json`, `src/agent.ts` (containing both plugin imports), and `.env.example`.

- [ ] **Step 9: Add root script + commit**

Add to `thiny/package.json` scripts: `"create-thiny": "node --import tsx apps/create-thiny/src/index.ts"`.

```bash
git add -A
git commit -m "feat(scaffolder): create-thiny generator with plugin selection"
```

**Phase 7 milestone: a new agent project is generated and runnable in under a minute. The base kernel is complete.**

---

## Phase 8 — Streaming responses (token-by-token)

**Outcome:** The agent streams the model's text to the head as it's generated, instead of blocking until the full response is ready. Implemented as an optional `stream` method on the `ModelProvider` port + an `onToken` callback threaded through `agent.run`. Crucially, the streaming path reuses the **same composed middleware** (budget/audit/compaction still wrap it) and the **same tool execution** (policy/approval still apply) — streaming changes the _delivery_, not the safety.

### Task 8.1: Stream event type + the `assembleStream` helper

**Files:**

- Create: `packages/core/src/domain/stream.ts`
- Create: `packages/core/src/stream.ts`
- Create: `packages/core/src/stream.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write `packages/core/src/domain/stream.ts`**

```ts
import type { ToolCall, FinishReason, Usage } from "./messages.js";

/** A normalised streaming event emitted by a provider's stream(). */
export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolCall: ToolCall }
  | { type: "finish"; finishReason: FinishReason; usage?: Usage };
```

- [ ] **Step 2: Write the failing test `packages/core/src/stream.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { assembleStream } from "./stream.js";
import type { StreamEvent } from "./domain/stream.js";

async function* gen(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const e of events) yield e;
}

describe("assembleStream", () => {
  it("accumulates text deltas, collects tool calls, captures finish + usage", async () => {
    const onText = vi.fn();
    const res = await assembleStream(
      gen([
        { type: "text-delta", text: "Hel" },
        { type: "text-delta", text: "lo" },
        { type: "tool-call", toolCall: { id: "1", name: "echo", args: { t: "x" } } },
        { type: "finish", finishReason: "tool_calls", usage: { inputTokens: 5, outputTokens: 2 } },
      ]),
      onText,
    );
    expect(res.text).toBe("Hello");
    expect(res.toolCalls).toEqual([{ id: "1", name: "echo", args: { t: "x" } }]);
    expect(res.finishReason).toBe("tool_calls");
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
    expect(onText).toHaveBeenNthCalledWith(1, "Hel");
    expect(onText).toHaveBeenNthCalledWith(2, "lo");
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm vitest run packages/core/src/stream.test.ts`
Expected: FAIL — cannot resolve `./stream.js`.

- [ ] **Step 4: Write `packages/core/src/stream.ts`**

```ts
import type { StreamEvent } from "./domain/stream.js";
import type { ModelResponse, ToolCall, FinishReason, Usage } from "./domain/messages.js";

/** Drain a provider stream into a ModelResponse, emitting text deltas via onText. */
export async function assembleStream(
  stream: AsyncIterable<StreamEvent>,
  onText?: (delta: string) => void,
): Promise<ModelResponse> {
  let text = "";
  const toolCalls: ToolCall[] = [];
  let finishReason: FinishReason = "stop";
  let usage: Usage | undefined;

  for await (const ev of stream) {
    if (ev.type === "text-delta") {
      text += ev.text;
      onText?.(ev.text);
    } else if (ev.type === "tool-call") {
      toolCalls.push(ev.toolCall);
    } else {
      finishReason = ev.finishReason;
      usage = ev.usage;
    }
  }

  return {
    text: text || undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    finishReason,
    usage,
  };
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm vitest run packages/core/src/stream.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Export + commit**

Add to `packages/core/src/index.ts`:

```ts
export * from "./domain/stream.js";
export * from "./stream.js";
```

```bash
git add -A
git commit -m "feat(core): stream event type and assembleStream helper"
```

### Task 8.2: Extend the `ModelProvider` port with optional `stream`

**Files:**

- Modify: `packages/core/src/ports.ts`

- [ ] **Step 1: Add the optional method** — Modify `packages/core/src/ports.ts`

Add the import and extend the interface (leave `generate` required; `stream` is optional so existing adapters keep working):

```ts
import type { Message, ModelResponse } from "./domain/messages.js";
import type { StreamEvent } from "./domain/stream.js";
import type { Tool } from "./tool.js";

export interface ModelProvider {
  generate(messages: Message[], tools: Tool[]): Promise<ModelResponse>;
  /** Optional token streaming. When present + an onToken sink exists, the loop uses it. */
  stream?(messages: Message[], tools: Tool[]): AsyncIterable<StreamEvent>;
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @thiny/core exec tsc -p tsconfig.json --noEmit`. Expected: no errors.

```bash
git add -A
git commit -m "feat(core): add optional stream() to ModelProvider port"
```

### Task 8.3: Implement streaming in the AI SDK adapter

**Files:**

- Modify: `packages/adapters/model-aisdk/src/index.ts`

- [ ] **Step 1: Add `streamText` import and the `stream` method** — Modify `packages/adapters/model-aisdk/src/index.ts`

Change the import line to include `streamText` and `StreamEvent`:

```ts
import { generateText, streamText, type LanguageModel } from "ai";
import type {
  ModelProvider,
  Message,
  ModelResponse,
  Tool,
  FinishReason,
  StreamEvent,
} from "@thiny/core";
```

Then, inside the object returned by `aiSdkModel`, add a `stream` method alongside `generate`:

```ts
    async *stream(messages: Message[], tools: Tool[]): AsyncGenerator<StreamEvent> {
      const result = streamText({
        model,
        messages: toCoreMessages(messages),
        tools: tools.length ? toAiTools(tools) : undefined,
        toolChoice: tools.length ? "auto" : undefined,
        maxRetries: opts.maxRetries ?? 2,
      });
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          yield { type: "text-delta", text: part.textDelta };
        } else if (part.type === "tool-call") {
          yield { type: "tool-call", toolCall: { id: part.toolCallId, name: part.toolName, args: part.args } };
        } else if (part.type === "finish") {
          yield {
            type: "finish",
            finishReason: mapFinish(part.finishReason),
            usage: part.usage
              ? { inputTokens: part.usage.promptTokens, outputTokens: part.usage.completionTokens }
              : undefined,
          };
        }
      }
    },
```

> AI SDK v4 note: `fullStream` yields `text-delta` (with `textDelta`), `tool-call`, and `finish` parts among others; we map only those three. On v5 the part shapes differ slightly — again, isolated to this file.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @thiny/model-aisdk exec tsc -p tsconfig.json --noEmit`. Expected: no errors.

```bash
git add -A
git commit -m "feat(adapter): streamText-based streaming on the model provider"
```

### Task 8.4: Thread `onToken` through `agent.run`

**Files:**

- Modify: `packages/core/src/agent.ts`

- [ ] **Step 1: Extend the `Agent.run` signature and the streaming base** — Modify `packages/core/src/agent.ts`

Add the import:

```ts
import { assembleStream } from "./stream.js";
```

Change the `Agent` interface:

```ts
export interface Agent {
  run(
    input: string,
    opts?: { sessionId?: string; onToken?: (delta: string) => void },
  ): Promise<string>;
  registry: ToolRegistry;
}
```

In `run(input, opts = {})`, replace the composed `generate` construction (added in Phase 3 Task 3.2) so its base optionally streams:

```ts
const generate = composeModel(collected.middleware.model, async (req) => {
  if (opts.onToken && config.model.stream) {
    return assembleStream(config.model.stream(req.messages, req.tools), opts.onToken);
  }
  return config.model.generate(req.messages, req.tools);
});
```

Everything else (tool middleware, the loop call) is unchanged — middleware still wraps the streaming base, so budget/audit/compaction and policy/approval all keep working.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm -r exec tsc --noEmit`. Expected: no errors.

```bash
git add -A
git commit -m "feat(core): onToken streaming through agent.run reusing middleware"
```

### Task 8.5: Stream to the terminal in the CLI head

**Files:**

- Modify: `heads/cli/src/main.ts`

- [ ] **Step 1: Pass an `onToken` sink and stop printing the duplicate final reply**

Replace the `agent.run` call in the REPL loop with a streaming version:

```ts
try {
  process.stdout.write("");
  const reply = await agent.run(input, {
    sessionId: "cli",
    onToken: (delta) => process.stdout.write(delta),
  });
  process.stdout.write("\n"); // newline after the streamed reply
  void reply; // already printed via deltas
} catch (err) {
  process.stdout.write(`\nerror: ${err instanceof Error ? err.message : String(err)}\n`);
}
```

- [ ] **Step 2: Run and watch it stream**

Run: `pnpm cli`, then ask a question that produces a few sentences.
Expected: the reply appears token-by-token, not all at once. Tool calls (e.g. `echo`, `evm_get_balance`) still execute mid-stream, and sensitive sends still hit the approval prompt.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(cli): token-by-token streaming output"
```

**Phase 8 milestone: responses stream live while all middleware and safety gates remain intact.**

---

## Phase 9 — Autonomous / always-on runtime

**Outcome:** A separate `@thiny/runtime` package turns the request-driven agent into an **always-on** one — firing jobs on intervals (heartbeats) and cron schedules, exactly like OpenClaw's "cron jobs + heartbeats" and Hermes's "autonomous scheduling." Every autonomous run still flows through the agent's policy engine and budget; the runtime adds its own guardrails (no-overlap, per-job kill switch) and a **headless approval model** (no human is present, so interactive approval is replaced by a deterministic auto-approver — default deny).

> **Why this is a new layer, not a plugin:** the kernel is turn-driven (`agent.run(input)`). Autonomy is a _scheduler above_ the agent that decides _when_ to call it. Keeping it in its own package means a plain hackathon agent stays request-driven and pulls in zero scheduler code.

### Task 9.1: Headless approvers in core

**Files:**

- Create: `packages/core/src/approvers.ts`
- Create: `packages/core/src/approvers.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/approvers.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { denyApprover, autoApprover } from "./approvers.js";

describe("headless approvers", () => {
  it("denyApprover always denies (safe default for autonomy)", async () => {
    expect(await denyApprover({ tool: "evm_send_native", args: {}, reason: "" })).toBe(false);
  });

  it("autoApprover approves only explicitly allowlisted tools", async () => {
    const approve = autoApprover(["safe_read"]);
    expect(await approve({ tool: "safe_read", args: {}, reason: "" })).toBe(true);
    expect(await approve({ tool: "evm_send_native", args: {}, reason: "" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run packages/core/src/approvers.test.ts`
Expected: FAIL — cannot resolve `./approvers.js`.

- [ ] **Step 3: Write `packages/core/src/approvers.ts`**

```ts
import type { Approver } from "./ports.js";

/** The safe default for headless/autonomous mode: never approve a sensitive tool. */
export const denyApprover: Approver = async () => false;

/**
 * Approve only tools whose names are explicitly allowlisted. Use with a policy
 * engine that has ALREADY capped value/allowlisted destinations — this is the
 * last gate, not the only one.
 */
export function autoApprover(allowTools: string[]): Approver {
  const allow = new Set(allowTools);
  return async (req) => allow.has(req.tool);
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run packages/core/src/approvers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Export + commit**

Add to `packages/core/src/index.ts`: `export * from "./approvers.js";`

```bash
git add -A
git commit -m "feat(core): headless deny/auto approvers for autonomous mode"
```

### Task 9.2: The runtime package (scheduler)

**Files:**

- Create: `packages/runtime/package.json`
- Create: `packages/runtime/tsconfig.json`
- Create: `packages/runtime/src/index.ts`
- Create: `packages/runtime/src/index.test.ts`

- [ ] **Step 1: Write `packages/runtime/package.json`**

```json
{
  "name": "@thiny/runtime",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "croner": "^8.1.0" }
}
```

- [ ] **Step 2: Write `packages/runtime/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/runtime/src/index.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { Runtime, type Job } from "./index.js";
import type { Agent } from "@thiny/core";

function fakeAgent(run: Agent["run"]): Agent {
  return {
    run,
    registry: {
      register() {},
      get() {
        throw new Error("x");
      },
      all() {
        return [];
      },
    } as never,
  };
}

describe("Runtime", () => {
  it("runJob calls agent.run with the job input and a derived sessionId", async () => {
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({ agent: fakeAgent(run as never) });
    await rt.runJob({ name: "j", trigger: { kind: "interval", ms: 1000 }, input: "hi" });
    expect(run).toHaveBeenCalledWith("hi", { sessionId: "job:j" });
  });

  it("resolves a function input before running", async () => {
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({ agent: fakeAgent(run as never) });
    await rt.runJob({
      name: "j",
      trigger: { kind: "interval", ms: 1000 },
      input: async () => "computed",
    });
    expect(run).toHaveBeenCalledWith("computed", { sessionId: "job:j" });
  });

  it("skips overlapping runs of the same job", async () => {
    let release!: () => void;
    const run = vi.fn(
      () =>
        new Promise<string>((r) => {
          release = () => r("ok");
        }),
    );
    const rt = new Runtime({ agent: fakeAgent(run as never) });
    const job: Job = { name: "j", trigger: { kind: "interval", ms: 1000 }, input: "hi" };
    const p1 = rt.runJob(job);
    const p2 = rt.runJob(job); // in-flight → skipped
    release();
    await Promise.all([p1, p2]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("enforces maxRuns as a kill switch", async () => {
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({ agent: fakeAgent(run as never) });
    const job: Job = {
      name: "j",
      trigger: { kind: "interval", ms: 1000 },
      input: "hi",
      maxRuns: 2,
    };
    await rt.runJob(job);
    await rt.runJob(job);
    await rt.runJob(job); // skipped
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("fires interval jobs on schedule and stops cleanly", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({
      agent: fakeAgent(run as never),
      jobs: [{ name: "j", trigger: { kind: "interval", ms: 1000 }, input: "hi" }],
    });
    rt.start();
    await vi.advanceTimersByTimeAsync(2500);
    await rt.stop();
    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run packages/runtime/src/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 5: Write `packages/runtime/src/index.ts`**

```ts
import { Cron } from "croner";
import type { Agent, Logger } from "@thiny/core";

export type Trigger = { kind: "interval"; ms: number } | { kind: "cron"; expr: string };

export interface Job {
  name: string;
  trigger: Trigger;
  /** A static prompt, or a function producing the run input (e.g. read a feed). */
  input: string | (() => string | Promise<string>);
  /** Defaults to `job:<name>` so each job keeps its own conversation. */
  sessionId?: string;
  /** Per-job kill switch: stop firing after this many runs. */
  maxRuns?: number;
}

export interface RuntimeOptions {
  agent: Agent;
  jobs?: Job[];
  logger?: Logger;
}

export class Runtime {
  private timers: Array<{ stop: () => void }> = [];
  private running = new Set<string>();
  private runs = new Map<string, number>();
  private stopped = false;

  constructor(private opts: RuntimeOptions) {}

  /** Fire one job once. Guards overlap + maxRuns; never throws. */
  async runJob(job: Job): Promise<void> {
    if (this.stopped) return;
    if (this.running.has(job.name)) {
      this.opts.logger?.warn({ job: job.name }, "skip: previous run in progress");
      return;
    }
    const count = this.runs.get(job.name) ?? 0;
    if (job.maxRuns !== undefined && count >= job.maxRuns) {
      this.opts.logger?.warn({ job: job.name }, "skip: maxRuns reached");
      return;
    }

    this.running.add(job.name);
    this.runs.set(job.name, count + 1);
    try {
      const input = typeof job.input === "function" ? await job.input() : job.input;
      const out = await this.opts.agent.run(input, {
        sessionId: job.sessionId ?? `job:${job.name}`,
      });
      this.opts.logger?.info({ job: job.name, out }, "job_run");
    } catch (err) {
      this.opts.logger?.error({ job: job.name, error: String(err) }, "job_failed");
    } finally {
      this.running.delete(job.name);
    }
  }

  /** Wire up all triggers and begin firing. */
  start(): void {
    this.stopped = false;
    for (const job of this.opts.jobs ?? []) {
      if (job.trigger.kind === "interval") {
        const id = setInterval(() => void this.runJob(job), job.trigger.ms);
        this.timers.push({ stop: () => clearInterval(id) });
      } else {
        const cron = new Cron(job.trigger.expr, () => void this.runJob(job));
        this.timers.push({ stop: () => cron.stop() });
      }
    }
  }

  /** Stop all triggers. In-flight runs finish naturally; new ones are blocked. */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const t of this.timers) t.stop();
    this.timers = [];
  }
}
```

- [ ] **Step 6: Install + run to confirm pass**

Run:

```bash
pnpm install
pnpm vitest run packages/runtime/src/index.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(runtime): autonomous scheduler with interval + cron jobs and kill switches"
```

### Task 9.3: A headless daemon head (always-on agent)

**Files:**

- Create: `heads/daemon/package.json`
- Create: `heads/daemon/tsconfig.json`
- Create: `heads/daemon/src/main.ts`

- [ ] **Step 1: Write `heads/daemon/package.json`**

```json
{
  "name": "@thiny/daemon",
  "version": "0.0.0",
  "type": "module",
  "bin": { "agent-daemon": "./src/main.ts" },
  "dependencies": {
    "@thiny/core": "workspace:*",
    "@thiny/model-aisdk": "workspace:*",
    "@thiny/runtime": "workspace:*"
  }
}
```

- [ ] **Step 2: Write `heads/daemon/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../packages/core" },
    { "path": "../../packages/adapters/model-aisdk" },
    { "path": "../../packages/runtime" }
  ]
}
```

- [ ] **Step 3: Write `heads/daemon/src/main.ts`**

```ts
import { createAgent, autoApprover } from "@thiny/core";
import { aiSdkModel } from "@thiny/model-aisdk";
import { Runtime } from "@thiny/runtime";

async function main() {
  const agent = await createAgent({
    model: aiSdkModel({ model: process.env.AGENT_MODEL ?? "openai:gpt-4o-mini" }),
    systemPrompt:
      "You are an autonomous agent. On each tick, decide whether action is needed. " +
      "If nothing needs doing, reply DONE. Only use tools permitted by policy.",
    // No human is present: approve ONLY explicitly listed safe tools; everything
    // sensitive is denied by default. Pair with policy caps for real safety.
    approver: autoApprover((process.env.AUTO_APPROVE_TOOLS ?? "").split(",").filter(Boolean)),
    // Add your safety middleware + plugins here exactly as in the CLI head.
  });

  const runtime = new Runtime({
    agent,
    jobs: [
      // Heartbeat: a frequent "wake up and check" tick.
      { name: "heartbeat", trigger: { kind: "interval", ms: 60_000 }, input: "Heartbeat tick." },
      // Cron: a scheduled task (09:00 daily).
      {
        name: "daily-report",
        trigger: { kind: "cron", expr: "0 9 * * *" },
        input: "Produce the daily report.",
      },
    ],
  });

  runtime.start();
  console.error("daemon running — ctrl+c to stop");

  const shutdown = async () => {
    console.error("\nstopping daemon...");
    await runtime.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Add a root script, install, and run**

Add to `thiny/package.json` scripts: `"daemon": "node --env-file=.env --import tsx heads/daemon/src/main.ts"`.
Run:

```bash
pnpm install
pnpm daemon
```

Expected: "daemon running"; within ~60s the heartbeat job fires and logs a `job_run` (the agent replies DONE when idle). Ctrl+C stops it cleanly.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(daemon): headless always-on runtime head with auto-approver + graceful shutdown"
```

### Autonomy safety model (read before going always-on)

An autonomous agent that can move funds is the **highest-risk configuration in this whole system**. Enforce all of these together:

1. **No interactive approval in headless mode.** There's no human to say "y" — use `denyApprover` (block all sensitive tools) or `autoApprover([...])` scoped to a tiny allowlist of provably-safe tools.
2. **Policy still rules.** The deterministic `policyMiddleware` (Phase 6) runs on every autonomous tool call. Value caps + destination allowlists are your real protection; the approver is just the final gate.
3. **Budget caps per run.** Keep `budgetMiddleware` wired so a misbehaving loop can't run up unbounded cost.
4. **Kill switches.** Use `maxRuns` per job during testing; add a global env flag (e.g. `AGENT_PAUSED`) your heartbeat checks first.
5. **Testnet only, unless airtight.** Never point an autonomous agent at mainnet signing without caps + allowlist + scoped auto-approval, and prefer a policy-controlled custodial wallet (Circle agent wallet) over a raw key.

**Phase 9 milestone: the agent runs unattended on a schedule, with every action still gated by deterministic policy, budget, and a headless approval model.**

---

## Phase 10 — MCP client adapter (consume any MCP server as tools)

**Outcome:** A `@thiny/mcp` adapter connects to a Model Context Protocol server, lists its tools, and registers each as a Thiny `Tool`. This is the **force multiplier** — every existing MCP server becomes instant capability with zero per-tool code.

> **Design:** MCP tools are discovered asynchronously, so the adapter is an **async plugin factory** (`await mcpPlugin(...)`) that connects, lists tools, builds `Tool[]`, and returns a `Plugin` (plus a `close()` for shutdown). MCP describes inputs as JSON Schema; we convert the common subset to Zod so the model still sees a proper schema.

### Task 10.1: JSON-Schema → Zod converter

**Files:**

- Create: `packages/adapters/mcp/package.json`
- Create: `packages/adapters/mcp/tsconfig.json`
- Create: `packages/adapters/mcp/src/schema.ts`
- Create: `packages/adapters/mcp/src/schema.test.ts`

- [ ] **Step 1: Write `packages/adapters/mcp/package.json`**

```json
{
  "name": "@thiny/mcp",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@thiny/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Write `packages/adapters/mcp/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/adapters/mcp/src/schema.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { jsonSchemaToZod } from "./schema.js";

describe("jsonSchemaToZod", () => {
  it("converts an object with required + optional primitive props", () => {
    const z = jsonSchemaToZod({
      type: "object",
      properties: { path: { type: "string" }, depth: { type: "integer" } },
      required: ["path"],
    });
    expect(z.safeParse({ path: "/a" }).success).toBe(true);
    expect(z.safeParse({ depth: 2 }).success).toBe(false); // missing required path
  });

  it("falls back to unknown for unsupported shapes", () => {
    expect(jsonSchemaToZod(undefined).safeParse(123).success).toBe(true);
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run packages/adapters/mcp/src/schema.test.ts`
Expected: FAIL — cannot resolve `./schema.js`.

- [ ] **Step 5: Write `packages/adapters/mcp/src/schema.ts`**

```ts
import { z } from "zod";

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
}

/** Minimal JSON-Schema → Zod for the common MCP subset. Unknown → z.unknown(). */
export function jsonSchemaToZod(schema: JsonSchema | undefined): z.ZodType {
  if (!schema || !schema.type) return z.unknown();
  switch (schema.type) {
    case "string":
      return schema.enum ? z.enum(schema.enum as [string, ...string[]]) : z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(jsonSchemaToZod(schema.items));
    case "object": {
      const shape: Record<string, z.ZodType> = {};
      const required = new Set(schema.required ?? []);
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        const zt = jsonSchemaToZod(prop);
        shape[key] = required.has(key) ? zt : zt.optional();
      }
      return z.object(shape).passthrough();
    }
    default:
      return z.unknown();
  }
}
```

- [ ] **Step 6: Run to confirm pass + commit**

Run: `pnpm install && pnpm vitest run packages/adapters/mcp/src/schema.test.ts` → PASS (2 tests).

```bash
git add -A
git commit -m "feat(mcp): json-schema to zod converter"
```

### Task 10.2: The MCP plugin factory

**Files:**

- Create: `packages/adapters/mcp/src/index.ts`

- [ ] **Step 1: Write `packages/adapters/mcp/src/index.ts`**

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { defineTool, type Plugin, type Tool } from "@thiny/core";
import { jsonSchemaToZod, type JsonSchema } from "./schema.js";

export interface McpStdioOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Prefix for tool names to avoid collisions, e.g. "fs" → fs_read_file. */
  name?: string;
}

export type McpPlugin = Plugin & { close(): Promise<void> };

/** Connect to an MCP server over stdio and expose its tools as Thiny tools. */
export async function mcpPlugin(opts: McpStdioOptions): Promise<McpPlugin> {
  const client = new Client({ name: "nucleus", version: "0.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: opts.command,
    args: opts.args ?? [],
    env: opts.env,
  });
  await client.connect(transport);

  const prefix = opts.name ?? "mcp";
  const listed = await client.listTools();
  const tools: Tool[] = listed.tools.map((t) =>
    defineTool({
      name: `${prefix}_${t.name}`,
      description: t.description ?? t.name,
      parameters: jsonSchemaToZod(t.inputSchema as JsonSchema),
      execute: async (args) => {
        const res = await client.callTool({
          name: t.name,
          arguments: (args ?? {}) as Record<string, unknown>,
        });
        return res.content;
      },
    }),
  );

  return {
    name: `mcp:${prefix}`,
    tools,
    async close() {
      await client.close();
    },
  };
}
```

- [ ] **Step 2: Manual smoke test (uses a public MCP server)**

In a scratch script or the CLI head:

```ts
const fs = await mcpPlugin({
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  name: "fs",
});
const agent = await createAgent({
  model: aiSdkModel({ model: "openai:gpt-4o-mini" }),
  plugins: [fs],
});
console.log(await agent.run("list the files in /tmp"));
// on shutdown: await fs.close();
```

Expected: the agent calls `fs_list_directory` (or similar) and reports files. (This is an I/O integration; the pure converter is unit-tested in 10.1.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(mcp): stdio MCP client plugin factory"
```

**Phase 10 milestone: any MCP server's tools are available to the agent with one `await mcpPlugin(...)`.**

---

## Phase 11 — HTTP/SSE head + tiny web UI

**Outcome:** An HTTP head streams responses over Server-Sent Events and serves a one-file web chat — turning the agent from a script into a demoable product. Reuses Phase 8 streaming via `onToken`.

### Task 11.1: SSE formatting + chat streaming (pure, testable)

**Files:**

- Create: `heads/http/package.json`
- Create: `heads/http/tsconfig.json`
- Create: `heads/http/src/sse.ts`
- Create: `heads/http/src/sse.test.ts`

- [ ] **Step 1: Write `heads/http/package.json`**

```json
{
  "name": "@thiny/http",
  "version": "0.0.0",
  "type": "module",
  "bin": { "agent-http": "./src/main.ts" },
  "dependencies": {
    "@thiny/core": "workspace:*",
    "@thiny/model-aisdk": "workspace:*"
  }
}
```

- [ ] **Step 2: Write `heads/http/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../packages/core" },
    { "path": "../../packages/adapters/model-aisdk" }
  ]
}
```

- [ ] **Step 3: Write the failing test `heads/http/src/sse.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { sseMessage, streamChat } from "./sse.js";
import type { Agent } from "@thiny/core";

describe("sse", () => {
  it("formats an SSE data frame as JSON", () => {
    expect(sseMessage({ type: "delta", text: "hi\nthere" })).toBe(
      'data: {"type":"delta","text":"hi\\nthere"}\n\n',
    );
  });

  it("streamChat writes a delta per token then a done frame", async () => {
    const agent: Agent = {
      run: vi.fn(async (_input, opts) => {
        opts?.onToken?.("He");
        opts?.onToken?.("llo");
        return "Hello";
      }),
      registry: {} as never,
      events: {} as never,
    };
    const chunks: string[] = [];
    await streamChat(agent, "hi", "s1", (c) => chunks.push(c));
    expect(chunks).toEqual([
      'data: {"type":"delta","text":"He"}\n\n',
      'data: {"type":"delta","text":"llo"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run heads/http/src/sse.test.ts`
Expected: FAIL — cannot resolve `./sse.js`.

- [ ] **Step 5: Write `heads/http/src/sse.ts`**

```ts
import type { Agent } from "@thiny/core";

export function sseMessage(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Run the agent, writing each token as an SSE delta, then a done frame. */
export async function streamChat(
  agent: Agent,
  input: string,
  sessionId: string,
  write: (chunk: string) => void,
): Promise<void> {
  await agent.run(input, {
    sessionId,
    onToken: (text) => write(sseMessage({ type: "delta", text })),
  });
  write(sseMessage({ type: "done" }));
}
```

- [ ] **Step 6: Run to confirm pass + commit**

Run: `pnpm vitest run heads/http/src/sse.test.ts` → PASS (2 tests).

```bash
git add -A
git commit -m "feat(http): SSE formatter and chat streaming helper"
```

### Task 11.2: The HTTP server + web UI

**Files:**

- Create: `heads/http/src/web.ts`
- Create: `heads/http/src/main.ts`

- [ ] **Step 1: Write `heads/http/src/web.ts`** (the one-file chat UI)

```ts
export const WEB_UI = `<!doctype html>
<html><head><meta charset="utf-8"><title>Thiny</title>
<style>body{font:16px system-ui;max-width:640px;margin:40px auto}#log{white-space:pre-wrap}
input{width:80%;padding:8px}button{padding:8px}</style></head>
<body><h3>Thiny</h3><div id="log"></div>
<form id="f"><input id="i" autocomplete="off" placeholder="say something..."/><button>send</button></form>
<script>
const log=document.getElementById('log'),i=document.getElementById('i');
document.getElementById('f').onsubmit=async(e)=>{e.preventDefault();
  const input=i.value;i.value='';log.textContent+='\\n> '+input+'\\n';
  const res=await fetch('/chat',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({input,sessionId:'web'})});
  const reader=res.body.getReader(),dec=new TextDecoder();let buf='';
  for(;;){const{value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});
    let idx;while((idx=buf.indexOf('\\n\\n'))>=0){const frame=buf.slice(0,idx);buf=buf.slice(idx+2);
      if(frame.startsWith('data: ')){const m=JSON.parse(frame.slice(6));
        if(m.type==='delta')log.textContent+=m.text;}}}};
</script></body></html>`;
```

- [ ] **Step 2: Write `heads/http/src/main.ts`**

```ts
import { createServer } from "node:http";
import { createAgent } from "@thiny/core";
import { aiSdkModel } from "@thiny/model-aisdk";
import { streamChat } from "./sse.js";
import { WEB_UI } from "./web.js";

async function main() {
  const agent = await createAgent({
    model: aiSdkModel({ model: process.env.AGENT_MODEL ?? "openai:gpt-4o-mini" }),
    systemPrompt: "You are a helpful web agent.",
  });

  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(WEB_UI);
      return;
    }
    if (req.method === "POST" && req.url === "/chat") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { input, sessionId } = JSON.parse(body || "{}") as {
        input: string;
        sessionId?: string;
      };
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      try {
        await streamChat(agent, input, sessionId ?? "web", (c) => res.write(c));
      } catch (err) {
        res.write(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`);
      }
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, () => console.error(`http head on http://localhost:${port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add a root script, run, and open the UI**

Add to `thiny/package.json` scripts: `"http": "node --env-file=.env --import tsx heads/http/src/main.ts"`.
Run `pnpm http`, open `http://localhost:8787`, send a message.
Expected: the reply streams into the page token-by-token.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(http): SSE server + one-file streaming web chat UI"
```

**Phase 11 milestone: a browser chat that streams — demo-ready.**

---

## Phase 12 — Eval / replay harness

**Outcome:** A `@thiny/eval` package runs scripted scenarios against the agent and asserts behavior (which tools were called, what the final answer contains) using a deterministic fake model. This is what stops you crashing on stage. Requires exposing the agent's event bus + an `off` method.

### Task 12.1: Expose `events` on the agent + `EventBus.off`

**Files:**

- Modify: `packages/core/src/events.ts`
- Modify: `packages/core/src/agent.ts`

- [ ] **Step 1: Add `off` to `EventBus`** — Modify `packages/core/src/events.ts`

Add this method to the `EventBus` class:

```ts
  off(event: KernelEvent, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }
```

- [ ] **Step 2: Expose `events` on the `Agent`** — Modify `packages/core/src/agent.ts`

Add `events: EventBus;` to the `Agent` interface, add the import `import { EventBus } from "./events.js";` if not present, and return `events` from `createAgent`:

```ts
export interface Agent {
  run(
    input: string,
    opts?: { sessionId?: string; onToken?: (delta: string) => void },
  ): Promise<string>;
  registry: ToolRegistry;
  events: EventBus;
}
// ...at the end of createAgent:
return { run, registry, events };
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm -r exec tsc --noEmit`. Expected: no errors (update any test fakes of `Agent` to include `events`).

```bash
git add -A
git commit -m "feat(core): expose agent.events and EventBus.off for evals/observers"
```

### Task 12.2: The eval runner + script model

**Files:**

- Create: `packages/eval/package.json`
- Create: `packages/eval/tsconfig.json`
- Create: `packages/eval/src/index.ts`
- Create: `packages/eval/src/index.test.ts`

- [ ] **Step 1: Write `packages/eval/package.json`**

```json
{
  "name": "@thiny/eval",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*" }
}
```

- [ ] **Step 2: Write `packages/eval/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/eval/src/index.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createAgent, defineTool } from "@thiny/core";
import { runEval, scriptModel } from "./index.js";

describe("runEval", () => {
  it("passes when the expected tool is called and final text matches", async () => {
    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [{ id: "1", name: "echo", args: { text: "hi" } }],
        },
        { finishReason: "stop", text: "the answer is hi" },
      ]),
      tools: [
        defineTool({
          name: "echo",
          description: "",
          parameters: z.object({ text: z.string() }),
          execute: async ({ text }) => text,
        }),
      ],
    });
    const results = await runEval(agent, [
      {
        name: "echo-test",
        input: "echo hi",
        expectToolCalls: ["echo"],
        expectFinal: /answer is hi/,
      },
    ]);
    expect(results[0]!.passed).toBe(true);
  });

  it("fails and reports when an expected tool is missing", async () => {
    const agent = await createAgent({
      model: scriptModel([{ finishReason: "stop", text: "nope" }]),
    });
    const results = await runEval(agent, [{ name: "t", input: "x", expectToolCalls: ["search"] }]);
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.reasons.join()).toMatch(/missing tool call: search/);
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run packages/eval/src/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 5: Write `packages/eval/src/index.ts`**

```ts
import type { Agent, ModelProvider, ModelResponse } from "@thiny/core";

/** A deterministic model that returns scripted responses in order. */
export function scriptModel(steps: ModelResponse[]): ModelProvider {
  let i = 0;
  return {
    async generate(): Promise<ModelResponse> {
      return steps[Math.min(i++, steps.length - 1)]!;
    },
  };
}

export interface Scenario {
  name: string;
  input: string;
  /** Tool names that MUST be called during the run. */
  expectToolCalls?: string[];
  /** Substring or RegExp the final answer must match. */
  expectFinal?: string | RegExp;
  sessionId?: string;
}

export interface EvalResult {
  name: string;
  passed: boolean;
  reasons: string[];
  final: string;
  toolCalls: string[];
}

export async function runEval(agent: Agent, scenarios: Scenario[]): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const s of scenarios) {
    const toolCalls: string[] = [];
    const handler = (p: unknown) => {
      toolCalls.push((p as { call: { name: string } }).call.name);
    };
    agent.events.on("beforeToolCall", handler);

    const reasons: string[] = [];
    let final = "";
    try {
      final = await agent.run(s.input, { sessionId: s.sessionId ?? `eval:${s.name}` });
    } catch (err) {
      reasons.push(`threw: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      agent.events.off("beforeToolCall", handler);
    }

    for (const t of s.expectToolCalls ?? []) {
      if (!toolCalls.includes(t)) reasons.push(`missing tool call: ${t}`);
    }
    if (s.expectFinal !== undefined) {
      const ok =
        typeof s.expectFinal === "string"
          ? final.includes(s.expectFinal)
          : s.expectFinal.test(final);
      if (!ok) reasons.push(`final did not match expectation`);
    }

    results.push({ name: s.name, passed: reasons.length === 0, reasons, final, toolCalls });
  }
  return results;
}
```

- [ ] **Step 6: Run to confirm pass + commit**

Run: `pnpm vitest run packages/eval/src/index.test.ts` → PASS (2 tests).

```bash
git add -A
git commit -m "feat(eval): scenario eval runner + deterministic script model"
```

**Phase 12 milestone: agent behavior is regression-tested with scripted scenarios — reliability before the demo.**

---

## Phase 13 — Solana plugin

**Outcome:** A `@thiny/plugin-solana` mirroring `evm`: read tools (balance) plus a sensitive `solana_send_sol` gated by policy + approval, on devnet. Doubles your addressable hackathons.

> **Note on signing:** the EVM-shaped `Signer` port doesn't fit Solana's keypair model, so this plugin carries its own optional `Keypair` and relies on the existing **policy + approval middleware** for gating (the same `sensitive: true` mechanism). Generalising the `Signer` port for multi-chain is deferred (see open questions).

### Task 13.1: Solana read tools + transfer rules

**Files:**

- Create: `packages/plugins/solana/package.json`
- Create: `packages/plugins/solana/tsconfig.json`
- Create: `packages/plugins/solana/src/rules.ts`
- Create: `packages/plugins/solana/src/rules.test.ts`
- Create: `packages/plugins/solana/src/index.ts`
- Create: `packages/plugins/solana/src/index.test.ts`

- [ ] **Step 1: Write `packages/plugins/solana/package.json`**

```json
{
  "name": "@thiny/plugin-solana",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "@solana/web3.js": "^1.95.0", "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Write `packages/plugins/solana/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/plugins/solana/src/rules.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { solanaTransferRules } from "./rules.js";
import { defineTool, type Ctx } from "@thiny/core";

const sendTool = defineTool({
  name: "solana_send_sol",
  description: "",
  parameters: z.object({ to: z.string(), lamports: z.string() }),
  sensitive: true,
  execute: async () => "sig",
});
const ctx = {} as Ctx;

describe("solanaTransferRules", () => {
  const rules = solanaTransferRules({ maxLamports: 1_000_000n, allowlist: ["Recipient111"] });

  it("denies above the lamport cap", () => {
    expect(
      rules[0]!({ tool: sendTool, args: { to: "Recipient111", lamports: "2000000" }, ctx }),
    ).toEqual({ effect: "deny", reason: expect.stringMatching(/cap/) });
  });
  it("denies non-allowlisted destinations", () => {
    expect(rules[0]!({ tool: sendTool, args: { to: "Other", lamports: "10" }, ctx })).toEqual({
      effect: "deny",
      reason: expect.stringMatching(/allowlist/),
    });
  });
  it("approves an in-policy send", () => {
    expect(
      rules[0]!({ tool: sendTool, args: { to: "Recipient111", lamports: "10" }, ctx }),
    ).toEqual({ effect: "approve", reason: expect.any(String) });
  });
});
```

- [ ] **Step 4: Run to confirm failure, then write `packages/plugins/solana/src/rules.ts`**

Run: `pnpm vitest run packages/plugins/solana/src/rules.test.ts` → FAIL (no `./rules.js`).

```ts
import type { PolicyRule } from "@thiny/core";

export interface SolanaTransferLimits {
  maxLamports: bigint;
  allowlist: string[];
}

export function solanaTransferRules(limits: SolanaTransferLimits): PolicyRule[] {
  const allow = new Set(limits.allowlist);
  return [
    (call) => {
      if (call.tool.name !== "solana_send_sol") return null;
      const args = call.args as { to: string; lamports: string };
      const lamports = BigInt(args.lamports);
      if (lamports > limits.maxLamports) {
        return { effect: "deny", reason: `lamports ${lamports} exceeds cap ${limits.maxLamports}` };
      }
      if (!allow.has(args.to)) {
        return { effect: "deny", reason: `destination ${args.to} not on allowlist` };
      }
      return { effect: "approve", reason: `send ${lamports} lamports to ${args.to}` };
    },
  ];
}
```

Re-run → PASS (3 tests).

- [ ] **Step 5: Write the failing test `packages/plugins/solana/src/index.test.ts`** (inject a fake connection)

```ts
import { describe, it, expect } from "vitest";
import { solanaPlugin } from "./index.js";

const fakeConnection = { getBalance: async () => 1_500_000_000 } as never; // 1.5 SOL in lamports

describe("solanaPlugin", () => {
  it("exposes solana_get_balance returning lamports + SOL", async () => {
    const plugin = solanaPlugin({ connection: fakeConnection });
    const tool = plugin.tools!.find((t) => t.name === "solana_get_balance")!;
    const out = (await tool.execute(
      { address: "So11111111111111111111111111111111111111112" },
      {} as never,
    )) as {
      lamports: string;
      sol: number;
    };
    expect(out.lamports).toBe("1500000000");
    expect(out.sol).toBeCloseTo(1.5);
  });
});
```

- [ ] **Step 6: Write `packages/plugins/solana/src/index.ts`**

```ts
import { z } from "zod";
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Cluster,
} from "@solana/web3.js";
import { defineTool, type Plugin } from "@thiny/core";

export interface SolanaOptions {
  cluster?: Cluster; // "devnet" (default), "testnet", "mainnet-beta"
  connection?: Connection; // inject for tests
  /** Optional signer for devnet sends (sensitive, policy-gated). */
  keypair?: Keypair;
}

const addressSchema = z.string().min(32).max(44);

export function solanaPlugin(opts: SolanaOptions = {}): Plugin {
  const connection =
    opts.connection ?? new Connection(clusterApiUrl(opts.cluster ?? "devnet"), "confirmed");

  const tools = [
    defineTool({
      name: "solana_get_balance",
      description: "Get the SOL balance of a Solana address.",
      parameters: z.object({ address: addressSchema }),
      execute: async ({ address }) => {
        const lamports = await connection.getBalance(new PublicKey(address));
        return { lamports: lamports.toString(), sol: lamports / LAMPORTS_PER_SOL };
      },
    }),
    defineTool({
      name: "solana_send_sol",
      description: "Send SOL on devnet. Sensitive: requires policy approval.",
      sensitive: true,
      parameters: z.object({ to: addressSchema, lamports: z.string().regex(/^\d+$/) }),
      execute: async ({ to, lamports }) => {
        if (!opts.keypair) throw new Error("no keypair configured");
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: opts.keypair.publicKey,
            toPubkey: new PublicKey(to),
            lamports: Number(BigInt(lamports)),
          }),
        );
        const sig = await sendAndConfirmTransaction(connection, tx, [opts.keypair]);
        return { signature: sig };
      },
    }),
  ];

  return { name: "solana", tools };
}
```

- [ ] **Step 7: Run + install + commit**

Run: `pnpm install && pnpm vitest run packages/plugins/solana` → PASS. Wire into a head with `solanaTransferRules(...)` in the policy middleware exactly like EVM.

```bash
git add -A
git commit -m "feat(plugin): solana read tools + gated devnet send + transfer rules"
```

**Phase 13 milestone: Solana hackathons are in scope, with the same deterministic safety as EVM.**

---

## Phase 14 — RAG / vector memory (knowledge plugin)

**Outcome:** A `@thiny/plugin-knowledge` adds retrieval-augmented context: ingest documents, embed them, and (a) inject the top-k relevant chunks before each model call via middleware, and (b) expose a `knowledge_search` tool. The `embedder` is injected so it's testable offline.

### Task 14.1: Cosine similarity + in-memory vector store

**Files:**

- Create: `packages/plugins/knowledge/package.json`
- Create: `packages/plugins/knowledge/tsconfig.json`
- Create: `packages/plugins/knowledge/src/store.ts`
- Create: `packages/plugins/knowledge/src/store.test.ts`

- [ ] **Step 1: Write `packages/plugins/knowledge/package.json`**

```json
{
  "name": "@thiny/plugin-knowledge",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Write `packages/plugins/knowledge/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/plugins/knowledge/src/store.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { cosine, memoryVectorStore } from "./store.js";

describe("vector store", () => {
  it("computes cosine similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns the nearest items first", () => {
    const store = memoryVectorStore();
    store.add([
      { text: "cats", embedding: [1, 0] },
      { text: "dogs", embedding: [0, 1] },
    ]);
    const hits = store.search([0.9, 0.1], 1);
    expect(hits[0]!.text).toBe("cats");
  });
});
```

- [ ] **Step 4: Run to confirm failure, then write `packages/plugins/knowledge/src/store.ts`**

Run: `pnpm vitest run packages/plugins/knowledge/src/store.test.ts` → FAIL.

```ts
export function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export interface VectorItem {
  text: string;
  embedding: number[];
}
export interface Hit {
  text: string;
  score: number;
}

export interface VectorStore {
  add(items: VectorItem[]): void;
  search(query: number[], k: number): Hit[];
}

/** Simple in-memory cosine store. Swap for libsql-vector / a real DB later. */
export function memoryVectorStore(): VectorStore {
  const items: VectorItem[] = [];
  return {
    add(newItems) {
      items.push(...newItems);
    },
    search(query, k) {
      return items
        .map((it) => ({ text: it.text, score: cosine(query, it.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}
```

Re-run → PASS (2 tests).

### Task 14.2: The knowledge plugin (ingest + tool + retrieval middleware)

**Files:**

- Create: `packages/plugins/knowledge/src/index.ts`
- Create: `packages/plugins/knowledge/src/index.test.ts`

- [ ] **Step 1: Write the failing test `packages/plugins/knowledge/src/index.test.ts`** (fake embedder = deterministic vectors)

```ts
import { describe, it, expect } from "vitest";
import { knowledgePlugin } from "./index.js";

// fake embedder: "cat" → [1,0], anything else → [0,1]
const embedder = async (texts: string[]) =>
  texts.map((t) => (t.toLowerCase().includes("cat") ? [1, 0] : [0, 1]));

describe("knowledgePlugin", () => {
  it("ingests docs and retrieves the relevant one via knowledge_search", async () => {
    const plugin = await knowledgePlugin({ embedder, topK: 1 });
    await plugin.ingest(["cats are felinue", "dogs bark"]);
    const tool = plugin.tools!.find((t) => t.name === "knowledge_search")!;
    const out = (await tool.execute({ query: "tell me about a cat" }, {} as never)) as {
      hits: { text: string }[];
    };
    expect(out.hits[0]!.text).toBe("cats are felinue");
  });
});
```

- [ ] **Step 2: Run to confirm failure, then write `packages/plugins/knowledge/src/index.ts`**

Run: `pnpm vitest run packages/plugins/knowledge/src/index.test.ts` → FAIL.

```ts
import { z } from "zod";
import { defineTool, type Plugin, type ModelMiddleware } from "@thiny/core";
import { memoryVectorStore, type VectorStore } from "./store.js";

/** Inject any embedding function: (texts) => vectors. */
export type Embedder = (texts: string[]) => Promise<number[][]>;

export interface KnowledgeOptions {
  embedder: Embedder;
  store?: VectorStore;
  topK?: number;
}

export type KnowledgePlugin = Plugin & { ingest(texts: string[]): Promise<void> };

export async function knowledgePlugin(opts: KnowledgeOptions): Promise<KnowledgePlugin> {
  const store = opts.store ?? memoryVectorStore();
  const topK = opts.topK ?? 4;

  async function ingest(texts: string[]): Promise<void> {
    const embeddings = await opts.embedder(texts);
    store.add(texts.map((text, i) => ({ text, embedding: embeddings[i]! })));
  }

  async function retrieve(query: string): Promise<string[]> {
    const [embedding] = await opts.embedder([query]);
    return store.search(embedding!, topK).map((h) => h.text);
  }

  // (a) explicit tool
  const searchTool = defineTool({
    name: "knowledge_search",
    description: "Search the ingested knowledge base for relevant passages.",
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => ({ hits: (await retrieve(query)).map((text) => ({ text })) }),
  });

  // (b) automatic context injection before each model call
  const retrievalMiddleware: ModelMiddleware = async (req, next) => {
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    if (lastUser && "content" in lastUser) {
      const hits = await retrieve(lastUser.content);
      if (hits.length) {
        const note = { role: "system" as const, content: `[knowledge]\n${hits.join("\n---\n")}` };
        return next({ ...req, messages: [note, ...req.messages] });
      }
    }
    return next(req);
  };

  return { name: "knowledge", tools: [searchTool], modelMiddleware: [retrievalMiddleware], ingest };
}
```

Re-run → PASS (1 test).

- [ ] **Step 3: Add the AI SDK embedder + commit**

For production, add `aiSdkEmbedder` to `@thiny/model-aisdk` (`packages/adapters/model-aisdk/src/embedder.ts`):

```ts
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import type { Embedder } from "@thiny/plugin-knowledge";

export function aiSdkEmbedder(modelId = "text-embedding-3-small"): Embedder {
  const model = openai.embedding(modelId);
  return async (texts) => {
    const { embeddings } = await embedMany({ model, values: texts });
    return embeddings;
  };
}
```

```bash
git add -A
git commit -m "feat(plugin): knowledge/RAG plugin with retrieval middleware + search tool"
```

**Phase 14 milestone: the agent answers grounded in ingested knowledge, with retrieval as middleware.**

---

## Phase 15 — Sub-agents / delegation (`ctx.spawn`)

**Outcome:** A tool can run a **scoped child agent** via `ctx.spawn(...)` — a fresh loop with its own tool set and isolated (ephemeral) message history, sharing the parent's model/events/logger. This is Hermes's marquee capability, kept deliberately thin (no rooms, no orchestration engine).

### Task 15.1: The spawn factory

**Files:**

- Create: `packages/core/src/spawn.ts`
- Create: `packages/core/src/spawn.test.ts`
- Modify: `packages/core/src/context.ts`
- Modify: `packages/core/src/agent.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/spawn.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { makeSpawn } from "./spawn.js";
import { EventBus } from "./events.js";
import { defineTool } from "./tool.js";
import type { ModelProvider } from "./ports.js";

const silent = {
  info() {},
  warn() {},
  error() {},
  child() {
    return silent;
  },
};

describe("makeSpawn", () => {
  it("runs a child loop with only the provided tools and returns its answer", async () => {
    const model: ModelProvider = {
      async generate() {
        return { text: "child done", finishReason: "stop" };
      },
    };
    const spawn = makeSpawn({ model, events: new EventBus(), logger: silent }, { maxSteps: 5 });
    const out = await spawn({
      input: "do the subtask",
      systemPrompt: "you are a sub-agent",
      tools: [
        defineTool({
          name: "noop",
          description: "",
          parameters: z.object({}),
          execute: async () => "x",
        }),
      ],
    });
    expect(out).toBe("child done");
  });
});
```

- [ ] **Step 2: Run to confirm failure, then write `packages/core/src/spawn.ts`**

Run: `pnpm vitest run packages/core/src/spawn.test.ts` → FAIL.

```ts
import type { ModelProvider, MemoryBackend, Logger } from "./ports.js";
import type { Tool } from "./tool.js";
import type { Message } from "./domain/messages.js";
import type { Ctx } from "./context.js";
import type { EventBus } from "./events.js";
import { ToolRegistry } from "./registry.js";
import { runLoop } from "./loop.js";
import { systemMessage } from "./domain/messages.js";

export interface SpawnOptions {
  input: string;
  tools?: Tool[];
  systemPrompt?: string;
  maxSteps?: number;
}
export type Spawn = (opts: SpawnOptions) => Promise<string>;

interface SpawnDeps {
  model: ModelProvider;
  events: EventBus;
  logger: Logger;
}

/** Isolated ephemeral memory for a single sub-agent run. */
function ephemeral(): MemoryBackend {
  return { load: async () => [], append: async () => {} };
}

export function makeSpawn(deps: SpawnDeps, defaults: { maxSteps: number }): Spawn {
  const spawn: Spawn = async (opts) => {
    const registry = new ToolRegistry();
    for (const t of opts.tools ?? []) registry.register(t);
    const ctx: Ctx = {
      sessionId: "spawn",
      model: deps.model,
      memory: ephemeral(),
      tools: registry,
      events: deps.events,
      logger: deps.logger,
      state: new Map(),
      maxSteps: opts.maxSteps ?? defaults.maxSteps,
      spawn, // allow nested delegation
    };
    const seed: Message[] = opts.systemPrompt ? [systemMessage(opts.systemPrompt)] : [];
    return runLoop(opts.input, ctx, { seed });
  };
  return spawn;
}
```

Re-run → PASS (1 test).

- [ ] **Step 3: Add `spawn` to `Ctx`** — Modify `packages/core/src/context.ts`

Add the import and field:

```ts
import type { Spawn } from "./spawn.js";
// ...inside Ctx:
  /** Run a scoped child agent (delegation). Present when configured by createAgent. */
  spawn?: Spawn;
```

- [ ] **Step 4: Wire `spawn` into the runtime ctx** — Modify `packages/core/src/agent.ts`

Add `import { makeSpawn } from "./spawn.js";`, and in `run()` where `ctx` is built, set:

```ts
ctx.spawn = makeSpawn(
  { model: config.model, events, logger: ctx.logger },
  { maxSteps: ctx.maxSteps },
);
```

(Assign after the `ctx` object literal so it can reference `ctx.logger`/`ctx.maxSteps`.)

- [ ] **Step 5: Export + typecheck + commit**

Add to `packages/core/src/index.ts`: `export * from "./spawn.js";`
Run `pnpm -r exec tsc --noEmit` → no errors.

```bash
git add -A
git commit -m "feat(core): ctx.spawn for scoped sub-agent delegation"
```

**Phase 15 milestone: a tool can delegate to a child agent with its own tools — thin, composable multi-agent.**

---

## Phase 16 — Resilience middleware bundle + structured output

**Outcome:** A `@thiny/plugin-resilience` providing opt-in tool middleware — `retry`, `timeout`, `rateLimit`, `cache`, `idempotency` — plus a `runStructured` helper for Zod-validated JSON final output (makes the agent composable in pipelines).

### Task 16.1: The resilience middlewares

**Files:**

- Create: `packages/plugins/resilience/package.json`
- Create: `packages/plugins/resilience/tsconfig.json`
- Create: `packages/plugins/resilience/src/index.ts`
- Create: `packages/plugins/resilience/src/index.test.ts`

- [ ] **Step 1: Write `packages/plugins/resilience/package.json`**

```json
{
  "name": "@thiny/plugin-resilience",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Write `packages/plugins/resilience/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/plugins/resilience/src/index.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { retry, timeout, rateLimit, cache, idempotency, runStructured } from "./index.js";
import { z } from "zod";
import type { ToolCallCtx } from "@thiny/core";

const call = (name: string, args: unknown = {}): ToolCallCtx => ({
  tool: { name } as never,
  args,
  ctx: {} as never,
});

describe("resilience middleware", () => {
  it("retry retries a failing call up to N times then succeeds", async () => {
    const mw = retry({ retries: 2, baseMs: 0 });
    let n = 0;
    const next = async () => {
      if (++n < 3) throw new Error("fail");
      return "ok";
    };
    expect(await mw(call("t"), next)).toBe("ok");
    expect(n).toBe(3);
  });

  it("timeout rejects a call that runs too long", async () => {
    const mw = timeout(10);
    const next = () => new Promise((r) => setTimeout(() => r("late"), 50));
    await expect(mw(call("t"), next)).rejects.toThrow(/timeout/i);
  });

  it("rateLimit throws once the per-window cap is exceeded", async () => {
    const mw = rateLimit(1);
    const next = async () => "ok";
    await mw(call("t"), next);
    await expect(mw(call("t"), next)).rejects.toThrow(/rate limit/i);
  });

  it("cache returns the stored result without re-running", async () => {
    const mw = cache();
    const next = vi.fn(async () => "computed");
    await mw(call("t", { a: 1 }), next);
    const second = await mw(call("t", { a: 1 }), next);
    expect(second).toBe("computed");
    expect(next).toHaveBeenCalledOnce();
  });

  it("idempotency returns the first result for a repeated key", async () => {
    const mw = idempotency();
    const next = vi.fn(async () => Math.random());
    const a = await mw(call("t", { idempotencyKey: "k1" }), next);
    const b = await mw(call("t", { idempotencyKey: "k1" }), next);
    expect(a).toBe(b);
    expect(next).toHaveBeenCalledOnce();
  });

  it("runStructured parses + validates the final JSON answer", async () => {
    const agent = {
      run: async () => '{"score": 9, "verdict": "good"}',
      registry: {} as never,
      events: {} as never,
    };
    const schema = z.object({ score: z.number(), verdict: z.string() });
    const out = await runStructured(agent as never, "rate this", schema);
    expect(out).toEqual({ score: 9, verdict: "good" });
  });
});
```

- [ ] **Step 4: Run to confirm failure, then write `packages/plugins/resilience/src/index.ts`**

Run: `pnpm vitest run packages/plugins/resilience/src/index.test.ts` → FAIL.

```ts
import type { ToolMiddleware, Agent } from "@thiny/core";
import type { z } from "zod";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry a failing tool call with exponential backoff. Use only for idempotent/read tools. */
export function retry(opts: { retries: number; baseMs: number }): ToolMiddleware {
  return async (call, next) => {
    let last: unknown;
    for (let i = 0; i <= opts.retries; i++) {
      try {
        return await next(call);
      } catch (err) {
        last = err;
        if (i < opts.retries) await delay(opts.baseMs * 2 ** i);
      }
    }
    throw last;
  };
}

/** Fail a tool call that exceeds the timeout. */
export function timeout(ms: number): ToolMiddleware {
  return async (call, next) =>
    Promise.race([
      next(call),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
    ]);
}

/** Throttle calls per rolling 60s window (per process). */
export function rateLimit(perMinute: number): ToolMiddleware {
  const hits: number[] = [];
  return async (call, next) => {
    const now = Date.now();
    while (hits.length && now - hits[0]! > 60_000) hits.shift();
    if (hits.length >= perMinute) throw new Error(`rate limit exceeded: ${call.tool.name}`);
    hits.push(now);
    return next(call);
  };
}

/** Memoise results by tool name + args. Best for pure/read tools. */
export function cache(): ToolMiddleware {
  const store = new Map<string, unknown>();
  return async (call, next) => {
    const key = `${call.tool.name}:${JSON.stringify(call.args)}`;
    if (store.has(key)) return store.get(key);
    const result = await next(call);
    store.set(key, result);
    return result;
  };
}

/** Dedup side-effecting calls by an `idempotencyKey` field in args. */
export function idempotency(): ToolMiddleware {
  const seen = new Map<string, unknown>();
  return async (call, next) => {
    const key = (call.args as { idempotencyKey?: string })?.idempotencyKey;
    if (key && seen.has(key)) return seen.get(key);
    const result = await next(call);
    if (key) seen.set(key, result);
    return result;
  };
}

/** Run the agent and parse its final answer as Zod-validated JSON. */
export async function runStructured<T>(
  agent: Agent,
  input: string,
  schema: z.ZodType<T>,
  opts?: { sessionId?: string },
): Promise<T> {
  const text = await agent.run(
    `${input}\n\nRespond with ONLY a JSON object, no prose, no code fences.`,
    opts,
  );
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object found in the agent's final answer");
  return schema.parse(JSON.parse(match[0]));
}
```

Re-run → PASS (6 tests).

- [ ] **Step 5: Wire as one plugin + commit**

Usage (opt-in, bundled): add to a head's plugins:

```ts
{ name: "resilience", toolMiddleware: [timeout(15_000), retry({ retries: 2, baseMs: 200 }), rateLimit(60), cache(), idempotency()] }
```

Order matters: place `timeout`/`retry` outermost, `cache`/`idempotency` innermost (so cached/idempotent hits skip retries).

```bash
git add -A
git commit -m "feat(plugin): resilience middleware bundle + runStructured output helper"
```

**Phase 16 milestone: tools are robust (retry/timeout/rate-limit/cache/idempotency) and the agent can return validated structured JSON.**

---

## Phase 17 — Token ops (ERC-20 + SPL)

**Outcome:** A `@thiny/plugin-tokens` adds token-level read + write tools for EVM (ERC-20) and Solana (SPL). This is the prerequisite for DeFi — every protocol runs on tokens, not native. All write tools are `sensitive: true` and capped by policy. **Kills the unlimited-approval footgun** by enforcing an amount cap on every `approve` call.

### Task 17.1: ERC-20 tools

**Files:**

- Create: `packages/plugins/tokens/package.json`
- Create: `packages/plugins/tokens/tsconfig.json`
- Create: `packages/plugins/tokens/src/erc20.ts`
- Create: `packages/plugins/tokens/src/erc20.test.ts`

- [ ] **Step 1: Write `packages/plugins/tokens/package.json`**

```json
{
  "name": "@thiny/plugin-tokens",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "viem": "^2.17.0", "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Write `packages/plugins/tokens/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/plugins/tokens/src/erc20.test.ts`** (fake client — no RPC)

```ts
import { describe, it, expect } from "vitest";
import { erc20Tools } from "./erc20.js";

const fakeClient = {
  readContract: async ({ functionName }: { functionName: string }) => {
    if (functionName === "balanceOf") return 2_000_000_000_000_000_000n; // 2 tokens (18 dec)
    if (functionName === "decimals") return 18;
    if (functionName === "symbol") return "TEST";
    if (functionName === "allowance") return 0n;
    return null;
  },
} as never;

describe("erc20Tools", () => {
  it("erc20_balance returns human-readable amount + raw", async () => {
    const tools = erc20Tools({ publicClient: fakeClient });
    const balance = tools.find((t) => t.name === "erc20_balance")!;
    const out = (await balance.execute(
      { token: "0xTokenAddr", owner: "0xOwner" },
      {} as never,
    )) as { raw: string; formatted: string; symbol: string };
    expect(out.raw).toBe("2000000000000000000");
    expect(out.formatted).toBe("2");
    expect(out.symbol).toBe("TEST");
  });

  it("erc20_allowance returns allowance in formatted + raw", async () => {
    const tools = erc20Tools({ publicClient: fakeClient });
    const allowance = tools.find((t) => t.name === "erc20_allowance")!;
    const out = (await allowance.execute(
      { token: "0xToken", owner: "0xOwner", spender: "0xSpender" },
      {} as never,
    )) as { raw: string };
    expect(out.raw).toBe("0");
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run packages/plugins/tokens/src/erc20.test.ts`
Expected: FAIL — cannot resolve `./erc20.js`.

- [ ] **Step 5: Write `packages/plugins/tokens/src/erc20.ts`**

```ts
import { z } from "zod";
import { formatUnits, type PublicClient, type WalletClient } from "viem";
import { defineTool, type Tool, type Hex } from "@thiny/core";

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "decimals",
    type: "function",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    name: "symbol",
    type: "function",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((s) => s as Hex);

export interface Erc20Options {
  publicClient: PublicClient;
  walletClient?: WalletClient;
}

export function erc20Tools(opts: Erc20Options): Tool[] {
  const r = (fn: string, args: unknown[]) =>
    opts.publicClient.readContract({
      address: args[0] as Hex,
      abi: ERC20_ABI,
      functionName: fn as never,
      args: args.slice(1) as never,
    });

  return [
    defineTool({
      name: "erc20_balance",
      description: "Get the ERC-20 token balance of an address (formatted + raw).",
      parameters: z.object({ token: addressSchema, owner: addressSchema }),
      execute: async ({ token, owner }) => {
        const [raw, decimals, symbol] = await Promise.all([
          r("balanceOf", [token, owner]),
          r("decimals", [token]),
          r("symbol", [token]),
        ]);
        return {
          raw: String(raw),
          formatted: formatUnits(raw as bigint, decimals as number),
          symbol,
        };
      },
    }),
    defineTool({
      name: "erc20_allowance",
      description: "Get how much a spender is allowed to spend on behalf of an owner.",
      parameters: z.object({ token: addressSchema, owner: addressSchema, spender: addressSchema }),
      execute: async ({ token, owner, spender }) => {
        const [raw, decimals] = await Promise.all([
          r("allowance", [token, owner, spender]),
          r("decimals", [token]),
        ]);
        return { raw: String(raw), formatted: formatUnits(raw as bigint, decimals as number) };
      },
    }),
    defineTool({
      name: "erc20_approve",
      description:
        "Approve a spender to use a capped amount of tokens. Sensitive: requires policy approval. Always approve the MINIMUM needed — never unlimited.",
      sensitive: true,
      parameters: z.object({
        token: addressSchema,
        spender: addressSchema,
        amountWei: z.string().regex(/^\d+$/, "wei as decimal string"),
      }),
      execute: async ({ token, spender, amountWei }, ctx) => {
        if (!opts.walletClient) throw new Error("no wallet client configured");
        if (!ctx.signer?.isTestnet)
          throw new Error("approve only on testnet unless explicitly enabled");
        const hash = await opts.walletClient.writeContract({
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [spender, BigInt(amountWei)],
        });
        return { hash };
      },
    }),
    defineTool({
      name: "erc20_transfer",
      description: "Transfer ERC-20 tokens to an address. Sensitive: requires policy approval.",
      sensitive: true,
      parameters: z.object({
        token: addressSchema,
        to: addressSchema,
        amountWei: z.string().regex(/^\d+$/),
      }),
      execute: async ({ token, to, amountWei }, ctx) => {
        if (!opts.walletClient) throw new Error("no wallet client configured");
        if (!ctx.signer?.isTestnet)
          throw new Error("transfer only on testnet unless explicitly enabled");
        const hash = await opts.walletClient.writeContract({
          address: token,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [to, BigInt(amountWei)],
        });
        return { hash };
      },
    }),
  ];
}
```

- [ ] **Step 6: Run to confirm pass**

Run: `pnpm vitest run packages/plugins/tokens/src/erc20.test.ts`
Expected: PASS (2 tests).

### Task 17.2: ERC-20 policy rules + SPL balance tool + barrel

**Files:**

- Create: `packages/plugins/tokens/src/rules.ts`
- Create: `packages/plugins/tokens/src/rules.test.ts`
- Create: `packages/plugins/tokens/src/spl.ts`
- Create: `packages/plugins/tokens/src/spl.test.ts`
- Create: `packages/plugins/tokens/src/index.ts`

- [ ] **Step 1: Write the failing test `packages/plugins/tokens/src/rules.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { erc20TokenRules } from "./rules.js";
import { defineTool, type Ctx } from "@thiny/core";

const approveTool = defineTool({
  name: "erc20_approve",
  description: "",
  sensitive: true,
  parameters: z.object({ token: z.string(), spender: z.string(), amountWei: z.string() }),
  execute: async () => "hash",
});
const ctx = {} as Ctx;
const rules = erc20TokenRules({
  allowedTokens: ["0xUsdc"],
  allowedSpenders: ["0xRouter"],
  maxApproveWei: 1_000_000n,
});

describe("erc20TokenRules", () => {
  it("denies approval for non-allowlisted token", () => {
    const d = rules[0]!({
      tool: approveTool,
      args: { token: "0xOther", spender: "0xRouter", amountWei: "100" },
      ctx,
    });
    expect(d).toEqual({ effect: "deny", reason: expect.stringMatching(/token.*allowlist/i) });
  });

  it("denies approval for non-allowlisted spender", () => {
    const d = rules[0]!({
      tool: approveTool,
      args: { token: "0xUsdc", spender: "0xHacker", amountWei: "100" },
      ctx,
    });
    expect(d).toEqual({ effect: "deny", reason: expect.stringMatching(/spender.*allowlist/i) });
  });

  it("denies approval exceeding max", () => {
    const d = rules[0]!({
      tool: approveTool,
      args: { token: "0xUsdc", spender: "0xRouter", amountWei: "9999999" },
      ctx,
    });
    expect(d).toEqual({ effect: "deny", reason: expect.stringMatching(/cap/i) });
  });

  it("approves in-policy approval", () => {
    const d = rules[0]!({
      tool: approveTool,
      args: { token: "0xUsdc", spender: "0xRouter", amountWei: "100" },
      ctx,
    });
    expect(d).toEqual({ effect: "approve", reason: expect.any(String) });
  });

  it("abstains for non-token tools", () => {
    const other = { ...approveTool, name: "erc20_balance" };
    expect(rules[0]!({ tool: other, args: {}, ctx })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure, then write `packages/plugins/tokens/src/rules.ts`**

Run: `pnpm vitest run packages/plugins/tokens/src/rules.test.ts` → FAIL.

```ts
import type { PolicyRule } from "@thiny/core";

export interface Erc20TokenLimits {
  allowedTokens: string[];
  allowedSpenders: string[];
  maxApproveWei: bigint;
  maxTransferWei?: bigint;
}

const TOKEN_WRITE_TOOLS = new Set(["erc20_approve", "erc20_transfer"]);

export function erc20TokenRules(limits: Erc20TokenLimits): PolicyRule[] {
  const tokens = new Set(limits.allowedTokens.map((t) => t.toLowerCase()));
  const spenders = new Set(limits.allowedSpenders.map((s) => s.toLowerCase()));
  return [
    (call) => {
      if (!TOKEN_WRITE_TOOLS.has(call.tool.name)) return null;
      const args = call.args as { token: string; spender?: string; to?: string; amountWei: string };
      if (!tokens.has(args.token.toLowerCase())) {
        return { effect: "deny", reason: `token ${args.token} not on token allowlist` };
      }
      const dest = (args.spender ?? args.to ?? "").toLowerCase();
      if (!spenders.has(dest)) {
        return { effect: "deny", reason: `spender/recipient ${dest} not on spender allowlist` };
      }
      const amount = BigInt(args.amountWei);
      const cap =
        call.tool.name === "erc20_approve"
          ? limits.maxApproveWei
          : (limits.maxTransferWei ?? limits.maxApproveWei);
      if (amount > cap) {
        return { effect: "deny", reason: `amount ${amount} exceeds cap ${cap}` };
      }
      return {
        effect: "approve",
        reason: `${call.tool.name} ${amount} of ${args.token} to ${dest}`,
      };
    },
  ];
}
```

Re-run → PASS (5 tests).

- [ ] **Step 3: Write `packages/plugins/tokens/src/spl.test.ts`** (SPL balance — fake RPC)

```ts
import { describe, it, expect } from "vitest";
import { splBalanceTool } from "./spl.js";

const fakeConn = {
  getTokenAccountsByOwner: async () => ({
    value: [
      {
        account: {
          data: {
            parsed: { info: { tokenAmount: { amount: "5000000", decimals: 6, uiAmount: 5 } } },
          },
        },
      },
    ],
  }),
} as never;

describe("splBalanceTool", () => {
  it("returns token accounts with amounts", async () => {
    const tool = splBalanceTool(fakeConn);
    const out = (await tool.execute({ owner: "AnyPubkey" }, {} as never)) as {
      accounts: { amount: string }[];
    };
    expect(out.accounts[0]!.amount).toBe("5000000");
  });
});
```

- [ ] **Step 4: Write `packages/plugins/tokens/src/spl.ts`**

```ts
import { z } from "zod";
import { PublicKey, type Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { defineTool, type Tool } from "@thiny/core";

export function splBalanceTool(connection: Connection): Tool {
  return defineTool({
    name: "spl_token_balance",
    description: "Get all SPL token account balances for a Solana wallet.",
    parameters: z.object({ owner: z.string().min(32) }),
    execute: async ({ owner }) => {
      const res = await connection.getTokenAccountsByOwner(
        new PublicKey(owner),
        { programId: TOKEN_PROGRAM_ID },
        "confirmed",
      );
      return {
        accounts: res.value.map((a) => {
          const info = a.account.data.parsed.info.tokenAmount;
          return {
            mint: a.account.data.parsed.info.mint,
            amount: info.amount,
            decimals: info.decimals,
            uiAmount: info.uiAmount,
          };
        }),
      };
    },
  });
}
```

> Requires `@solana/spl-token` — add to `packages/plugins/tokens/package.json` dependencies: `"@solana/spl-token": "^0.4.0"`.

- [ ] **Step 5: Run all token tests**

Run: `pnpm vitest run packages/plugins/tokens`
Expected: PASS (all tests).

- [ ] **Step 6: Write `packages/plugins/tokens/src/index.ts`** (barrel + plugin factory)

```ts
export { erc20Tools } from "./erc20.js";
export { erc20TokenRules } from "./rules.js";
export { splBalanceTool } from "./spl.js";
import type { Plugin } from "@thiny/core";
import type { PublicClient, WalletClient } from "viem";
import type { Connection } from "@solana/web3.js";
import { erc20Tools } from "./erc20.js";
import { splBalanceTool } from "./spl.js";

export interface TokensPluginOptions {
  evm?: { publicClient: PublicClient; walletClient?: WalletClient };
  solana?: { connection: Connection };
}

export function tokensPlugin(opts: TokensPluginOptions): Plugin {
  return {
    name: "tokens",
    tools: [
      ...(opts.evm ? erc20Tools(opts.evm) : []),
      ...(opts.solana ? [splBalanceTool(opts.solana.connection)] : []),
    ],
  };
}
```

- [ ] **Step 7: Install + typecheck + commit**

Run: `pnpm install && pnpm -r exec tsc --noEmit`

```bash
git add -A
git commit -m "feat(plugin): ERC-20 + SPL token ops with approval-cap policy rules"
```

**Phase 17 milestone: the agent reads and writes tokens (ERC-20 + SPL), with every write gated by per-token/per-spender/amount policy rules.**

---

## Phase 18 — DEX swaps + simulate-before-send middleware

**Outcome:** A swap plugin (Uniswap V3 on Sepolia / Jupiter on Solana devnet) adds `swap_quote` + gated `swap_execute`. A **`simulateMiddleware`** runs `eth_call`/`estimateGas` before any sensitive write tool, catching reverts and catching high slippage before the transaction is broadcast. This is the single highest-value DeFi safety pattern.

### Task 18.1: Simulate-before-send middleware

**Files:**

- Create: `packages/core/src/middleware/simulate.ts`
- Create: `packages/core/src/middleware/simulate.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/middleware/simulate.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { simulateMiddleware } from "./simulate.js";
import { z } from "zod";
import { defineTool } from "../tool.js";

const sensitiveTool = defineTool({
  name: "swap_execute",
  description: "",
  sensitive: true,
  parameters: z.object({}),
  execute: async () => "hash",
});
const readTool = defineTool({
  name: "swap_quote",
  description: "",
  parameters: z.object({}),
  execute: async () => "quote",
});

describe("simulateMiddleware", () => {
  it("calls simulate for sensitive tools and proceeds when simulation passes", async () => {
    const sim = vi.fn(async () => ({ success: true }));
    const mw = simulateMiddleware(sim);
    const next = vi.fn(async () => "executed");
    const out = await mw({ tool: sensitiveTool, args: {}, ctx: {} as never }, next);
    expect(sim).toHaveBeenCalledOnce();
    expect(out).toBe("executed");
  });

  it("throws before executing when simulation fails", async () => {
    const sim = vi.fn(async () => ({ success: false, reason: "would revert: insufficient funds" }));
    const mw = simulateMiddleware(sim);
    await expect(
      mw({ tool: sensitiveTool, args: {}, ctx: {} as never }, async () => "never"),
    ).rejects.toThrow(/simulation failed.*insufficient funds/i);
  });

  it("skips simulation for non-sensitive tools", async () => {
    const sim = vi.fn(async () => ({ success: true }));
    const mw = simulateMiddleware(sim);
    const next = vi.fn(async () => "ok");
    await mw({ tool: readTool, args: {}, ctx: {} as never }, next);
    expect(sim).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure, then write `packages/core/src/middleware/simulate.ts`**

Run: `pnpm vitest run packages/core/src/middleware/simulate.test.ts` → FAIL.

```ts
import type { ToolMiddleware, ToolCallCtx } from "../middleware.js";

export interface SimulateResult {
  success: boolean;
  reason?: string;
}
export type Simulator = (call: ToolCallCtx) => Promise<SimulateResult>;

/**
 * Runs a provider-supplied simulation before any sensitive tool call.
 * If the simulation reports failure, the tool is blocked and the error
 * is returned to the model as an observation — no gas spent, no reverts.
 */
export function simulateMiddleware(simulate: Simulator): ToolMiddleware {
  return async (call, next) => {
    if (!call.tool.sensitive) return next(call);
    const result = await simulate(call);
    if (!result.success) {
      throw new Error(`simulation failed: ${result.reason ?? "unknown reason"}`);
    }
    return next(call);
  };
}
```

Re-run → PASS (3 tests).

- [ ] **Step 3: Export + commit**

Add to `packages/core/src/index.ts`: `export * from "./middleware/simulate.js";`

```bash
git add -A
git commit -m "feat(core): simulate-before-send middleware (blocks reverts before broadcast)"
```

### Task 18.2: EVM swap plugin (Uniswap V3 on Sepolia)

**Files:**

- Create: `packages/plugins/swap-evm/package.json`
- Create: `packages/plugins/swap-evm/tsconfig.json`
- Create: `packages/plugins/swap-evm/src/index.ts`
- Create: `packages/plugins/swap-evm/src/index.test.ts`

- [ ] **Step 1: Write `packages/plugins/swap-evm/package.json`**

```json
{
  "name": "@thiny/plugin-swap-evm",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@thiny/core": "workspace:*",
    "@uniswap/v3-sdk": "^3.13.0",
    "@uniswap/sdk-core": "^5.3.0",
    "viem": "^2.17.0",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Write `packages/plugins/swap-evm/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/plugins/swap-evm/src/index.test.ts`** (fake quote — no RPC)

```ts
import { describe, it, expect } from "vitest";
import { evmSwapPlugin } from "./index.js";

const fakeQuoter = async (_tokenIn: string, _tokenOut: string, _amountIn: bigint) => ({
  amountOut: 990_000n,
  priceImpact: 0.1,
  fee: 3000,
});

describe("evmSwapPlugin", () => {
  it("swap_quote returns amountOut + priceImpact", async () => {
    const plugin = evmSwapPlugin({ quoter: fakeQuoter });
    const tool = plugin.tools!.find((t) => t.name === "swap_quote")!;
    const out = (await tool.execute(
      { tokenIn: "0xUsdc", tokenOut: "0xWeth", amountInWei: "1000000" },
      {} as never,
    )) as { amountOut: string; priceImpact: number };
    expect(out.amountOut).toBe("990000");
    expect(out.priceImpact).toBe(0.1);
  });
});
```

- [ ] **Step 4: Run to confirm failure, then write `packages/plugins/swap-evm/src/index.ts`**

Run: `pnpm vitest run packages/plugins/swap-evm/src/index.test.ts` → FAIL.

```ts
import { z } from "zod";
import { defineTool, type Plugin, type Hex } from "@thiny/core";

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((s) => s as Hex);

export type SwapQuoter = (
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  fee?: number,
) => Promise<{ amountOut: bigint; priceImpact: number; fee: number }>;

export type SwapExecutor = (
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  minAmountOut: bigint,
  recipient: string,
) => Promise<Hex>;

export interface EvmSwapOptions {
  quoter: SwapQuoter;
  executor?: SwapExecutor;
  maxSlippageBps?: number; // basis points, default 50 (0.5%)
}

export function evmSwapPlugin(opts: EvmSwapOptions): Plugin {
  const maxSlippageBps = opts.maxSlippageBps ?? 50;

  return {
    name: "swap-evm",
    tools: [
      defineTool({
        name: "swap_quote",
        description:
          "Get a Uniswap V3 swap quote: how many tokenOut for a given amountIn of tokenIn.",
        parameters: z.object({
          tokenIn: addressSchema,
          tokenOut: addressSchema,
          amountInWei: z.string().regex(/^\d+$/),
          feeTier: z.number().int().optional(),
        }),
        execute: async ({ tokenIn, tokenOut, amountInWei, feeTier }) => {
          const q = await opts.quoter(tokenIn, tokenOut, BigInt(amountInWei), feeTier);
          return {
            amountOut: q.amountOut.toString(),
            priceImpact: q.priceImpact,
            feeTier: q.fee,
            maxSlippageBps,
            minAmountOut: ((q.amountOut * BigInt(10_000 - maxSlippageBps)) / 10_000n).toString(),
          };
        },
      }),
      defineTool({
        name: "swap_execute",
        description:
          "Execute a token swap via Uniswap V3. Sensitive: requires policy approval. Always quote first.",
        sensitive: true,
        parameters: z.object({
          tokenIn: addressSchema,
          tokenOut: addressSchema,
          amountInWei: z.string().regex(/^\d+$/),
          minAmountOutWei: z.string().regex(/^\d+$/),
          recipient: addressSchema,
        }),
        execute: async ({ tokenIn, tokenOut, amountInWei, minAmountOutWei, recipient }, ctx) => {
          if (!opts.executor) throw new Error("no executor configured — call swap_quote first");
          if (!ctx.signer?.isTestnet)
            throw new Error("swap_execute only on testnet unless explicitly enabled");
          const hash = await opts.executor(
            tokenIn,
            tokenOut,
            BigInt(amountInWei),
            BigInt(minAmountOutWei),
            recipient,
          );
          return { hash };
        },
      }),
    ],
  };
}
```

Re-run → PASS (1 test).

### Task 18.3: Solana Jupiter swap plugin

**Files:**

- Create: `packages/plugins/swap-solana/package.json`
- Create: `packages/plugins/swap-solana/tsconfig.json`
- Create: `packages/plugins/swap-solana/src/index.ts`
- Create: `packages/plugins/swap-solana/src/index.test.ts`

- [ ] **Step 1: Write `packages/plugins/swap-solana/package.json`**

```json
{
  "name": "@thiny/plugin-swap-solana",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@thiny/core": "workspace:*",
    "@solana/web3.js": "^1.95.0",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Write `packages/plugins/swap-solana/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/plugins/swap-solana/src/index.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { solanaSwapPlugin } from "./index.js";

const fakeQuoter = async () => ({ outAmount: "990000", priceImpactPct: "0.05" });

describe("solanaSwapPlugin", () => {
  it("sol_swap_quote returns outAmount + priceImpact", async () => {
    const plugin = solanaSwapPlugin({ quoter: fakeQuoter });
    const tool = plugin.tools!.find((t) => t.name === "sol_swap_quote")!;
    const out = (await tool.execute(
      { inputMint: "So111", outputMint: "EPjFW", amountLamports: "1000000" },
      {} as never,
    )) as { outAmount: string; priceImpactPct: string };
    expect(out.outAmount).toBe("990000");
  });
});
```

- [ ] **Step 4: Write `packages/plugins/swap-solana/src/index.ts`**

```ts
import { z } from "zod";
import { defineTool, type Plugin } from "@thiny/core";

export type JupiterQuoter = (params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}) => Promise<{ outAmount: string; priceImpactPct: string; routePlan?: unknown }>;

export type JupiterExecutor = (quoteResponse: unknown, userPublicKey: string) => Promise<string>;

export interface SolanaSwapOptions {
  quoter: JupiterQuoter;
  executor?: JupiterExecutor;
  slippageBps?: number;
}

export function solanaSwapPlugin(opts: SolanaSwapOptions): Plugin {
  const slippageBps = opts.slippageBps ?? 50;
  return {
    name: "swap-solana",
    tools: [
      defineTool({
        name: "sol_swap_quote",
        description: "Get a Jupiter DEX swap quote on Solana: best route + output amount.",
        parameters: z.object({
          inputMint: z.string(),
          outputMint: z.string(),
          amountLamports: z.string().regex(/^\d+$/),
        }),
        execute: async ({ inputMint, outputMint, amountLamports }) => {
          return opts.quoter({ inputMint, outputMint, amount: amountLamports, slippageBps });
        },
      }),
      defineTool({
        name: "sol_swap_execute",
        description:
          "Execute a Jupiter swap on Solana devnet. Sensitive: requires policy approval. Always quote first.",
        sensitive: true,
        parameters: z.object({
          inputMint: z.string(),
          outputMint: z.string(),
          amountLamports: z.string().regex(/^\d+$/),
          userPublicKey: z.string(),
        }),
        execute: async ({ inputMint, outputMint, amountLamports, userPublicKey }, ctx) => {
          if (!opts.executor) throw new Error("no executor configured — call sol_swap_quote first");
          if (!ctx.signer?.isTestnet)
            throw new Error("sol_swap_execute only on devnet unless explicitly enabled");
          const quote = await opts.quoter({
            inputMint,
            outputMint,
            amount: amountLamports,
            slippageBps,
          });
          const sig = await opts.executor(quote, userPublicKey);
          return { signature: sig };
        },
      }),
    ],
  };
}
```

- [ ] **Step 5: Run all swap tests + commit**

Run: `pnpm install && pnpm vitest run packages/plugins/swap-evm packages/plugins/swap-solana` → PASS.

```bash
git add -A
git commit -m "feat(plugin): Uniswap V3 + Jupiter swap plugins with simulate-before-send"
```

**Phase 18 milestone: the agent can quote + execute swaps on both EVM and Solana, with every execution pre-simulated and policy-gated.**

---

## Phase 19 — Market data + portfolio tracking

**Outcome:** A `@thiny/plugin-market` provides price-feed tools (pulls _mainnet_ prices even when executing on testnet — correct for decision logic) and a lightweight portfolio/position tracker stored in the memory backend.

### Task 19.1: Price feed tool + position tracker

**Files:**

- Create: `packages/plugins/market/package.json`
- Create: `packages/plugins/market/tsconfig.json`
- Create: `packages/plugins/market/src/index.ts`
- Create: `packages/plugins/market/src/index.test.ts`

- [ ] **Step 1: Write `packages/plugins/market/package.json`**

```json
{
  "name": "@thiny/plugin-market",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Write `packages/plugins/market/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/plugins/market/src/index.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { marketPlugin } from "./index.js";

const fakeFetch = vi.fn(
  async () =>
    new Response(JSON.stringify({ ethereum: { usd: 3200.5 }, solana: { usd: 145.2 } }), {
      status: 200,
    }),
);

describe("marketPlugin", () => {
  it("market_price returns prices for requested tokens", async () => {
    const plugin = marketPlugin({ fetchImpl: fakeFetch as never });
    const priceTool = plugin.tools!.find((t) => t.name === "market_price")!;
    const out = (await priceTool.execute(
      { ids: ["ethereum", "solana"], currency: "usd" },
      {} as never,
    )) as {
      prices: Record<string, number>;
    };
    expect(out.prices["ethereum"]).toBe(3200.5);
    expect(out.prices["solana"]).toBe(145.2);
  });

  it("portfolio_update and portfolio_get round-trip through ctx.state", async () => {
    const plugin = marketPlugin({ fetchImpl: fakeFetch as never });
    const update = plugin.tools!.find((t) => t.name === "portfolio_update")!;
    const get = plugin.tools!.find((t) => t.name === "portfolio_get")!;
    const state = new Map<string, unknown>();
    const ctx = { state } as never;
    await update.execute({ token: "ETH", amount: "1.5", avgCostUsd: "3000" }, ctx);
    const out = (await get.execute({}, ctx)) as { positions: unknown[] };
    expect(out.positions).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run to confirm failure, then write `packages/plugins/market/src/index.ts`**

Run: `pnpm vitest run packages/plugins/market/src/index.test.ts` → FAIL.

```ts
import { z } from "zod";
import { defineTool, type Plugin } from "@thiny/core";

interface Position {
  token: string;
  amount: string;
  avgCostUsd: string;
  updatedAt: string;
}

export interface MarketOptions {
  fetchImpl?: typeof fetch;
  /** CoinGecko-compatible API base URL. */
  apiBase?: string;
}

export function marketPlugin(opts: MarketOptions = {}): Plugin {
  const doFetch = opts.fetchImpl ?? fetch;
  const apiBase = opts.apiBase ?? "https://api.coingecko.com/api/v3";
  const POSITIONS_KEY = "portfolio:positions";

  return {
    name: "market",
    tools: [
      defineTool({
        name: "market_price",
        description:
          "Get current USD prices for one or more tokens by CoinGecko id (e.g. 'ethereum', 'solana', 'usd-coin').",
        parameters: z.object({
          ids: z.array(z.string()).min(1).max(10),
          currency: z.string().default("usd"),
        }),
        execute: async ({ ids, currency }) => {
          const url = `${apiBase}/simple/price?ids=${ids.join(",")}&vs_currencies=${currency}`;
          const res = await doFetch(url);
          if (!res.ok) throw new Error(`market_price failed: ${res.status}`);
          const data = (await res.json()) as Record<string, Record<string, number>>;
          const prices: Record<string, number> = {};
          for (const id of ids) prices[id] = data[id]?.[currency] ?? 0;
          return { prices, currency, fetchedAt: new Date().toISOString() };
        },
      }),
      defineTool({
        name: "portfolio_update",
        description: "Record a position in the portfolio tracker (in-memory, per-run).",
        parameters: z.object({
          token: z.string(),
          amount: z.string(),
          avgCostUsd: z.string(),
        }),
        execute: async ({ token, amount, avgCostUsd }, ctx) => {
          const positions = (ctx.state.get(POSITIONS_KEY) as Position[] | undefined) ?? [];
          const idx = positions.findIndex((p) => p.token === token);
          const entry: Position = {
            token,
            amount,
            avgCostUsd,
            updatedAt: new Date().toISOString(),
          };
          if (idx >= 0) positions[idx] = entry;
          else positions.push(entry);
          ctx.state.set(POSITIONS_KEY, positions);
          return { ok: true, position: entry };
        },
      }),
      defineTool({
        name: "portfolio_get",
        description: "Return the current portfolio snapshot.",
        parameters: z.object({}),
        execute: async (_args, ctx) => ({
          positions: (ctx.state.get(POSITIONS_KEY) as Position[] | undefined) ?? [],
        }),
      }),
    ],
  };
}
```

- [ ] **Step 5: Run + commit**

Run: `pnpm install && pnpm vitest run packages/plugins/market` → PASS (2 tests).

```bash
git add -A
git commit -m "feat(plugin): market price feed + in-memory portfolio tracker"
```

**Phase 19 milestone: the agent knows current token prices and tracks its own positions.**

---

## Phase 20 — Trading strategy runtime + policy rules + paper-trading mode

**Outcome:** A worked strategy example wired to the autonomous runtime (heartbeat → fetch price → decide → policy-gated swap), **trading-specific policy rules** (position-size cap, slippage ceiling, asset allowlist), and a **paper-trading mode** that dry-runs the agent against scripted market scenarios using the eval harness. After this phase, typing `pnpm trading-agent` runs a testnet DeFi agent.

### Task 20.1: Trading policy rules

**Files:**

- Create: `packages/plugins/trading-policy/package.json`
- Create: `packages/plugins/trading-policy/tsconfig.json`
- Create: `packages/plugins/trading-policy/src/index.ts`
- Create: `packages/plugins/trading-policy/src/index.test.ts`

- [ ] **Step 1: Write `packages/plugins/trading-policy/package.json`**

```json
{
  "name": "@thiny/plugin-trading-policy",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@thiny/core": "workspace:*", "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Write `packages/plugins/trading-policy/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src/**/*"],
  "references": [{ "path": "../../core" }]
}
```

- [ ] **Step 3: Write the failing test `packages/plugins/trading-policy/src/index.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { tradingPolicyRules } from "./index.js";
import { defineTool, type Ctx } from "@thiny/core";

const swapTool = defineTool({
  name: "swap_execute",
  description: "",
  sensitive: true,
  parameters: z.object({
    tokenIn: z.string(),
    tokenOut: z.string(),
    amountInWei: z.string(),
    minAmountOutWei: z.string(),
    recipient: z.string(),
  }),
  execute: async () => "hash",
});
const ctx = {} as Ctx;
const rules = tradingPolicyRules({
  allowedAssets: ["0xUsdc", "0xWeth"],
  maxPositionSizeWei: 1_000_000_000n,
  maxSlippageBps: 100,
});

describe("tradingPolicyRules", () => {
  it("denies swap for non-allowlisted asset", () => {
    const d = rules[0]!({
      tool: swapTool,
      args: {
        tokenIn: "0xShitcoin",
        tokenOut: "0xUsdc",
        amountInWei: "100",
        minAmountOutWei: "99",
        recipient: "0xMe",
      },
      ctx,
    });
    expect(d).toEqual({ effect: "deny", reason: expect.stringMatching(/not in allowed assets/i) });
  });

  it("denies swap exceeding position size cap", () => {
    const d = rules[0]!({
      tool: swapTool,
      args: {
        tokenIn: "0xUsdc",
        tokenOut: "0xWeth",
        amountInWei: "9999999999",
        minAmountOutWei: "99",
        recipient: "0xMe",
      },
      ctx,
    });
    expect(d).toEqual({ effect: "deny", reason: expect.stringMatching(/position size/i) });
  });

  it("denies swap with slippage above ceiling", () => {
    // minAmountOut is only 50% of amountIn — well above 100bps slippage ceiling
    const d = rules[0]!({
      tool: swapTool,
      args: {
        tokenIn: "0xUsdc",
        tokenOut: "0xWeth",
        amountInWei: "1000000",
        minAmountOutWei: "500000",
        recipient: "0xMe",
      },
      ctx,
    });
    expect(d).toEqual({ effect: "deny", reason: expect.stringMatching(/slippage/i) });
  });

  it("approves in-policy swap", () => {
    const d = rules[0]!({
      tool: swapTool,
      args: {
        tokenIn: "0xUsdc",
        tokenOut: "0xWeth",
        amountInWei: "1000000",
        minAmountOutWei: "990000",
        recipient: "0xMe",
      },
      ctx,
    });
    expect(d).toEqual({ effect: "approve", reason: expect.any(String) });
  });
});
```

- [ ] **Step 4: Run to confirm failure, then write `packages/plugins/trading-policy/src/index.ts`**

Run: `pnpm vitest run packages/plugins/trading-policy` → FAIL.

```ts
import type { PolicyRule } from "@thiny/core";

export interface TradingPolicyOptions {
  allowedAssets: string[];
  maxPositionSizeWei: bigint;
  /** Max slippage in basis points, e.g. 100 = 1% */
  maxSlippageBps: number;
}

const SWAP_TOOLS = new Set(["swap_execute", "sol_swap_execute"]);

export function tradingPolicyRules(opts: TradingPolicyOptions): PolicyRule[] {
  const assets = new Set(opts.allowedAssets.map((a) => a.toLowerCase()));
  return [
    (call) => {
      if (!SWAP_TOOLS.has(call.tool.name)) return null;
      const args = call.args as {
        tokenIn: string;
        tokenOut: string;
        amountInWei: string;
        minAmountOutWei: string;
      };
      if (!assets.has(args.tokenIn.toLowerCase())) {
        return { effect: "deny", reason: `${args.tokenIn} not in allowed assets list` };
      }
      if (!assets.has(args.tokenOut.toLowerCase())) {
        return { effect: "deny", reason: `${args.tokenOut} not in allowed assets list` };
      }
      const amountIn = BigInt(args.amountInWei);
      if (amountIn > opts.maxPositionSizeWei) {
        return {
          effect: "deny",
          reason: `position size ${amountIn} exceeds cap ${opts.maxPositionSizeWei}`,
        };
      }
      const minOut = BigInt(args.minAmountOutWei);
      const impliedSlippageBps = Number(((amountIn - minOut) * 10_000n) / amountIn);
      if (impliedSlippageBps > opts.maxSlippageBps) {
        return {
          effect: "deny",
          reason: `implied slippage ${impliedSlippageBps}bps exceeds ceiling ${opts.maxSlippageBps}bps`,
        };
      }
      return {
        effect: "approve",
        reason: `swap ${amountIn} ${args.tokenIn} → ${args.tokenOut}, slippage ${impliedSlippageBps}bps`,
      };
    },
  ];
}
```

Re-run → PASS (4 tests).

```bash
git add -A
git commit -m "feat(plugin): trading policy rules (asset allowlist, position size cap, slippage ceiling)"
```

### Task 20.2: Paper-trading mode + worked strategy example

**Files:**

- Create: `heads/trading-agent/package.json`
- Create: `heads/trading-agent/tsconfig.json`
- Create: `heads/trading-agent/src/strategy.ts`
- Create: `heads/trading-agent/src/paper.test.ts`
- Create: `heads/trading-agent/src/main.ts`

- [ ] **Step 1: Write `heads/trading-agent/package.json`**

```json
{
  "name": "@thiny/trading-agent",
  "version": "0.0.0",
  "type": "module",
  "dependencies": {
    "@thiny/core": "workspace:*",
    "@thiny/model-aisdk": "workspace:*",
    "@thiny/plugin-market": "workspace:*",
    "@thiny/plugin-swap-evm": "workspace:*",
    "@thiny/plugin-trading-policy": "workspace:*",
    "@thiny/runtime": "workspace:*",
    "@thiny/eval": "workspace:*"
  }
}
```

- [ ] **Step 2: Write `heads/trading-agent/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `heads/trading-agent/src/strategy.ts`** (the system prompt + heartbeat input — the strategy lives in language)

```ts
export const SYSTEM_PROMPT = `
You are an autonomous DeFi trading agent running on Ethereum Sepolia testnet.
On each heartbeat:
1. Call market_price to get current ETH and USDC prices.
2. Call portfolio_get to review current positions.
3. Decide whether to swap based on your strategy (simple momentum: if ETH > target, hold; if ETH dropped > 2% since last check, buy more).
4. If you decide to swap: call swap_quote FIRST, check priceImpact is < 0.5%, then call swap_execute.
5. Call portfolio_update to record any executed trade.
6. If no action needed, reply with a brief status update ending with DONE.

Rules you MUST follow:
- Never swap without quoting first.
- Never approve unlimited token amounts.
- If swap_execute is rejected by policy, log the rejection and stop — do not retry with different parameters.
- If simulation fails, report the reason and stop.
`.trim();

export const HEARTBEAT_INPUT =
  "Trading heartbeat: evaluate market conditions and execute strategy if warranted.";
```

- [ ] **Step 4: Write the failing paper-trade test `heads/trading-agent/src/paper.test.ts`** (fully offline — scripted model + fake market)

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createAgent, defineTool, autoApprover } from "@thiny/core";
import { runEval, scriptModel } from "@thiny/eval";
import { SYSTEM_PROMPT, HEARTBEAT_INPUT } from "./strategy.js";

// Fake market: ETH at $3200, no existing positions.
const fakePriceTool = defineTool({
  name: "market_price",
  description: "",
  parameters: z.object({ ids: z.array(z.string()), currency: z.string() }),
  execute: async () => ({ prices: { ethereum: 3200, "usd-coin": 1 }, currency: "usd" }),
});
const fakePortfolioGet = defineTool({
  name: "portfolio_get",
  description: "",
  parameters: z.object({}),
  execute: async () => ({ positions: [] }),
});
const fakePortfolioUpdate = defineTool({
  name: "portfolio_update",
  description: "",
  parameters: z.object({ token: z.string(), amount: z.string(), avgCostUsd: z.string() }),
  execute: async () => ({ ok: true }),
});
const fakeSwapQuote = defineTool({
  name: "swap_quote",
  description: "",
  parameters: z.object({ tokenIn: z.string(), tokenOut: z.string(), amountInWei: z.string() }),
  execute: async () => ({
    amountOut: "990000000000000000",
    priceImpact: 0.1,
    feeTier: 3000,
    maxSlippageBps: 50,
    minAmountOut: "985000000000000000",
  }),
});
const fakeSwapExecute = defineTool({
  name: "swap_execute",
  description: "",
  sensitive: true,
  parameters: z.object({
    tokenIn: z.string(),
    tokenOut: z.string(),
    amountInWei: z.string(),
    minAmountOutWei: z.string(),
    recipient: z.string(),
  }),
  execute: async () => ({ hash: "0xfakehash" }),
});

describe("paper trading — strategy correctness", () => {
  it("agent checks price + portfolio before deciding to act", async () => {
    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "1",
              name: "market_price",
              args: { ids: ["ethereum", "usd-coin"], currency: "usd" },
            },
            { id: "2", name: "portfolio_get", args: {} },
          ],
        },
        { finishReason: "stop", text: "No action needed. ETH stable. DONE" },
      ]),
      systemPrompt: SYSTEM_PROMPT,
      tools: [fakePriceTool, fakePortfolioGet, fakePortfolioUpdate, fakeSwapQuote, fakeSwapExecute],
      approver: autoApprover(["swap_execute"]),
    });

    const results = await runEval(agent, [
      {
        name: "heartbeat-no-action",
        input: HEARTBEAT_INPUT,
        expectToolCalls: ["market_price", "portfolio_get"],
        expectFinal: /DONE/,
      },
    ]);
    expect(results[0]!.passed).toBe(true);
  });

  it("agent quotes before executing a swap", async () => {
    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "1",
              name: "market_price",
              args: { ids: ["ethereum", "usd-coin"], currency: "usd" },
            },
          ],
        },
        {
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "2",
              name: "swap_quote",
              args: { tokenIn: "0xUsdc", tokenOut: "0xWeth", amountInWei: "100000000" },
            },
          ],
        },
        {
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "3",
              name: "swap_execute",
              args: {
                tokenIn: "0xUsdc",
                tokenOut: "0xWeth",
                amountInWei: "100000000",
                minAmountOutWei: "985000000000000000",
                recipient: "0xMe",
              },
            },
          ],
        },
        {
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "4",
              name: "portfolio_update",
              args: { token: "ETH", amount: "0.99", avgCostUsd: "3200" },
            },
          ],
        },
        { finishReason: "stop", text: "Swapped 100 USDC for ~0.99 ETH. DONE" },
      ]),
      systemPrompt: SYSTEM_PROMPT,
      tools: [fakePriceTool, fakePortfolioGet, fakePortfolioUpdate, fakeSwapQuote, fakeSwapExecute],
      approver: autoApprover(["swap_execute"]),
    });

    const results = await runEval(agent, [
      {
        name: "heartbeat-with-swap",
        input: HEARTBEAT_INPUT,
        expectToolCalls: ["market_price", "swap_quote", "swap_execute", "portfolio_update"],
        expectFinal: /DONE/,
      },
    ]);
    expect(results[0]!.passed).toBe(true);
  });
});
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm install && pnpm vitest run heads/trading-agent/src/paper.test.ts`
Expected: PASS (2 tests). If they fail, the strategy prompt or script model is misaligned — adjust the scripted steps to match the expected tool-call order.

- [ ] **Step 6: Write the live agent entry `heads/trading-agent/src/main.ts`**

```ts
import {
  createAgent,
  autoApprover,
  policyMiddleware,
  modelAudit,
  toolAudit,
  budgetMiddleware,
} from "@thiny/core";
import { aiSdkModel } from "@thiny/model-aisdk";
import { pinoLogger } from "@thiny/logger-pino";
import { sqliteMemory } from "@thiny/memory-sqlite";
import { marketPlugin } from "@thiny/plugin-market";
import { evmSwapPlugin } from "@thiny/plugin-swap-evm";
import { tradingPolicyRules } from "@thiny/plugin-trading-policy";
import { Runtime } from "@thiny/runtime";
import { SYSTEM_PROMPT, HEARTBEAT_INPUT } from "./strategy.js";

async function main() {
  const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info", file: "trading-agent.log" });

  // Wire in your own quoter/executor implementations connecting to Sepolia Uniswap V3.
  // For testnet: use a public RPC + a funded Sepolia wallet.
  const quoter = async () => {
    throw new Error("configure quoter for your RPC");
  };
  const executor = async () => {
    throw new Error("configure executor for your wallet");
  };

  const agent = await createAgent({
    model: aiSdkModel({ model: process.env.AGENT_MODEL ?? "openai:gpt-4o-mini" }),
    systemPrompt: SYSTEM_PROMPT,
    logger,
    memory: await sqliteMemory({ url: "file:trading-agent.sqlite" }),
    approver: autoApprover(["swap_execute"]), // headless: auto-approve swaps that pass policy
    plugins: [
      {
        name: "safety",
        modelMiddleware: [
          modelAudit(logger),
          budgetMiddleware({ maxCalls: 10, maxTokens: 50_000 }),
        ],
        toolMiddleware: [
          toolAudit(logger),
          policyMiddleware(
            tradingPolicyRules({
              allowedAssets: (process.env.ALLOWED_ASSETS ?? "").split(",").filter(Boolean),
              maxPositionSizeWei: BigInt(process.env.MAX_POSITION_WEI ?? "100000000"), // 100 USDC (6 dec)
              maxSlippageBps: Number(process.env.MAX_SLIPPAGE_BPS ?? "100"),
            }),
          ),
        ],
      },
      marketPlugin(),
      evmSwapPlugin({ quoter, executor }),
    ],
  });

  const runtime = new Runtime({
    agent,
    logger,
    jobs: [
      {
        name: "strategy-heartbeat",
        trigger: { kind: "interval", ms: Number(process.env.HEARTBEAT_MS ?? "60000") },
        input: HEARTBEAT_INPUT,
        maxRuns: Number(process.env.MAX_RUNS ?? "100"),
      },
    ],
  });

  runtime.start();
  logger.info({}, "trading agent running — ctrl+c to stop");
  process.on("SIGINT", async () => {
    await runtime.stop();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await runtime.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 7: Add a root script + update `.env.example`**

Add to root `package.json` scripts: `"trading-agent": "node --env-file=.env --import tsx heads/trading-agent/src/main.ts"`.

Append to `.env.example`:

```
# Trading agent (testnet/devnet only)
HEARTBEAT_MS=60000
MAX_RUNS=100
ALLOWED_ASSETS=0xYourUsdc,0xYourWeth   # Sepolia token addresses
MAX_POSITION_WEI=100000000             # 100 USDC (6 decimals)
MAX_SLIPPAGE_BPS=100                   # 1%
```

- [ ] **Step 8: Paper-trade first, then run on testnet**

First gate — run paper trades to validate strategy logic:

```bash
pnpm vitest run heads/trading-agent/src/paper.test.ts
```

Expected: PASS.

Second gate — run live on testnet (configure your quoter/executor + `.env` first):

```bash
pnpm trading-agent
```

Expected: on each heartbeat tick the agent calls `market_price` → decides → optionally calls `swap_quote` + `swap_execute` (policy-gated) → updates portfolio. Every decision is logged to `trading-agent.log`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(trading): paper-trade tests + testnet DeFi strategy agent with heartbeat runtime"
```

**Phase 20 milestone: a testnet DeFi trading agent runs autonomously on a heartbeat, gated by asset-allowlist + position-size + slippage policy rules, paper-tested before live execution.**

---

## Self-review (run before declaring done)

- [ ] **Spec coverage:** every locked decision maps to a phase — microkernel/ports (P1), hand-built loop + AI SDK only behind model port (P1.7), plugin system (P2), middleware/onion (P3), audit+budget+circuit breaker (P3, plus MaxStepsError in P1.5), memory + compaction (P4), web3 read + signer port (P5), policy engine + approval + testnet sign + mainnet guard (P5.2/P6), scaffolder (P7), streaming via optional stream port + onToken reusing middleware (P8), autonomous interval/cron runtime + headless approvers + autonomy safety model (P9), plugin guide (Part B).
- [ ] **Streaming safety invariant:** confirm the streaming base in `agent.run` sits _inside_ `composeModel(...)` (so budget/audit/compaction still wrap it) and that tools are still executed through the composed tool middleware (so policy/approval still apply). Streaming must change delivery only, never the gates.
- [ ] **Extension coverage (P10–P16):** MCP adapter registers external tools through the same registry/policy path (P10); HTTP head reuses `onToken` streaming, no new model path (P11); eval harness uses `agent.events` + `EventBus.off`, both added in P12; Solana send is `sensitive` + gated by `solanaTransferRules` exactly like EVM (P13); knowledge retrieval is model middleware + a tool, embedder injected (P14); `ctx.spawn` shares model/events/logger but isolates tools + memory (P15); resilience middlewares compose on the tool seam and `runStructured` validates final JSON (P16).
- [ ] **Type consistency (new):** `Agent` now carries `events: EventBus` (update all test fakes); `Ctx.spawn?: Spawn`; `ToolCallCtx` shape matches resilience middleware usage; `Embedder` signature matches `aiSdkEmbedder`. Re-run `pnpm -r exec tsc --noEmit`.
- [ ] **Trading/DeFi coverage (P17–P20):** ERC-20 + SPL token tools all `sensitive` for writes, capped by `erc20TokenRules` (P17); `simulateMiddleware` blocks before any sensitive tool, isolated unit-tested (P18); Uniswap V3 + Jupiter swap plugins inject quoter/executor — no live RPC in unit tests (P18); `marketPlugin` uses injected `fetch` (P19); `tradingPolicyRules` enforces asset-allowlist + position-size + slippage ceiling deterministically (P20); paper-trade eval tests pass before any live testnet run (P20). Trading safety invariant: **quote before execute, simulate before broadcast, policy before approval, paper-test before testnet.**
- [ ] **Prompt-injection boundary:** enforced two ways — Zod-validate-at-the-boundary in the loop/tool middleware, and the rule that `policyMiddleware` decisions are computed from tool def + parsed args only, never from model/free text. Confirm no rule reads `text`/message content.
- [ ] **Type consistency:** `Message` tool variant carries `toolName` (used by the AI SDK converter and SQLite round-trip). `ModelResponse.usage` is `{ inputTokens, outputTokens }` everywhere (budget + adapter map). `Signer.signAndSend` signature matches the evm send tool's call site. `Hex` type is shared from `@thiny/core`.
- [ ] **No placeholders:** every code step contains real code; every run step has an expected result.
- [ ] **Full typecheck + test gate:** `pnpm -r exec tsc --noEmit && pnpm test` is green.

---

# PART B — PLUGIN DEVELOPMENT GUIDE & ARCHITECTURE

This is the reference a future-you (or a teammate) reads to extend the kernel without touching it. Keep it in the repo as `docs/PLUGINS.md`.

## B.1 — The mental model

The kernel is a **microkernel**: it provides _mechanism_ (a loop, a registry, a composer, ports) and zero _policy_ about what your agent can do. **Plugins provide capability.** The dependency arrow only ever points inward: plugins import `@thiny/core`; the core never imports a plugin. That single rule is why the same core serves a Web2 and a Web3 agent unchanged.

```
        your hackathon agent
                 │ composes
   ┌─────────────┼───────────────┐
 plugins     middleware        adapters
   │             │                │   all depend on ↓
   └─────────► @thiny/core ◄──────┘   (never the reverse)
```

## B.2 — The five extension points

A plugin is a plain object implementing `Plugin` (see `packages/core/src/plugin.ts`). Every field is optional; use only what you need.

| Field             | Purpose                               | When to use                                         |
| ----------------- | ------------------------------------- | --------------------------------------------------- |
| `tools`           | Add callable capabilities             | 90% of plugins. The main event.                     |
| `modelMiddleware` | Wrap every LLM call                   | Caching, cost tracking, compaction, prompt shaping  |
| `toolMiddleware`  | Wrap every tool execution             | Policy, approval, audit, rate-limiting, idempotency |
| `memory`          | Replace the conversation store        | Swap RAM → SQLite → vector DB                       |
| `setup(ctx)`      | Initialise after all plugins register | Open connections, read config, find sibling tools   |

**Smallest possible plugin:**

```ts
import { z } from "zod";
import { defineTool, type Plugin } from "@thiny/core";

export const clockPlugin: Plugin = {
  name: "clock",
  tools: [
    defineTool({
      name: "now",
      description: "Return the current ISO timestamp.",
      parameters: z.object({}),
      execute: async () => ({ iso: new Date().toISOString() }),
    }),
  ],
};
```

## B.3 — Anatomy of a tool

```ts
defineTool({
  name: "evm_get_balance", // unique, snake_case, namespaced by domain (evm_, web_)
  description: "Get the native ...", // the LLM reads THIS to decide when/how to call. Write it well.
  parameters: z.object({
    // Zod = runtime validation + the JSON schema the model sees
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  }),
  sensitive: false, // true → policy defaults to "approve" (money/destructive)
  tags: ["evm", "read"], // optional, for filtering/policy
  execute: async (args, ctx) => {
    // args is already validated & typed
    // ctx gives you: model, memory, tools, events, logger, state, signer?, approver?
    return {
      /* JSON-serialisable result */
    };
  },
});
```

**Tool authoring rules (learned the hard way):**

1. **Description is a prompt.** The model decides whether to call your tool from the description alone. State _what it does, when to use it, and the shape of the result._
2. **Validate everything in `parameters`.** The args come from an LLM — treat them as hostile input. Use `.regex`, `.min`, `.max`, `.enum`. The kernel parses with Zod _before_ `execute` runs.
3. **Return JSON-serialisable data.** No `BigInt`, no class instances, no `Date` objects raw — stringify them (`value.toString()`, `date.toISOString()`). The result is `JSON.stringify`-d back into the conversation.
4. **Throw on failure — don't return error strings.** The loop catches throws and feeds `ERROR: <message>` back to the model as an observation, which lets it recover. A clear `throw new Error("rate limited, retry in 5s")` is better than a silent `{ ok: false }`.
5. **Mark money/destructive tools `sensitive: true`.** This makes the policy engine default to requiring approval. Never rely on the prompt to keep the model from doing something dangerous.
6. **Keep tools idempotent or idempotency-keyed** if they cause side effects, because the model may retry.

## B.4 — The lifecycle (two phases)

Loading happens in `loadPlugins` (`packages/core/src/plugin.ts`):

1. **Register** — all plugins' `tools`/`middleware`/`memory` are collected. After this phase the registry is complete.
2. **Setup** — each plugin's `setup(ctx)` runs. Because it runs _after_ registration, your plugin can look up tools or services another plugin contributed:

```ts
export const dexPlugin: Plugin = {
  name: "dex",
  tools: [
    /* swap tool that needs evm */
  ],
  async setup(ctx) {
    // safe: the evm plugin already registered in phase 1
    ctx.tools.get("evm_read_contract");
    ctx.logger.info({ plugin: "dex" }, "ready");
  },
};
```

This two-phase split is how you handle **inter-plugin dependencies** without an ordering nightmare.

## B.5 — Accessing shared services via `ctx`

Inside `execute(args, ctx)` and `setup(ctx)` you get the `Ctx` (`packages/core/src/context.ts`):

- `ctx.logger` — structured logging; prefer this over `console`.
- `ctx.state` — a per-run `Map` for passing data between tools/middleware in one run.
- `ctx.signer` — present only if a signer is configured. Always null-check; throw a clear error if absent.
- `ctx.memory` / `ctx.model` / `ctx.tools` — call other parts of the system (e.g. a tool that spawns a sub-query).
- `ctx.approver` — usually you don't call this directly; the policy middleware does.

## B.6 — Writing middleware plugins

Two seams, two signatures. Compose order is **outside-in** (first in the array wraps everything).

**Model middleware** wraps `model.generate` — use for anything about the _LLM call_:

```ts
import type { ModelMiddleware } from "@thiny/core";

export const cacheMiddleware = (): ModelMiddleware => {
  const cache = new Map<string, unknown>();
  return async (req, next) => {
    const key = JSON.stringify(req.messages);
    if (cache.has(key)) return cache.get(key) as never;
    const res = await next(req);
    cache.set(key, res);
    return res;
  };
};
```

**Tool middleware** wraps tool execution — use for _authorization, audit, rate-limits_:

```ts
import type { ToolMiddleware } from "@thiny/core";

export const rateLimit = (perMinute: number): ToolMiddleware => {
  const hits: number[] = [];
  return async (call, next) => {
    const now = Date.now();
    while (hits.length && now - hits[0]! > 60_000) hits.shift();
    if (hits.length >= perMinute) throw new Error(`rate limit: ${call.tool.name}`);
    hits.push(now);
    return next(call);
  };
};
```

**To short-circuit (deny), throw** before calling `next`. The loop converts the throw into an observation; the agent sees it and adapts.

## B.7 — The security contract (non-negotiable for on-chain plugins)

The kernel treats the LLM as an **untrusted planner**. Your plugin must uphold this:

1. **Sensitive tools declare it.** `sensitive: true` on anything that moves value or is destructive.
2. **Policy is deterministic.** Write `PolicyRule`s (see `evmTransferRules`) that decide from _parsed args only_. **Never** let a policy decision depend on free-text or model output — that's the prompt-injection hole.
3. **Validate at the schema.** Address regexes, value bounds, enum-restricted actions. The Zod schema is your first firewall.
4. **Caps + allowlists live in the policy, not the prompt.** "Please don't send more than X" in a system prompt is not a control; a `maxValueWei` rule is.
5. **Mainnet is opt-in.** The signer adapter refuses mainnet unless `allowMainnet: true`; for real funds prefer a policy-controlled custodial wallet (e.g. Circle agent wallet) over a raw private key.
6. **Treat tool outputs as untrusted too.** A web page or token's on-chain metadata can contain injected instructions. Don't let a tool's _result_ auto-trigger a sensitive action without going back through policy.

## B.8 — Testing a plugin

Tools are pure functions of `(args, ctx)` — test them directly, inject fakes for I/O (see every `*.test.ts` in Part A):

```ts
import { describe, it, expect, vi } from "vitest";
import { myPlugin } from "./index.js";

it("does the thing", async () => {
  const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
  const tool = myPlugin({ fetchImpl }).tools![0]!;
  const out = await tool.execute({ q: "x" }, {} as never);
  expect(out).toMatchObject({
    /* ... */
  });
});
```

Test policy rules separately (deny/approve/abstain branches). Never hit a real network or real RPC in unit tests; inject the client.

## B.9 — Packaging & distribution

- **In the monorepo:** create `packages/plugins/<name>/` mirroring `web-search` (package.json with `@thiny/<name>`, tsconfig referencing core, `src/index.ts` exporting a `Plugin` factory). Add it to a head/agent's `plugins` array.
- **As a standalone npm package:** publish with `@thiny/core` as a **peerDependency** (so the consumer's kernel version wins), build with `tsc` to `dist/`, point `exports` at `dist/index.js`, ship types. Keep the runtime footprint tiny — a plugin should pull in only its own domain deps (viem, an SDK), never the whole world.
- **Naming convention:** `@thiny/plugin-<domain>` for tool plugins, `@thiny/<thing>` for adapters (model/memory/signer/logger).

## B.10 — Plugin design checklist

- [ ] One plugin = one coherent domain (don't bundle unrelated tools).
- [ ] Tool names namespaced (`evm_`, `web_`, `dex_`).
- [ ] Descriptions written for the model, not for humans.
- [ ] All inputs Zod-validated; outputs JSON-serialisable.
- [ ] Failure paths `throw` with actionable messages.
- [ ] Money/destructive tools `sensitive: true` + a deterministic policy rule.
- [ ] I/O injectable for tests; unit tests cover happy + error + policy branches.
- [ ] No import of other plugins; depend only on `@thiny/core` (+ your domain deps).
- [ ] `setup` used only for init that needs the full registry/services.

---

## Appendix — Final directory tree

```
thiny/
├── package.json                 pnpm-workspace.yaml  tsconfig.base.json  tsconfig.json  vitest.config.ts
├── .env.example  .gitignore  .npmrc
├── packages/
│   ├── core/                    @thiny/core — domain, ports, loop, registry, plugin, middleware, compose, errors, agent
│   │   └── src/
│   │       ├── domain/messages.ts  domain/web3.ts  domain/stream.ts
│   │       ├── tool.ts  ports.ts  signer.ts  events.ts  context.ts  registry.ts  errors.ts
│   │       ├── loop.ts  plugin.ts  middleware.ts  compose.ts  stream.ts  approvers.ts  spawn.ts  agent.ts  index.ts
│   │       └── middleware/audit.ts  budget.ts  compaction.ts  policy.ts
│   ├── adapters/
│   │   ├── model-aisdk/         @thiny/model-aisdk  (Vercel AI SDK behind ModelProvider; + aiSdkEmbedder)
│   │   ├── memory-sqlite/       @thiny/memory-sqlite (libsql)
│   │   ├── signer-viem/         @thiny/signer-viem  (testnet + mainnet guard)
│   │   ├── logger-pino/         @thiny/logger-pino
│   │   └── mcp/                 @thiny/mcp  (consume any MCP server as tools)
│   ├── plugins/
│   │   ├── web-search/          @thiny/plugin-web-search  (Web2 proof)
│   │   ├── evm/                 @thiny/plugin-evm  (read tools + send + transfer rules)
│   │   ├── solana/              @thiny/plugin-solana  (read + gated devnet send + rules)
│   │   ├── knowledge/           @thiny/plugin-knowledge  (RAG: store + retrieval mw + search tool)
│   │   ├── resilience/          @thiny/plugin-resilience  (retry/timeout/rate-limit/cache/idempotency + runStructured)
│   │   ├── tokens/              @thiny/plugin-tokens  (ERC-20 + SPL balance/approve/transfer + cap rules)
│   │   ├── swap-evm/            @thiny/plugin-swap-evm  (Uniswap V3 quote + gated execute)
│   │   ├── swap-solana/         @thiny/plugin-swap-solana  (Jupiter quote + gated execute)
│   │   ├── market/              @thiny/plugin-market  (price feed + portfolio tracker)
│   │   └── trading-policy/      @thiny/plugin-trading-policy  (asset allowlist, position-size cap, slippage ceiling)
│   ├── runtime/                 @thiny/runtime  (autonomous scheduler: interval + cron jobs)
│   └── eval/                    @thiny/eval  (scenario eval runner + script model)
├── heads/
│   ├── cli/                     @thiny/cli  (terminal head + approver + streaming)
│   ├── http/                    @thiny/http  (SSE server + one-file web chat UI)
│   ├── daemon/                  @thiny/daemon  (headless always-on runtime + auto-approver)
│   └── trading-agent/           @thiny/trading-agent  (testnet DeFi agent + paper-trade tests)
└── apps/
    └── create-thiny/            create-thiny  (scaffolder)
```

**Build order recap:** P0 scaffold → P1 skeleton (runs) → P2 plugins → P3 middleware → P4 memory → P5 web3 read → P6 policy+sign → P7 scaffolder → P8 streaming → P9 autonomous runtime → P10 MCP adapter → P11 HTTP head + web UI → P12 eval harness → P13 Solana → P14 RAG/knowledge → P15 sub-agents → P16 resilience + structured output → P17 token ops (ERC-20+SPL) → P18 DEX swaps + simulate-before-send → P19 market data + portfolio → P20 trading strategy + paper-trading. Each phase leaves a running system; P1–P3 are the reusable kernel, P8/P11 are the demo layer, P9 turns it always-on, P17–P20 are the testnet DeFi/trading pack — all gated by the P6 policy + P3 budget invariants. Trading safety invariant: **paper-test (P20 eval) → testnet (P18 simulate-before-send) → mainnet only if you add a custodial wallet + security audit.**
