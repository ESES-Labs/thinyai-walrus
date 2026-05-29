import type { MemoryBackend, ModelProvider, Logger, Approver } from "./ports.js";
import type { ToolRegistry } from "./registry.js";
import type { EventBus } from "./events.js";
import type { Signer } from "./signer.js";
import type { Spawn } from "./spawn.js";

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
  /** Per-run scratch space shared between tools/middleware in one run. */
  state: Map<string, unknown>;
  signer?: Signer;
  approver?: Approver;
  /** Run a scoped child agent (delegation). Present when configured. */
  spawn?: Spawn;
  maxSteps: number;
}
