# @thiny/plugin-agents

> Flagship multi-agent tools for Thiny — sub-agent delegation and task planning, built on `spawn`.

## Install

```bash
pnpm add @thiny/plugin-agents
```

## Usage

```ts
import { agentsPlugin } from "@thiny/plugin-agents";

const agent = await createAgent({
  model,
  plugins: [
    agentsPlugin({
      // optional named, typed sub-agents (like Claude Code subagent types)
      subagents: {
        researcher: {
          description: "web research and source gathering",
          systemPrompt: "You research topics and return cited findings.",
          tools: [webSearchTool],
        },
      },
    }),
  ],
});
```

The agent now has two tools:

| Tool            | Mirrors                                 | What it does                                                                                                |
| --------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `delegate_task` | Claude Code `Task` / opencode subagents | Spawns a scoped sub-agent (isolated context, own tools + memory) for a focused task and returns its result. |
| `update_plan`   | Claude Code `TodoWrite`                 | Records/updates a task checklist (`pending` / `in_progress` / `done`) so progress stays visible.            |

Sub-agent recursion is bounded by the kernel's `maxSpawnDepth` (default 3). The child cannot see the
parent conversation — pass everything it needs via `task` and `context`.

## Public API

| Export                                       | Description                                |
| -------------------------------------------- | ------------------------------------------ |
| `agentsPlugin(opts)`                         | The plugin factory                         |
| `AgentsPluginOptions`                        | `subagents?`, `defaultTools?`, `maxSteps?` |
| `SubagentDef`                                | `description`, `systemPrompt`, `tools?`    |
| `PlanStep` / `PlanStatus` / `PLAN_STATE_KEY` | Plan types + the `ctx.state` key           |
