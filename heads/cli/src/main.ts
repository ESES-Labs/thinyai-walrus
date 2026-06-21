/**
 * Thiny CLI — beautiful TUI with skills support.
 *
 * Usage:
 *   pnpm cli
 *   pnpm cli --skills web-search,evm
 *   THINY_PERSONA_NAME=ThinyAI pnpm cli
 */
import { createInterface } from "node:readline/promises";
import { clearLine, cursorTo } from "node:readline";
import { stdin, stdout } from "node:process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  createAgent,
  defineTool,
  modelAuditMiddleware,
  toolAuditMiddleware,
  budgetMiddleware,
} from "@thiny/core";
import { loadThinyConfig, readThinyConfig } from "@thiny/model-aisdk";
import { pinoLogger } from "@thiny/logger-pino";
import { memwalFactsPlugin } from "@thiny/memory-memwal";
import {
  walrusClient,
  walrusMemoryPlugin,
  filePointerStore,
  walrusAuditLogger,
  verifyAuditTrail,
  explorerLinks,
  walruscanBlobUrl,
  type WalrusAuditLogger,
  type WalrusBlobRef,
  type WalrusNetwork,
} from "@thiny/walrus";
import { agentsPlugin } from "@thiny/plugin-agents";
import type { Logger, Plugin } from "@thiny/core";
import { defaultRegistry } from "@thiny/skills";
import { loadSkills } from "./skills.js";
import {
  clearScreen,
  renderHeader,
  renderToolsAndSkills,
  renderHints,
  renderAgentLabel,
  renderAgentDone,
  renderError,
  renderInfo,
  renderWarning,
  renderStatus,
  renderStored,
  renderSaving,
  createMarkdownWriter,
  formatTokens,
  Spinner,
} from "./ui.js";

/** Treat "", "0", "false" as off; anything else as on. */
function envOn(v: string | undefined): boolean {
  return !!v && v !== "0" && v.toLowerCase() !== "false";
}

/** Per-turn usage, accumulated from audit records, rendered as a status line (not raw logs). */
interface TurnStats {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  modelCalls: number;
}

function resetTurn(t: TurnStats): void {
  t.inputTokens = 0;
  t.outputTokens = 0;
  t.toolCalls = 0;
  t.modelCalls = 0;
}

/** Wrap a logger so audit records feed the status line — and still go to the (file) base logger. */
function captureStats(base: Logger, turn: TurnStats): Logger {
  const wrap = (l: Logger): Logger => ({
    info: (obj, msg) => {
      if (obj.kind === "model_call") {
        turn.modelCalls += 1;
        const usage = obj.usage;
        if (usage !== null && typeof usage === "object") {
          const u = usage as { inputTokens?: unknown; outputTokens?: unknown };
          if (typeof u.inputTokens === "number") turn.inputTokens += u.inputTokens;
          if (typeof u.outputTokens === "number") turn.outputTokens += u.outputTokens;
        }
      } else if (obj.kind === "tool_call") {
        turn.toolCalls += 1;
      }
      l.info(obj, msg);
    },
    warn: (obj, msg) => {
      l.warn(obj, msg);
    },
    error: (obj, msg) => {
      l.error(obj, msg);
    },
    child: (b) => wrap(l.child(b)),
  });
  return wrap(base);
}

const echoTool = defineTool({
  name: "echo",
  description: "Echo text back verbatim. Use when asked to repeat or echo something.",
  parameters: z.object({ text: z.string().describe("the text to echo") }),
  execute: ({ text }) => Promise.resolve({ echoed: text }),
});

