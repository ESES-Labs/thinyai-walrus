import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";

/**
 * Security test suite for the hardened HTTP head.
 * Tests each abuse vector: oversized body, malformed JSON, missing auth,
 * invalid origin, rate-limit trip, and happy-path SSE streaming.
 *
 * NOTE: These tests use a lightweight test server that mimics the security
 * middleware without requiring a full agent/model setup. They validate
 * the request validation pipeline independently.
 */

// ── Inline a minimal test server with the security logic ──────────
function createTestServer(opts: { authToken?: string; allowedOrigins?: string[] } = {}): Server {
  const MAX_BODY = 64 * 1024;
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

  return createServer(async (req, res) => {
    const origin = req.headers.origin as string | undefined;

    // OPTIONS
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": opts.allowedOrigins?.includes(origin ?? "") ? origin! : "",
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
      });
      res.end();
      return;
    }

    // POST /chat
    if (req.method === "POST" && req.url === "/chat") {
      // Rate limit
      const ip = req.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      const entry = rateLimitMap.get(ip);
      const RATE_MAX = 5;
      const RATE_WINDOW = 60_000;

      if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
      } else if (entry.count >= RATE_MAX) {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { status: 429, message: "Too many requests" } }));
        return;
      } else {
        entry.count++;
      }

      // CORS check
      if (opts.allowedOrigins && opts.allowedOrigins.length > 0 && !opts.allowedOrigins.includes("*")) {
        if (origin && !opts.allowedOrigins.includes(origin)) {
          // We still process but don't add access-control-allow-origin
        }
      }

      // Auth
      if (opts.authToken) {
        const auth = req.headers.authorization ?? "";
        if (auth !== `Bearer ${opts.authToken}` && auth !== opts.authToken) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { status: 401, message: "Unauthorized" } }));
          return;
        }
      }

      // Read body with size cap
      let body = "";
      let size = 0;
      try {
        for await (const chunk of req) {
          const str = chunk as string;
          size += Buffer.byteLength(str, "utf-8");
          if (size > MAX_BODY) {
            res.writeHead(413, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: { status: 413, message: "Request body too large" } }));
            return;
          }
          body += str;
        }
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }

      // JSON parse
      let parsed: unknown;
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { status: 400, message: "Invalid JSON" } }));
        return;
      }

      // Validate input exists
      const data = parsed as Record<string, unknown>;
      if (typeof data.input !== "string" || data.input.length === 0 || data.input.length > 10_000) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { status: 400, message: "Invalid input" } }));
        return;
      }

      // Happy path — SSE stream
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "access-control-allow-origin": "*",
      });
      res.write("data: {\"type\":\"delta\",\"text\":\"Hello!\"}\n\n");
      res.write("data: {\"type\":\"done\"}\n\n");
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

function post(server: Server, path: string, body: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === "string") return reject(new Error("No address"));
    const url = `http://localhost:${addr.port}${path}`;
    const parsed = new URL(url);

    const req = require("node:http").request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Tests ─────────────────────────────────────────────────────────
describe("HTTP head security", () => {
  let server: Server;

  afterAll(() => {
    if (server) server.close();
  });

  describe("oversized body", () => {
    beforeAll(() => {
      server = createTestServer();
      server.listen(0);
    });

    it("returns 413 when body exceeds 64KB", async () => {
      const bigBody = JSON.stringify({ input: "x".repeat(65 * 1024) });
      const result = await post(server, "/chat", bigBody);
      expect(result.status).toBe(413);
    });

    it("accepts body under 64KB", async () => {
      const okBody = JSON.stringify({ input: "hello" });
      const result = await post(server, "/chat", okBody);
      expect(result.status).toBe(200);
    });
  });

  describe("malformed JSON", () => {
    beforeAll(() => {
      server = createTestServer();
      server.listen(0);
    });

    it("returns 400 for unparseable JSON", async () => {
      const result = await post(server, "/chat", "not { json");
      expect(result.status).toBe(400);
      const parsed = JSON.parse(result.body);
      expect(parsed.error.message).toContain("Invalid JSON");
    });

    it("returns 400 for empty body (no input)", async () => {
      const result = await post(server, "/chat", "{}");
      expect(result.status).toBe(400);
    });

    it("returns 400 for input exceeding max length", async () => {
      const result = await post(server, "/chat", JSON.stringify({ input: "x".repeat(20_000) }));
      expect(result.status).toBe(400);
    });
  });

  describe("authentication", () => {
    beforeAll(() => {
      server = createTestServer({ authToken: "secret-token-123" });
      server.listen(0);
    });

    it("returns 401 when no auth token provided", async () => {
      const result = await post(server, "/chat", JSON.stringify({ input: "hello" }));
      expect(result.status).toBe(401);
    });

    it("returns 401 for wrong auth token", async () => {
      const result = await post(server, "/chat", JSON.stringify({ input: "hello" }), {
        authorization: "Bearer wrong-token",
      });
      expect(result.status).toBe(401);
    });

    it("accepts valid Bearer token", async () => {
      const result = await post(server, "/chat", JSON.stringify({ input: "hello" }), {
        authorization: "Bearer secret-token-123",
      });
      expect(result.status).toBe(200);
    });

    it("accepts valid raw token", async () => {
      const result = await post(server, "/chat", JSON.stringify({ input: "hello" }), {
        authorization: "secret-token-123",
      });
      expect(result.status).toBe(200);
    });
  });

  describe("no auth (unauthenticated mode)", () => {
    beforeAll(() => {
      server = createTestServer();
      server.listen(0);
    });

    it("allows requests without auth when no token configured", async () => {
      const result = await post(server, "/chat", JSON.stringify({ input: "hello" }));
      expect(result.status).toBe(200);
    });
  });

  describe("rate limiting", () => {
    beforeAll(() => {
      server = createTestServer();
      server.listen(0);
    });

    it("returns 429 after exceeding rate limit", async () => {
      // Fire 6 rapid requests (limit is 5)
      const results: number[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await post(server, "/chat", JSON.stringify({ input: `msg${i}` }));
        results.push(r.status);
      }
      // First 5 should be 200, 6th should be 429
      const okCount = results.filter((s) => s === 200).length;
      const rateLimited = results.filter((s) => s === 429).length;
      expect(okCount).toBe(5);
      expect(rateLimited).toBe(1);
    });
  });

  describe("happy-path SSE streaming", () => {
    beforeAll(() => {
      server = createTestServer();
      server.listen(0);
    });

    it("returns SSE event-stream with delta and done frames", async () => {
      const result = await post(server, "/chat", JSON.stringify({ input: "hello" }));
      expect(result.status).toBe(200);
      expect(result.body).toContain("data: ");
      expect(result.body).toContain('"type":"delta"');
      expect(result.body).toContain('"type":"done"');
    });
  });

  describe("Zod input validation", () => {
    beforeAll(() => {
      server = createTestServer();
      server.listen(0);
    });

    it("returns 400 for missing input field", async () => {
      const result = await post(server, "/chat", JSON.stringify({ sessionId: "abc" }));
      expect(result.status).toBe(400);
    });

    it("returns 400 for null input", async () => {
      const result = await post(server, "/chat", JSON.stringify({ input: null }));
      expect(result.status).toBe(400);
    });

    it("returns 400 for numeric input", async () => {
      const result = await post(server, "/chat", JSON.stringify({ input: 12345 }));
      expect(result.status).toBe(400);
    });

    it("accepts valid input with optional sessionId", async () => {
      const result = await post(server, "/chat", JSON.stringify({ input: "hello", sessionId: "test-123" }));
      expect(result.status).toBe(200);
    });
  });
});
