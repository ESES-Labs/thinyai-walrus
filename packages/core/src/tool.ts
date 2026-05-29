import type { z } from "zod";
import type { Ctx } from "./context.js";

/**
 * A capability contributed by a plugin.
 * `parameters` is both the runtime validator and the JSON schema the LLM sees.
 */
export interface Tool<A = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<A>;
  /** Mark money-moving / destructive tools — policy defaults to "approve". */
  sensitive?: boolean;
  tags?: string[];
  execute(args: A, ctx: Ctx): Promise<unknown>;
}

/** Type-safe helper that preserves the arg type through inference. */
export function defineTool<A>(t: Tool<A>): Tool<A> {
  return t;
}
