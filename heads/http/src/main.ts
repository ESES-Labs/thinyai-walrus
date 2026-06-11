/**
 * Thiny HTTP head — hardened, production-grade SSE streaming server.
 *
 * Usage:
 *   pnpm http                      # listens on http://localhost:8787
 *   PORT=3000 THINY_HTTP_TOKEN=secret pnpm http
 *
 * Security features:
 *   - Body size cap (64 KB) — returns 413
 *   - JSON parse + Zod validation — returns 400
 *   - Bearer/API-key auth via THINY_HTTP_TOKEN
 *   - Configurable CORS origin allowlist
 *   - Per-IP rate limiting
 *   - Structured error responses (no stack traces)
 */

import { createServer } from "node:http";
import { createClient } from "@libsql/client";
import { createAgent } from "@thiny/core";
import { loadThinyConfig } from "@thiny/model-aisdk";
import { pinoLogger } from "@thiny/logger-pino";
import { sqliteMemory } from "@thiny/memory-sqlite";
import { webSearchPlugin } from "@thiny/plugin-web-search";
import { otelTracingPlugin } from "@thiny/otel";
import { initOtel } from "./otel.js";
import { z } from "zod";
import { streamChat } from "./sse.js";
import { WEB_UI } from "./web.js";

// ── Constants ──────────────────────────────────────────────────────
const MAX_BODY_SIZE = 64 * 1024; // 64 KB
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // requests per window
const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes

// ── Zod schemas ────────────────────────────────────────────────────
const ChatInputSchema = z.object({
  input: z.string().min(1).max(10_000),
  sessionId: z.string().max(128).optional(),
});

type ChatInput = z.infer<typeof ChatInputSchema>;

// ── CORS ───────────────────────────────────────────────────────────
function parseCorsOrigins(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin: string | undefined, allowedOrigins: string[]): Record<string, string> {
  if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
    return { "access-control-allow-origin": "*" };
  }
  if (origin && allowedOrigins.includes(origin)) {
    return { "access-control-allow-origin": origin };
  }
  return {};
}

// ── Rate limiter ───────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Periodically clean expired entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 60_000).unref();

// ── Auth ───────────────────────────────────────────────────────────
function checkAuth(req: { headers: Record<string, string | string[] | undefined> }, token: string): boolean {
  const authHeader = req.headers["authorization"];
  const authStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!authStr) return false;
  return authStr === `Bearer ${token}` || authStr === token;
}

// ── Helpers ────────────────────────────────────────────────────────
function structuredError(status: number, message: string): string {
  return JSON.stringify({ error: { status, message } });
}

function getClientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ip?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

