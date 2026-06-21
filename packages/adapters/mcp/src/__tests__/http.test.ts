import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpHttpPlugin } from "../index.js";

/** A real MCP server exposing one `echo` tool. */
function makeMcpServer(): McpServer {
  const server = new McpServer({ name: "test-mcp", version: "1.0.0" });
  server.registerTool(
    "echo",
    { description: "Echo text back", inputSchema: { text: z.string() } },
    ({ text }) => ({ content: [{ type: "text", text: `echo:${text}` }] }),
  );
  return server;
}

/** Start a real streamable-HTTP MCP server (stateless) on an ephemeral port. */
async function startHttpMcp(): Promise<{ url: string; close: () => Promise<void> }> {
  const httpServer = createServer((req, res) => {
    void (async () => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
      });
      await makeMcpServer().connect(transport);
      let body = "";
      for await (const chunk of req) body += String(chunk);
      await transport.handleRequest(req, res, body ? (JSON.parse(body) as unknown) : undefined);
    })();
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${String(port)}/mcp`,
    close: () =>
      new Promise<void>((resolve) => {
        httpServer.close(() => {
          resolve();
        });
      }),
  };
}

describe("mcpHttpPlugin — real MCP server over HTTP", () => {
  it("connects to an MCP URL, discovers tools, and calls one end-to-end", async () => {
    const srv = await startHttpMcp();
    try {
      const plugin = await mcpHttpPlugin({ url: srv.url, name: "t" });
      const names = plugin.tools?.map((x) => x.name) ?? [];
      expect(names).toContain("t_echo");

      const echo = plugin.tools?.find((x) => x.name === "t_echo");
      if (!echo) throw new Error("t_echo tool not registered");
      const out = await echo.execute({ text: "hi" }, {} as never);
      expect(JSON.stringify(out)).toContain("echo:hi");

      await plugin.close();
    } finally {
      await srv.close();
    }
  });
});
