import type { ToolMiddleware, ToolCallCtx } from "../middleware.js";
import { PolicyError } from "../errors.js";

export interface PolicyDecision {
  effect: "allow" | "deny" | "approve";
  reason: string;
}

/**
 * A deterministic rule. Return null to abstain (let later rules / defaults decide).
 *
 * The `args` parameter has already been Zod-parsed by the policy middleware,
 * so rules receive validated, type-safe data — never raw LLM JSON.
 * NEVER read model text or tool output — decisions must be computed from
 * the tool definition + parsed args only. That is the prompt-injection boundary.
 */
export type PolicyRule = (
  call: Omit<ToolCallCtx, "args"> & { args: unknown },
) => PolicyDecision | null;

/**
 * Deterministic gate over tool execution.
 * The LLM proposes; this middleware enforces.
 *
 * Invariants:
 *   - Tool args are Zod-validated BEFORE rules run, so policy rules see
 *     parsed (type-safe) data, not raw untrusted LLM JSON.
 *   - Sensitive tools default to "approve" (require human approval).
 *   - Non-sensitive tools default to "allow".
 *   - The first non-null rule decision wins.
 *   - "deny" → throw PolicyError (becomes an observation).
 *   - "approve" → check approver; throw if not granted.
 */
export function policyMiddleware(rules: PolicyRule[]): ToolMiddleware {
  return async (call, next) => {
    // Validate args at the boundary before any rule sees them.
    // This is the prompt-injection boundary: rules never touch raw LLM JSON.
    let parsedArgs: unknown;
    try {
      parsedArgs = call.tool.parameters.parse(call.args);
    } catch {
      throw new PolicyError(
        `policy: invalid args for tool "${call.tool.name}" — args failed Zod validation`,
      );
    }

    const validatedCall = { ...call, args: parsedArgs };

    let decision: PolicyDecision = {
      effect: call.tool.sensitive ? "approve" : "allow",
      reason: "default",
    };

    for (const rule of rules) {
      const d = rule(validatedCall);
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
      if (!approved) {
        throw new PolicyError(`approval required and not granted: ${call.tool.name}`);
      }
    }

    // Pass validated args downstream — subsequent middleware and the base handler
    // receive the already-parsed (type-safe) value.
    return next({ ...call, args: parsedArgs });
  };
}
