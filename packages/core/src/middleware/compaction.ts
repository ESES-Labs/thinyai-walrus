import type { ModelMiddleware } from "../middleware.js";
import type { Message } from "../domain/messages.js";
import type { ModelProvider, Logger } from "../ports.js";

export interface CompactionOptions {
  maxMessages?: number;
  maxTokens?: number;
  keepRecent: number;
  summarizer: ModelProvider;
  /** Optional logger for auditing the summarizer call. */
  logger?: Logger;
}

/**
 * Estimate the token count of a single message.
 * Approx 3.5 characters per token is a robust estimate for prose, code, and JSON tools.
 */
export function estimateMessageTokens(m: Message): number {
  let content = "";
  if ("content" in m) {
    content = m.content;
  }
  if ("toolCalls" in m && m.toolCalls) {
    content += JSON.stringify(m.toolCalls);
  }
  return Math.ceil(content.length / 3.5);
}

/**
 * Estimate the total token count of a set of messages.
 */
export function estimateTotalTokens(messages: Message[]): number {
  return messages.reduce((acc, m) => acc + estimateMessageTokens(m), 0);
}

/**
 * Summarises the middle of the conversation into a single system note
 * when the message count exceeds maxMessages or the estimated token count exceeds maxTokens.
 *
 * The summarizer call goes directly to the model provider — it intentionally
 * skips other model middleware (budget, compaction itself) to avoid:
 *   1. Counting the summarization against the user's budget.
 *   2. Recursive compaction loops.
 * When a logger is provided, the summarizer call is audited independently.
 */
export function compactionMiddleware(opts: CompactionOptions): ModelMiddleware {
  return async (req, next) => {
    let shouldCompact = false;
    if (opts.maxMessages !== undefined && req.messages.length > opts.maxMessages) {
      shouldCompact = true;
    }
    if (opts.maxTokens !== undefined && estimateTotalTokens(req.messages) > opts.maxTokens) {
      shouldCompact = true;
    }

    if (!shouldCompact) return next(req);

    const system = req.messages.filter((m) => m.role === "system");
    const body = req.messages.filter((m) => m.role !== "system");

    let keepCount = opts.keepRecent;
    if (opts.maxTokens !== undefined) {
      const systemTokens = estimateTotalTokens(system);
      const summaryReserved = 400; // estimated tokens for the summary system message
      const budget = opts.maxTokens - systemTokens - summaryReserved;

      let currentTokens = 0;
      let i = body.length - 1;
      for (; i >= 0; i--) {
        const msg = body[i];
        if (!msg) continue;
        const msgTokens = estimateMessageTokens(msg);
        if (currentTokens + msgTokens > budget && (body.length - 1 - i) >= keepCount) {
          break;
        }
        currentTokens += msgTokens;
      }
      keepCount = body.length - 1 - i;
    }

    keepCount = Math.max(keepCount, opts.keepRecent);
    if (body.length <= keepCount) {
      return next(req);
    }

    const recent = body.slice(-keepCount);
    const toSummarize = body.slice(0, body.length - keepCount);

    const transcript = toSummarize
      .map((m) => `${m.role}: ${"content" in m ? m.content : ""}`)
      .join("\n");

    const startedAt = Date.now();
    const res = await opts.summarizer.generate(
      [
        {
          role: "system",
          content:
            "Summarise the conversation preserving facts, decisions, and open tasks. Be concise.",
        },
        { role: "user", content: transcript },
      ],
      [],
    );

    opts.logger?.info(
      { kind: "compaction", ms: Date.now() - startedAt, messagesBefore: req.messages.length },
      "compaction",
    );

    const summaryNote: Message = {
      role: "system",
      content: `[conversation summary]\n${res.text ?? ""}`,
    };
    return next({ ...req, messages: [...system, summaryNote, ...recent] });
  };
}
