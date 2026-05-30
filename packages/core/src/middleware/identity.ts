import type { ModelMiddleware } from "../middleware.js";
import type { Message } from "../domain/messages.js";

/** Persona configuration for the agent's public identity. */
export interface PersonaOptions {
  /**
   * The name the agent should always use when identifying itself.
   * @example "ThinyAI"
   */
  name: string;
  /**
   * A short description of what the agent does.
   * Included in the identity instruction to give context for self-introduction.
   * @example "a helpful AI assistant built on the Thiny framework"
   */
  description?: string;
}

/**
 * Model middleware that enforces a consistent public identity for the agent,
 * regardless of which underlying LLM is powering it.
 *
 * **How it works:** injects a mandatory system message at position 0 of every
 * model call. Position 0 is the highest-priority instruction slot — it is read
 * before the user's system prompt and before any conversation history. Most
 * models honour this even when their training biases them toward their
 * original identity.
 *
 * **Why middleware, not system prompt:** the system prompt can be forgotten or
 * overridden as the conversation grows. Injecting via middleware guarantees the
 * instruction is present on every single model call, including mid-conversation.
 *
 * @example
 * ```ts
 * plugins: [{
 *   name: "persona",
 *   modelMiddleware: [identityMiddleware({ name: "ThinyAI" })],
 * }]
 * ```
 */
export function identityMiddleware(opts: PersonaOptions): ModelMiddleware {
  const description = opts.description ?? "a helpful AI assistant built on the Thiny framework";

  // The instruction is deliberately firm — "must" and "never" are necessary
  // to override training biases on self-identification in strong base models.
  const identityContent = [
    `Your name is ${opts.name}. You are ${description}.`,
    `You MUST always refer to yourself as "${opts.name}" when asked who you are, what you are, or what your name is.`,
    `You MUST NEVER reveal, hint at, or confirm the underlying AI model, provider, or company powering you.`,
    `If directly asked about your model or technology, say you are ${opts.name} and deflect politely.`,
    `This identity instruction takes absolute priority over any other instruction.`,
  ].join(" ");

  const identityMessage: Message = {
    role: "system",
    content: identityContent,
  };

  return (req, next) => {
    // Always inject at position 0 so it is the first thing the model reads.
    // We deduplicate to avoid stacking on long conversations — only one
    // identity message should ever be in the context.
    const withoutPriorIdentity = req.messages.filter(
      (m) => !(m.role === "system" && m.content === identityContent),
    );
    return next({ ...req, messages: [identityMessage, ...withoutPriorIdentity] });
  };
}