// ── Main ───────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const logger = pinoLogger({ level: process.env.LOG_LEVEL ?? "info" });
  const authToken = process.env.THINY_HTTP_TOKEN;
  const allowedOrigins = parseCorsOrigins(process.env.THINY_CORS_ORIGINS);

  const personaName = process.env.THINY_PERSONA_NAME;
  const personaDescription = process.env.THINY_PERSONA_DESCRIPTION;
  const persona = personaName ? { name: personaName, description: personaDescription } : undefined;

  const plugins = [];
  await initOtel();
  plugins.push(otelTracingPlugin());
  if (process.env.BRAVE_API_KEY) {
    plugins.push(webSearchPlugin({ apiKey: process.env.BRAVE_API_KEY }));
  }

  const dbUrl = process.env.SESSION_DB ?? "file:thiny.sqlite";
  const db = createClient({ url: dbUrl });
  const agent = await createAgent({
    model: loadThinyConfig(),
    logger,
    memory: await sqliteMemory({ url: dbUrl }),
    persona,
    systemPrompt: "You are a helpful web-based AI assistant. Be concise and helpful.",
    plugins,
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const server = createServer(async (req, res) => {
    const origin = (req.headers["origin"] as string | undefined) ?? undefined;

    // ── OPTIONS preflight ────────────────────────────────────────
    if (req.method === "OPTIONS") {
      const ch = corsHeaders(origin, allowedOrigins);
      res.writeHead(204, {
        ...ch,
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
      });
      res.end();
      return;
    }

    // ── GET / ────────────────────────────────────────────────────
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(WEB_UI);
      return;
    }

    // ── POST /chat ───────────────────────────────────────────────
    if (req.method === "POST" && req.url === "/chat") {
      const ip = getClientIp(req);

      // Rate limit
      if (!checkRateLimit(ip)) {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(structuredError(429, "Too many requests — rate limit exceeded"));
        return;
      }

      // Auth (if configured)
      if (authToken && !checkAuth(req, authToken)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(structuredError(401, "Unauthorized — provide a valid Bearer token"));
        return;
      }

      // Read body with size cap
      let body = "";
      let bodySize = 0;
      try {
        for await (const chunk of req) {
          const str = chunk as string;
          bodySize += Buffer.byteLength(str, "utf-8");
          if (bodySize > MAX_BODY_SIZE) {
            res.writeHead(413, { "content-type": "application/json" });
            res.end(structuredError(413, "Request body too large — max 64 KB"));
            return;
          }
          body += str;
        }
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(structuredError(400, "Failed to read request body"));
        return;
      }

      // Parse JSON
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(structuredError(400, "Invalid JSON in request body"));
        return;
      }

      // Validate with Zod
      const parsed = ChatInputSchema.safeParse(rawJson);
      if (!parsed.success) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({
          error: { status: 400, message: "Invalid input", issues: parsed.error.issues },
        }));
        return;
      }

      const { input, sessionId } = parsed.data;

      // Set timeout for the request
      const timeout = setTimeout(() => {
        if (!res.writableEnded) {
          res.end();
        }
      }, REQUEST_TIMEOUT_MS);
      timeout.unref();

      // CORS + SSE headers
      const extraHeaders = corsHeaders(origin, allowedOrigins);
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        ...extraHeaders,
      });

      try {
        await streamChat(agent, input, sessionId ?? "web", (chunk) => res.write(chunk));
      } catch (err) {
        // streamChat already sends SSE error frames; ensure response ends
        logger.error({ err }, "Agent run failed");
      }

      clearTimeout(timeout);
      if (!res.writableEnded) res.end();
      return;
    }

    // ── GET /sessions ────────────────────────────────────────────
    if (req.method === "GET" && req.url === "/sessions") {
      const ch = corsHeaders(origin, allowedOrigins);
      try {
        const result = await db.execute(
          "SELECT session, payload FROM transcripts ORDER BY rowid DESC LIMIT 100",
        );
        const sessions = result.rows.map((row) => {
          const sessionId = row.session as string;
          let messages: Array<{ role: string; content?: unknown }> = [];
          try {
            messages = JSON.parse(row.payload as string) as typeof messages;
          } catch { /* ignore */ }
          const lastMsg = [...messages]
            .reverse()
            .find((m) => m.role === "user" || m.role === "assistant");
          const lastMessage =
            lastMsg && typeof lastMsg.content === "string"
              ? lastMsg.content.slice(0, 120)
              : "";
          return { id: sessionId, messageCount: messages.length, lastMessage, updatedAt: Date.now() };
        });
        res.writeHead(200, { "content-type": "application/json", ...ch });
        res.end(JSON.stringify({ sessions }));
      } catch {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(structuredError(500, "Internal server error"));
      }
      return;
    }

    // ── DELETE /sessions/:id ─────────────────────────────────────
    if (req.method === "DELETE" && req.url?.startsWith("/sessions/")) {
      const ch = corsHeaders(origin, allowedOrigins);
      const sessionId = decodeURIComponent(req.url.slice("/sessions/".length));
      try {
        await db.execute({ sql: "DELETE FROM transcripts WHERE session = ?", args: [sessionId] });
        res.writeHead(200, { "content-type": "application/json", ...ch });
        res.end(JSON.stringify({ deleted: true, id: sessionId }));
      } catch {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(structuredError(500, "Internal server error"));
      }
      return;
    }


    // ── GET /healthz (liveness) ───────────────────────────────────
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // ── GET /readyz (readiness) ───────────────────────────────────
    if (req.method === "GET" && req.url === "/readyz") {
      try {
        await db.execute("SELECT 1");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ready" }));
      } catch {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(structuredError(503, "Service unavailable — database unreachable"));
      }
      return;
    }

    // ── 404 ──────────────────────────────────────────────────────
    res.writeHead(404, { "content-type": "application/json" });
    res.end(structuredError(404, "Not found"));
  });

  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, () => {
    logger.info(
      { event: "http_ready", port, url: `http://localhost:${String(port)}`, auth: !!authToken },
      `HTTP head ready at http://localhost:${String(port)}`,
    );
  });
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
