import { describe, it, expect, vi } from "vitest";
import type { Ctx, SpawnOptions } from "@thiny/core";
import { agentsPlugin, PLAN_STATE_KEY, type PlanStep } from "../index.js";

function getTool(plugin: ReturnType<typeof agentsPlugin>, name: string) {
  const tool = plugin.tools?.find((t) => t.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

/** Minimal Ctx with a stub spawn + state + logger. */
function fakeCtx(spawn?: Ctx["spawn"]): Ctx {
  return {
    state: new Map(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    spawn,
  } as unknown as Ctx;
}

describe("delegate_task", () => {
  it("spawns a sub-agent with the task and returns its result", async () => {
    const spawn = vi.fn<[SpawnOptions], Promise<string>>(() => Promise.resolve("sub-agent answer"));
    const tool = getTool(agentsPlugin(), "delegate_task");
    const out = (await tool.execute({ task: "summarise X" }, fakeCtx(spawn))) as {
      agent: string;
      result: string;
    };
    expect(out).toEqual({ agent: "default", result: "sub-agent answer" });
    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn.mock.calls[0]?.[0]?.input).toBe("summarise X");
  });

  it("uses a named sub-agent's system prompt and folds context into the input", async () => {
    const spawn = vi.fn<[SpawnOptions], Promise<string>>(() => Promise.resolve("ok"));
    const plugin = agentsPlugin({
      subagents: { researcher: { description: "web research", systemPrompt: "You research." } },
    });
    const tool = getTool(plugin, "delegate_task");
    await tool.execute(
      { task: "find sources", agent: "researcher", context: "topic: walrus" },
      fakeCtx(spawn),
    );
    const arg = spawn.mock.calls[0]?.[0];
    expect(arg?.systemPrompt).toBe("You research.");
    expect(arg?.input).toContain("find sources");
    expect(arg?.input).toContain("topic: walrus");
  });

  it("rejects an unknown named sub-agent", async () => {
    const tool = getTool(agentsPlugin(), "delegate_task");
    await expect(
      tool.execute({ task: "x", agent: "nope" }, fakeCtx(vi.fn(async () => ""))),
    ).rejects.toThrow(/unknown sub-agent/);
  });

  it("throws when spawn is unavailable", async () => {
    const tool = getTool(agentsPlugin(), "delegate_task");
    await expect(tool.execute({ task: "x" }, fakeCtx(undefined))).rejects.toThrow(/unavailable/);
  });
});

describe("update_plan", () => {
  it("stores the plan in ctx.state and reports progress", async () => {
    const tool = getTool(agentsPlugin(), "update_plan");
    const ctx = fakeCtx();
    const steps: PlanStep[] = [
      { step: "a", status: "done" },
      { step: "b", status: "in_progress" },
    ];
    const out = (await tool.execute({ steps }, ctx)) as { summary: string };
    expect(out.summary).toBe("1/2 done");
    expect(ctx.state.get(PLAN_STATE_KEY)).toEqual(steps);
  });
});
