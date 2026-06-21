import { z } from "zod";
import { defineTool, type Tool } from "@thiny/core";

/** Public Sui testnet JSON-RPC — no API key required. */
const DEFAULT_SUI_RPC = "https://fullnode.testnet.sui.io:443";

export interface SuiStatusToolOptions {
  /** Sui JSON-RPC URL. Default: public testnet fullnode. */
  rpcUrl?: string;
  /** Injectable fetch (for tests). Default: global `fetch`. */
  fetchImpl?: typeof fetch;
}

interface SuiRpcResponse {
  result?: string;
  error?: { message?: string };
}

/**
 * A real, no-key monitoring tool: reads the latest Sui testnet checkpoint sequence number.
 * The demo agent calls this each tick to observe live network progress (errors surface as
 * observations, never crashing the loop).
 */
export function suiStatusTool(opts: SuiStatusToolOptions = {}): Tool {
  const rpcUrl = opts.rpcUrl ?? DEFAULT_SUI_RPC;
  const fetchImpl = opts.fetchImpl ?? fetch;

  return defineTool({
    name: "check_sui_status",
    description:
      "Read the latest Sui testnet checkpoint sequence number (live on-chain data, no key needed). " +
      "Use each tick to observe how far the network has progressed.",
    parameters: z.object({}),
    execute: async () => {
      const res = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sui_getLatestCheckpointSequenceNumber",
          params: [],
        }),
      });
      if (!res.ok) throw new Error(`sui rpc failed: HTTP ${String(res.status)}`);
      const json = (await res.json()) as SuiRpcResponse;
      if (json.error) throw new Error(`sui rpc error: ${json.error.message ?? "unknown"}`);
      if (json.result === undefined) throw new Error("sui rpc: missing result");
      return { checkpoint: json.result };
    },
  });
}
