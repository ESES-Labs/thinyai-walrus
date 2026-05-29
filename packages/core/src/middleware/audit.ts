import type { ModelMiddleware, ToolMiddleware } from "../middleware.js";
import type { Logger } from "../ports.js";

/** Logs every model call: latency, finish reason, token usage. */
export function modelAuditMiddleware(logger: Logger): ModelMiddleware {
  return async (req, next) => {
    const startedAt = Date.now();
    const response = await next(req);
    logger.info(
      {
        kind: "model_call",
        durationMs: Date.now() - startedAt,
        finishReason: response.finishReason,
        toolCalls: response.toolCalls?.map((c) => c.name) ?? [],
        usage: response.usage,
      },
      "model_call",
    );
    return response;
  };
}

/** Logs every tool call: name, latency, ok/error. */
export function toolAuditMiddleware(logger: Logger): ToolMiddleware {
  return async (call, next) => {
    const startedAt = Date.now();
    try {
      const result = await next(call);
      logger.info(
        {
          kind: "tool_call",
          tool: call.tool.name,
          durationMs: Date.now() - startedAt,
          ok: true,
        },
        "tool_call",
      );
      return result;
    } catch (err) {
      logger.error(
        {
          kind: "tool_call",
          tool: call.tool.name,
          durationMs: Date.now() - startedAt,
          ok: false,
          error: String(err),
        },
        "tool_call_failed",
      );
      throw err;
    }
  };
}
