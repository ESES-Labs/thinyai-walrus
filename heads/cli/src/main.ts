/**
 * Thiny CLI head — an interactive terminal agent.
 *
 * Usage:
 *   pnpm cli                  # uses AGENT_MODEL from .env
 *   AGENT_MODEL=anthropic:claude-haiku-4-5-20251001 pnpm cli
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { z } from "zod";
import {
  createAgent,
  defineTool,
  modelAudit,
  toolAudit,
  budgetMiddleware,
} from "@thiny/core";
import { aiSdkModel } from "@thiny/model-aisdk";
import { webSearchPlugin } from "@thiny/plugin-web-search";

// ── Built-in echo tool (always available, useful for demos) ─────────────────
const echoTool = defineTool({
  name: "echo",
  description: "Echo text back verbatim. Use when asked to repeat or echo something.",
  parameters: z.object({
    text: z.string().describe("the text to echo"),
  }),
  execute: async ({ text }) => ({ echoed: text }),
});

// ── Minimal console logger (swap for @thiny/logger-pino in production) ──────
const logger = {
  info:  (_o: unknown, m?: string) => process.env.LOG_LEVEL === "debug" && console.error("[info]",  m),
  warn:  (_o: unknown, m?: string) => console.error("[warn]",  m),
  error: (_o: unknown, m?: string) => console.error("[error]", m),
  child: function() { return this as typeof logger; },
};

async function main() {
  const model = process.env.AGENT_MODEL ?? "openai:gpt-4o-mini";

  const plugins = [];
  if (process.env.BRAVE_API_KEY) {
    plugins.push(webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY }));
  }

  const agent = await createAgent({
    model: aiSdkModel({ model }),
    systemPrompt:
      "You are a helpful CLI assistant. Use tools when they help you answer better. " +
      "Be concise.",
    tools: [echoTool],
    plugins: [
      {
        name: "observability",
        modelMiddleware: [
          modelAudit(logger),
          budgetMiddleware({ maxCalls: 50, maxTokens: 500_000 }),
        ],
        toolMiddleware: [toolAudit(logger)],
      },
      ...plugins,
    ],
  });

  const rl = createInterface({ input: stdin, output: stdout });
  stdout.write(`Thiny agent ready  [model: ${model}]\n`);
  stdout.write("Type a message and press Enter. Ctrl+C to quit.\n\n");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await rl.question("> ");
    if (!input.trim()) continue;

    try {
      stdout.write(""); // ensure cursor is ready
      await agent.run(input, {
        sessionId: "cli",
        onToken: (delta) => process.stdout.write(delta),
      });
      stdout.write("\n");
    } catch (err) {
      stdout.write(`\nerror: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