function parseSkillArgs(): string[] {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--skills");
  if (idx === -1) return [];
  return (args[idx + 1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let currentSessionId = `cli-${new Date().getTime().toString()}`;

export async function runCli(): Promise<void> {
  // In TUI mode, write all logs to a file so they never appear in the terminal.
  // Both stdout and stderr map to the same TTY, so only a file truly hides them.
  // Inspect logs with: tail -f ~/.thiny/cli.log
  // Always write logs to a FILE, never the terminal. (An empty THINY_LOG_FILE must NOT fall through
  // to pino's stdout default — that's what dumped raw JSON into the chat.)
  const thinyDir = join(homedir(), ".thiny");
  mkdirSync(thinyDir, { recursive: true }); // ensure the dir exists before pino opens the log file
  const envLogFile = process.env.THINY_LOG_FILE?.trim();
  const logFile = envLogFile && envLogFile.length > 0 ? envLogFile : join(thinyDir, "cli.log");
  const fileLogger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info", file: logFile });

  // Capture audit records into per-turn stats (rendered as a status line, not raw logs).
  const turn: TurnStats = { inputTokens: 0, outputTokens: 0, toolCalls: 0, modelCalls: 0 };
  const session = { inputTokens: 0, outputTokens: 0, toolCalls: 0, turns: 0 };
  const logger = captureStats(fileLogger, turn);

  const activeModelName =
    process.env.THINY_MODEL ?? process.env.AGENT_MODEL ?? "openai:gpt-4o-mini";
  const personaName = process.env.THINY_PERSONA_NAME ?? "Thiny";
  const model = loadThinyConfig();

  // ── Walrus ──────────────────────────────────────────────────────────────────
  // One blob client powers both cross-session memory (default) and the optional audit trail.
  const network: WalrusNetwork = process.env.WALRUS_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const walrus = walrusClient({
    network,
    publisher: process.env.WALRUS_PUBLISHER_URL,
    aggregator: process.env.WALRUS_AGGREGATOR_URL,
  });
  // WALRUS_AUDIT=1 → tee every turn's action log into an immutable Walrus blob.
  const walrusAudit: WalrusAuditLogger | null = envOn(process.env.WALRUS_AUDIT)
    ? walrusAuditLogger(logger, walrus, { sessionId: currentSessionId })
    : null;
  // The audit-wrapped logger captures structured records AND forwards to pino (file).
  const agentLogger = walrusAudit ?? logger;

  // ── Cross-session memory: Walrus-native by default (portable, persistent, no SQLite) ──
  // Durable facts live on Walrus and are auto-injected each turn. MemWal (semantic) when provisioned.
  const userId = process.env.THINY_USER_ID ?? "default";
  const memwalEnabled = !!process.env.MEMWAL_DELEGATE_KEY && !!process.env.MEMWAL_ACCOUNT_ID;
  const memBackend = memwalEnabled ? "MemWal" : "Walrus"; // shown in the "memory saved on …" line
  // Walrus memory writes are backgrounded (non-blocking). Track in-flight writes so we can show a
  // "saving…" hint, and deliver the verifiable link whenever the write lands — even after the turn,
  // above the prompt the user is already typing at. `deliverRef` is upgraded once `rl` exists.
  const memoryRefs: WalrusBlobRef[] = [];
  let pendingWrites = 0;
  let deliverRef: (ref: WalrusBlobRef) => void = (ref) => memoryRefs.push(ref);
  const memoryPlugin: Plugin = memwalEnabled
    ? memwalFactsPlugin({
        delegateKey: process.env.MEMWAL_DELEGATE_KEY,
        accountId: process.env.MEMWAL_ACCOUNT_ID,
        serverUrl: process.env.MEMWAL_SERVER_URL,
        namespace: process.env.MEMWAL_NAMESPACE ?? userId,
      })
    : walrusMemoryPlugin({
        client: walrus,
        pointers: filePointerStore(process.env.WALRUS_POINTERS ?? "thiny-pointers.json"),
        userId,
        onStoreStart: () => (pendingWrites += 1),
        onStore: (ref) => {
          if (pendingWrites > 0) pendingWrites -= 1;
          deliverRef(ref);
        },
      });

  // Skills: merge thiny.config.json "skills" array with CLI --skills flag.

  const configSkills: string[] = readThinyConfig().skills ?? [];

  const cliSkills = parseSkillArgs();
  const requestedSkillIds = [...new Set([...configSkills, ...cliSkills])];
  const { plugins: skillPlugins, warnings: skillWarnings } = await loadSkills(
    requestedSkillIds,
    process.env,
  );

  const persona = process.env.THINY_PERSONA_NAME
    ? { name: process.env.THINY_PERSONA_NAME, description: process.env.THINY_PERSONA_DESCRIPTION }
    : undefined;

  // Create budget middleware separately so we can reset it per turn.
  // budgetMiddleware counters accumulate across calls — without reset() every
  // subsequent turn in the REPL would count toward the same cap.
  const budget = budgetMiddleware({ maxCalls: 50, logger });

  const agent = await createAgent({
    model,
    logger: agentLogger,
    persona,
    systemPrompt:
      "You are a helpful AI assistant. Use tools when they help you answer better. Be concise.\n\n" +
      "MEMORY: You have persistent long-term memory across sessions, stored on Walrus. What you " +
      "already know about the user is injected automatically at the start of each conversation under " +
      "“[User Memory …]”. When the user shares anything durable about themselves — their name, role, " +
      "preferences, projects, or goals, even casually — immediately call remember_fact to save it. " +
      "If asked what you remember, answer from the injected user memory (or call recall_memory). " +
      "You DO remember across sessions — never say you lack memory or that each session starts fresh.\n\n" +
      "For multi-step work, call update_plan to track steps and delegate_task to hand focused " +
      "sub-problems to a sub-agent.",
    tools: [echoTool],
    plugins: [
      {
        name: "observability",
        modelMiddleware: [modelAuditMiddleware(agentLogger), budget],
        toolMiddleware: [toolAuditMiddleware(agentLogger)],
      },
      agentsPlugin(),
      memoryPlugin,
      ...skillPlugins,
    ],
  });

  // Startup TUI
  clearScreen();
  renderHeader({
    model: activeModelName,
    session: currentSessionId,
    persona: personaName,
    version: "v0.1.0",
  });

  const registeredTools = agent.registry
    .all()
    .map((t) => t.name)
    .filter((name) => name !== "echo");

  // Build skills display: loaded skills → their tools; or show all available
  const skillsByCategory = new Map<string, string[]>();
  if (requestedSkillIds.length > 0) {
    for (const id of requestedSkillIds) {
      const def = defaultRegistry.all().find((s) => s.id === id);
      if (!def) continue;
      const existing = skillsByCategory.get(def.category) ?? [];
      existing.push(def.id);
      skillsByCategory.set(def.category, existing);
    }
  } else {
    for (const [cat, defs] of defaultRegistry.byCategory()) {
      skillsByCategory.set(
        cat,
        defs.map((d) => d.id),
      );
    }
  }

  renderToolsAndSkills(registeredTools, skillsByCategory, {
    model: activeModelName,
    session: currentSessionId,
    persona: personaName,
  });
  renderHints(logFile);
  for (const w of skillWarnings) renderWarning(w);
  renderInfo(
    `Memory: ${memwalEnabled ? "MemWal (semantic)" : "Walrus"} · cross-session, portable (user: ${userId})`,
  );
  if (walrusAudit)
    renderInfo(`Walrus audit: ON (${network}) — each turn's action log is stored + verifiable`);

  // REPL
  const rl = createInterface({ input: stdin, output: stdout });
  const spinner = new Spinner();

  // Memory writes are backgrounded for speed; flush any in-flight write on exit (EOF/Ctrl-D throws
  // out of the loop) so the last fact reliably lands on Walrus.
  const flushMemory = (memoryPlugin as { flush?: () => Promise<void> }).flush;

  const PROMPT = "\x1b[36mYou\x1b[0m \x1b[2m›\x1b[0m ";
  let atPrompt = false;
  // Render `fn`'s output without clobbering the user's in-progress input: clear the prompt line,
  // print, then let readline redraw the prompt + whatever they've typed (preserveCursor=true).
  const printAbovePrompt = (fn: () => void): void => {
    if (atPrompt) {
      cursorTo(stdout, 0);
      clearLine(stdout, 0);
    }
    fn();
    if (atPrompt) rl.prompt(true);
  };
  // A completed write lands here: above the prompt if the user already moved on, else queued for the
  // post-turn render.
  deliverRef = (ref) => {
    if (atPrompt) {
      printAbovePrompt(() => {
        renderStored("memory saved", explorerLinks(ref, network), memBackend);
      });
    } else memoryRefs.push(ref);
  };

  try {
  for (;;) {
    // Any write that finished in the gap since the last render → show its link before prompting.
    for (const ref of memoryRefs.splice(0))
      renderStored("memory saved", explorerLinks(ref, network), memBackend);
    if (pendingWrites > 0) renderSaving("memory", memBackend); // last turn's write still uploading
    atPrompt = true;
    const input = await rl.question(PROMPT);
    atPrompt = false;
    const trimmed = input.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("/")) {
      const parts = trimmed.slice(1).split(" ");
      const cmd = parts[0];
      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
      switch (cmd) {
        case "new": {
          // Long-term memory (facts on Walrus) persists automatically — just rotate the transcript.
          currentSessionId = `cli-${new Date().getTime().toString()}`;
          renderInfo("New session started — long-term memory carries over");
          break;
        }
        case "tools":
          renderInfo(
            `\nTools:\n${agent.registry
              .all()
              .map((t) => `  • ${t.name}  ${t.description.slice(0, 55)}`)
              .join("\n")}\n`,
          );
          break;
        case "skills":
          renderInfo("\nAvailable skills:");
          for (const [cat, defs] of defaultRegistry.byCategory()) {
            renderInfo(`  [${cat}]  ${defs.map((d) => d.id).join(", ")}`);
          }
          renderInfo("");
          break;
        case "session":
          renderInfo(`Session: ${currentSessionId}`);
          break;
        case "stats":
          renderInfo(
            `\nSession ${currentSessionId.slice(-8)} · ${String(session.turns)} turn${session.turns === 1 ? "" : "s"}\n` +
              `  tokens: ↑${formatTokens(session.inputTokens)} ↓${formatTokens(session.outputTokens)}\n` +
              `  tool calls: ${String(session.toolCalls)}\n`,
          );
          break;
        case "verify": {
          const blobId = parts[1];
          if (!blobId) {
            renderWarning("usage: /verify <blobId>");
            break;
          }
          try {
            const trail = await verifyAuditTrail(walrus, blobId);
            renderInfo(
              `\nAudit trail ${blobId}\n  session: ${trail.sessionId}  ·  ${String(trail.count)} entries  ·  ${trail.createdAt}`,
            );
            for (const e of trail.entries) {
              const what =
                typeof e.kind === "string" ? e.kind : typeof e.event === "string" ? e.event : "";
              const tool = typeof e.tool === "string" ? ` (${e.tool})` : "";
              renderInfo(`  • [${e.level}] ${what}${tool}`);
            }
            renderInfo(`\n  source: ${walruscanBlobUrl(blobId, network)}\n`);
          } catch (err: unknown) {
            renderError(err instanceof Error ? err.message : String(err));
          }
          break;
        }
        case "clear":
          clearScreen();
          renderHeader({ model: activeModelName, session: currentSessionId, persona: personaName });
          renderToolsAndSkills(registeredTools, skillsByCategory, {
            model: activeModelName,
            session: currentSessionId,
            persona: personaName,
          });
          renderHints(logFile);
          break;
        case "help":
          renderInfo(
            "\n/new · /tools · /skills · /stats · /session · /verify <blobId> · /clear · /help\n",
          );
          break;
        default:
          renderWarning(`Unknown command: /${cmd ?? ""}  — try /help`);
      }
      continue;
    }

    renderAgentLabel(personaName);
    spinner.start("thinking…");

    budget.reset(); // reset per-turn counters before each run
    resetTurn(turn);
    const startedAt = Date.now();

    try {
      let firstToken = true;
      const stream = createMarkdownWriter((s) => stdout.write(s));
      const toolHandler = (payload: unknown): void => {
        const { call } = payload as { call: { name: string } };
        spinner.stop();
        stdout.write(`  \x1b[33m⚙\x1b[0m \x1b[2m${call.name}\x1b[0m\n`);
        spinner.start("running…");
      };
      agent.events.on("beforeToolCall", toolHandler);

      const reply = await agent.run(trimmed, {
        sessionId: currentSessionId,
        onToken: (delta) => {
          // Stop the spinner on every token, not just the first: it gets restarted after each tool
          // call, so post-tool tokens would otherwise stream over the live "running…" line and
          // corrupt the output. stop() is a no-op once already stopped.
          spinner.stop();
          firstToken = false;
          stream.push(delta);
        },
      });

      agent.events.off("beforeToolCall", toolHandler);
      spinner.stop();

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (firstToken) {
        // No streaming tokens — render the blocking reply (or an empty-response notice).
        stream.push(reply.length > 0 ? reply : "\x1b[2m(model returned empty response)\x1b[0m");
      }
      stream.end();

      renderAgentDone();

      // Clean status line — replaces the raw session_end JSON.
      const durMs = Date.now() - startedAt;
      session.turns += 1;
      session.inputTokens += turn.inputTokens;
      session.outputTokens += turn.outputTokens;
      session.toolCalls += turn.toolCalls;
      renderStatus([
        activeModelName,
        `${(durMs / 1000).toFixed(1)}s`,
        `↑${formatTokens(turn.inputTokens)} ↓${formatTokens(turn.outputTokens)}`,
        turn.toolCalls > 0 ? `${String(turn.toolCalls)} tool${turn.toolCalls === 1 ? "" : "s"}` : "",
      ]);

      // Memory that already finished uploading this turn → show its verifiable blob(s) now.
      // Writes still in flight surface later (above the prompt) via deliverRef.
      for (const ref of memoryRefs.splice(0))
        renderStored("memory saved", explorerLinks(ref, network), memBackend);

      // Store this turn's action log on Walrus — backgrounded so the prompt returns immediately and
      // the user can keep chatting; the link surfaces above the prompt once the upload lands.
      if (walrusAudit && walrusAudit.entries().length > 0) {
        pendingWrites += 1;
        const flushP = walrusAudit.flush(currentSessionId); // serialises the buffer synchronously…
        walrusAudit.reset(); // …so clearing it now can't drop entries from the in-flight upload
        void flushP
          .then((ref) => {
            if (pendingWrites > 0) pendingWrites -= 1;
            if (ref) deliverRef(ref);
          })
          .catch((err: unknown) => {
            if (pendingWrites > 0) pendingWrites -= 1;
            const m = `Walrus audit flush failed: ${err instanceof Error ? err.message : String(err)}`;
            if (atPrompt) {
              printAbovePrompt(() => {
                renderWarning(m);
              });
            } else renderWarning(m);
          });
      }
    } catch (err: unknown) {
      spinner.stop();
      const msg = err instanceof Error ? err.message : String(err);
      // A model/endpoint misconfig (wrong model id, base URL, or key) surfaces as an API error —
      // point the user at where to fix it instead of leaving them guessing.
      const looksLikeModelError = /\b(model|api|channel|base ?url|unauthorized|not found|invalid|401|404)\b/i.test(msg);
      renderError(
        looksLikeModelError
          ? `${msg}\n  ↳ Check your model, base URL, and API key (run \`thiny init\`, or edit ~/.thiny/config.json / .env).`
          : msg,
      );
    }
  }
  } finally {
    if (flushMemory) await flushMemory().catch(() => undefined);
  }
}
