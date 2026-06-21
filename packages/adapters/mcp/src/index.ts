import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { defineTool, type Plugin, type Tool } from "@thiny/core";
import { jsonSchemaToZod, type JsonSchema } from "./schema.js";

/** A transport accepted by the MCP client (stdio or streamable HTTP). */
type McpTransport = Parameters<Client["connect"]>[0];

/**
 * Connect a client over the given transport, list its tools, and expose each as a Thiny tool.
 * Shared by the stdio ({@link mcpPlugin}) and HTTP ({@link mcpHttpPlugin}) entry points.
 */
async function buildMcpPlugin(transport: McpTransport, prefix: string): Promise<McpPlugin> {
  const client = new Client({ name: "thiny", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  const listed = await client.listTools();

  const tools: Tool[] = listed.tools.map((toolDef) =>
    defineTool({
      name: `${prefix}_${toolDef.name}`,
      description: toolDef.description ?? toolDef.name,
      parameters: jsonSchemaToZod(toolDef.inputSchema as JsonSchema),
      execute: async (args) => {
        const result = await client.callTool({
          name: toolDef.name,
          arguments: (args ?? {}) as Record<string, unknown>,
        });
        return result.content;
      },
    }),
  );

  return {
    name: `mcp:${prefix}`,
    tools,
    async close() {
      await client.close();
    },
  };
}

export { jsonSchemaToZod, type JsonSchema } from "./schema.js";

/**
 * Options for connecting to an MCP server over stdio.
 *
 * Any MCP server that communicates over stdio is supported — official ones
 * (`@modelcontextprotocol/server-filesystem`, etc.) and custom servers alike.
 */
export interface McpStdioOptions {
  /** Executable to run (e.g. `"npx"`, `"node"`, `"python"`). */
  command: string;
  /** Arguments to the command (e.g. `["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]`). */
  args?: string[];
  /** Additional environment variables for the child process. */
  env?: Record<string, string>;
  /**
   * Prefix for all tool names to avoid collisions.
   * For example, `"fs"` turns `read_file` into `fs_read_file`.
   * Defaults to `"mcp"`.
   */
  name?: string;
}

/** A Thiny Plugin extended with a `close()` method to disconnect from the MCP server. */
export type McpPlugin = Plugin & {
  /** Disconnect from the MCP server and clean up the child process. */
  close(): Promise<void>;
};

/**
 * Connect to an MCP server over stdio and expose its tools as Thiny tools.
 *
 * This is the force-multiplier: every MCP server — filesystem, databases,
 * GitHub, Slack, browser automation — becomes instantly available with
 * zero per-tool code.
 *
 * Tool JSON Schemas are converted to Zod schemas via `jsonSchemaToZod`.
 * Unsupported schema shapes fall back to `z.unknown()` so registration
 * never fails.
 *
 * @throws {Error} When the MCP server fails to start or list its tools.
 *
 * @example
 * ```ts
 * const fs = await mcpPlugin({
 *   command: "npx",
 *   args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
 *   name: "fs",
 * });
 *
 * const agent = await createAgent({ model: loadThinyConfig(), plugins: [fs] });
 * // Now the agent has tools like fs_read_file, fs_write_file, fs_list_directory
 *
 * // Clean up on shutdown:
 * await fs.close();
 * ```
 */
export async function mcpPlugin(opts: McpStdioOptions): Promise<McpPlugin> {
  const transport = new StdioClientTransport({
    command: opts.command,
    args: opts.args ?? [],
    env: opts.env,
  });
  return buildMcpPlugin(transport, opts.name ?? "mcp");
}

/** Options for connecting to a hosted MCP server over streamable HTTP (e.g. a Rill MCP URL). */
export interface McpHttpOptions {
  /** The MCP server URL (e.g. `https://rill.example/mcp/flow/abc`). */
  url: string;
  /** Prefix for tool names (defaults to `"mcp"`). */
  name?: string;
  /** Extra request headers (e.g. an auth token). */
  headers?: Record<string, string>;
}

/**
 * Connect to a **hosted** MCP server by URL (streamable HTTP) and expose its tools as Thiny tools.
 *
 * This is the "paste a link → the agent uses it" path: a user hands the agent an MCP URL (such as a
 * Rill-hosted protocol/flow endpoint), and every tool that server advertises becomes available — its
 * tool calls return whatever the server produces (for Rill, an unsigned PTB + preview + simulation,
 * which `@thiny/plugin-sui`'s `sui_execute_ptb` then gates and signs).
 *
 * @throws {Error} When the server is unreachable or fails to list its tools.
 *
 * @example
 * ```ts
 * const rill = await mcpHttpPlugin({ url: process.env.RILL_MCP_URL!, name: "rill" });
 * const agent = await createAgent({ model, plugins: [rill, suiPlugin({ signer })] });
 * await rill.close();
 * ```
 */
export async function mcpHttpPlugin(opts: McpHttpOptions): Promise<McpPlugin> {
  const transport = new StreamableHTTPClientTransport(
    new URL(opts.url),
    opts.headers ? { requestInit: { headers: opts.headers } } : undefined,
  );
  return buildMcpPlugin(transport, opts.name ?? "mcp");
}

export default function (env: Record<string, string | undefined> = process.env): Promise<Plugin> {
  // Prefer a hosted MCP URL when given; otherwise spawn a stdio server (install-on-run via npx).
  if (env.MCP_URL) {
    return mcpHttpPlugin({ url: env.MCP_URL, name: env.MCP_NAME ?? "mcp" });
  }
  const command = env.MCP_COMMAND ?? "npx";
  const args = (env.MCP_ARGS ?? "").split(" ").filter(Boolean);
  return mcpPlugin({ command, args, name: env.MCP_NAME ?? "mcp" });
}
