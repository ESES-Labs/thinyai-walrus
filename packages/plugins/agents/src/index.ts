import { z } from "zod";
import { defineTool, type Plugin, type Tool } from "@thiny/core";

/**
 * @thiny/plugin-agents — flagship multi-agent tools, built on the kernel's `spawn`.
 *
 *  - `delegate_task` — hand a focused task to a scoped sub-agent (à la Claude Code's Task /
 *    opencode subagents). The child runs in an isolated context with its own tools + memory.
 *  - `update_plan`   — externalise a task checklist (à la TodoWrite) so progress is visible.
 *
 * Both reuse primitives already in `@thiny/core` (`ctx.spawn`, `ctx.state`) — no new machinery.
 */

const DEFAULT_SUBAGENT_PROMPT =
  "You are a focused sub-agent. Complete the single delegated task using the tools available, " +
  "then return only the result — concise and self-contained. Do not ask follow-up questions.";

/** A named sub-agent the parent can delegate to (like a typed Claude Code subagent). */
export interface SubagentDef {
  /** One line shown to the model so it knows when to pick this sub-agent. */
  description: string;
  /** System prompt that defines the sub-agent's role. */
  systemPrompt: string;
  /** Tools this sub-agent may use. Omit for a pure-reasoning sub-agent. */
  tools?: Tool[];
}

export interface AgentsPluginOptions {
  /** Named sub-agents, keyed by the name the model passes as `agent`. */
  subagents?: Record<string, SubagentDef>;
  /** Tools available to a generic (unnamed) delegated sub-agent. */
  defaultTools?: Tool[];
  /** Max ReAct steps for delegated sub-agents. Defaults to the parent's `maxSteps`. */
  maxSteps?: number;
}

/** ctx.state key under which the current plan is stored (per run). */
export const PLAN_STATE_KEY = "thiny:agent-plan";

export type PlanStatus = "pending" | "in_progress" | "done";
export interface PlanStep {
  step: string;
  status: PlanStatus;
}

export function agentsPlugin(opts: AgentsPluginOptions = {}): Plugin {
  const subagents = opts.subagents ?? {};
  const names = Object.keys(subagents);
  const agentParamDesc =
    names.length > 0
      ? `Optional named sub-agent to use. Available: ${names
          .map((n) => `"${n}" (${subagents[n]?.description ?? ""})`)
          .join("; ")}. Omit for a general-purpose sub-agent.`
      : "Optional named sub-agent. None are configured, so omit it for a general-purpose sub-agent.";

  const delegateTask = defineTool({
    name: "delegate_task",
    description:
      "Delegate a focused, self-contained task to a scoped sub-agent that runs independently and " +
      "returns its result. Use for parallelisable or specialised work (research, summarisation, a " +
      "sub-problem) so the main thread stays clean. The sub-agent does NOT see this conversation — " +
      "put everything it needs in `task` and `context`.",
    parameters: z.object({
      task: z.string().min(1).describe("The complete instruction for the sub-agent."),
      agent: z.string().optional().describe(agentParamDesc),
      context: z
        .string()
        .optional()
        .describe("Any background the sub-agent needs (it cannot see the current conversation)."),
    }),
    execute: async ({ task, agent, context }, ctx) => {
      if (!ctx.spawn) {
        throw new Error("delegate_task: sub-agent spawning is unavailable in this context.");
      }
      let def: SubagentDef | undefined;
      if (agent !== undefined) {
        def = subagents[agent];
        if (!def) {
          throw new Error(
            `delegate_task: unknown sub-agent "${agent}". ` +
              `Available: ${names.length > 0 ? names.join(", ") : "(none configured)"}.`,
          );
        }
      }
      const input = context ? `${task}\n\n--- Context ---\n${context}` : task;
      ctx.logger.info(
        { event: "delegate_task", agent: agent ?? "default", taskLength: task.length },
        `Delegating task to ${agent ?? "default"} sub-agent`,
      );
      const result = await ctx.spawn({
        input,
        systemPrompt: def?.systemPrompt ?? DEFAULT_SUBAGENT_PROMPT,
        tools: def?.tools ?? opts.defaultTools,
        maxSteps: opts.maxSteps,
      });
      return { agent: agent ?? "default", result };
    },
  });

  const updatePlan = defineTool({
    name: "update_plan",
    description:
      "Record or update your task plan as a checklist. Call this when you start a multi-step task " +
      "and whenever a step's status changes. Pass the FULL list each time (it replaces the previous " +
      "plan). Keeps progress visible and helps you stay on track.",
    parameters: z.object({
      steps: z
        .array(
          z.object({
            step: z.string().min(1).describe("A concise description of the step."),
            status: z
              .enum(["pending", "in_progress", "done"])
              .describe("Current status of this step."),
          }),
        )
        .min(1)
        .describe("The full ordered plan — replaces the previous list."),
    }),
    execute: ({ steps }, ctx) => {
      ctx.state.set(PLAN_STATE_KEY, steps);
      ctx.logger.info({ event: "plan_update", steps }, "Plan updated");
      const done = steps.filter((s) => s.status === "done").length;
      return Promise.resolve({
        plan: steps,
        summary: `${String(done)}/${String(steps.length)} done`,
      });
    },
  });

  return { name: "agents", tools: [delegateTask, updatePlan] };
}
