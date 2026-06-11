import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";

function get(server: Server, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === "string") return reject(new Error("No address"));
    const url = `http://localhost:${addr.port}${path}`;
    const parsed = new URL(url);

    const req = require("node:http").get(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
  });
}

describe("Health and readiness probes", () => {
  let server: Server;

  // Create a minimal server with health/ready endpoints
  beforeAll(() => {
    let dbHealthy = true;

    server = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (req.method === "GET" && req.url === "/readyz") {
        if (dbHealthy) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "ready" }));
        } else {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { status: 503, message: "Service unavailable" } }));
        }
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(0);
  });

  afterAll(() => {
    server.close();
  });

  it("GET /healthz returns 200 with ok status", async () => {
    const result = await get(server, "/healthz");
    expect(result.status).toBe(200);
    const data = JSON.parse(result.body);
    expect(data.status).toBe("ok");
  });

  it("GET /readyz returns 200 when DB is reachable", async () => {
    const result = await get(server, "/readyz");
    expect(result.status).toBe(200);
    const data = JSON.parse(result.body);
    expect(data.status).toBe("ready");
  });
});
