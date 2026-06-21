import { z } from "zod";
import { defineTool, type Approver, type Plugin } from "@thiny/core";
import type { SuiSigner } from "@thiny/signer-sui";
import { Transaction } from "@mysten/sui/transactions";

/**
 * @thiny/plugin-sui — Sui read tools + a gated PTB executor for grounded agent execution.
 *
 * The agent gets unsigned PTBs from a builder (e.g. Rill's hosted MCP, which returns
 * `{ unsignedPtb, preview, simulation }`) and submits them through `sui_execute_ptb`:
 * re-simulate → soft policy → approval gate → sign → submit.
 *
 * **Protocol-agnostic by design:** it signs whatever bytes it's given — no Cetus/DeepBook SDKs, no
 * pool knowledge. Hard budget/scope/expiry caps are enforced on-chain by the `agent_wallet` Move
 * object baked into the PTB; this TS policy is the soft/UX layer (early, clear failure), never the
 * source of truth for money safety.
 */

/** Soft pre-sign checks (defense-in-depth; the hard cap is the on-chain `agent_wallet`). */
export interface SuiExecPolicy {
  /** Reject if the dry-run does not predict success. Default `true`. */
  requireSimSuccess?: boolean;
  /** Reject if the dry-run's estimated gas (computation + storage, in MIST) exceeds this. */
  maxGasBudgetMist?: bigint;
}

export interface SuiPluginOptions {
  /** The Sui signer (from `@thiny/signer-sui`) — holds the key + RPC client. */
  signer: SuiSigner;
  /** Soft pre-sign policy. */
  policy?: SuiExecPolicy;
  /** Optional approval gate before signing (human or headless). */
  approver?: Approver;
}

interface GasUsed {
  computationCost: string;
  storageCost: string;
}

function explorerTxUrl(network: string, digest: string): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}

/** Sui plugin: balance/object reads + the gated `sui_execute_ptb`. */
export function suiPlugin(opts: SuiPluginOptions): Plugin {
  const { signer } = opts;
  const requireSimSuccess = opts.policy?.requireSimSuccess ?? true;

  const balance = defineTool({
    name: "sui_balance",
    description:
      "Read a Sui coin balance. Defaults to the agent's own address and SUI when omitted. " +
      "Returns total balance in MIST plus the coin count.",
    parameters: z.object({
      address: z.string().optional().describe("Owner address (default: the agent's address)."),
      coinType: z.string().optional().describe("Coin type, e.g. 0x2::sui::SUI (default: SUI)."),
    }),
    execute: async ({ address, coinType }) => {
      const owner = address ?? signer.address;
      if (owner === undefined) {
        throw new Error("sui_balance: no address given and the signer has no key/address.");
      }
      const bal = await signer.client.getBalance({ owner, ...(coinType ? { coinType } : {}) });
      return { owner, coinType: bal.coinType, totalBalanceMist: bal.totalBalance, coins: bal.coinObjectCount };
    },
  });

  const object = defineTool({
    name: "sui_object",
    description: "Read a Sui object's type and fields by id.",
    parameters: z.object({ objectId: z.string().min(1).describe("The object id (0x…).") }),
    execute: async ({ objectId }) => {
      const res = await signer.client.getObject({
        id: objectId,
        options: { showContent: true, showType: true, showOwner: true },
      });
      if (!res.data) throw new Error(`sui_object: ${objectId} not found`);
      const content = res.data.content;
      return {
        objectId,
        type: res.data.type,
        fields: content?.dataType === "moveObject" ? content.fields : undefined,
      };
    },
  });

  const executePtb = defineTool({
    name: "sui_execute_ptb",
    description:
      "Sign and submit an unsigned Sui programmable transaction (PTB) that a builder/MCP produced. " +
      "Re-simulates the PTB, applies the soft policy and approval gate, then signs + submits. " +
      "Pass the builder's `unsignedTx` (the serialized string from `Transaction.toJSON()`) — built " +
      "with NO sender and NO gas (the signer fills both). On-chain caps may still abort it.",
    sensitive: true,
    parameters: z.object({
      unsignedTx: z
        .string()
        .min(1)
        .describe("The builder's unsigned PTB — a serialized `Transaction.toJSON()` string."),
    }),
    execute: async ({ unsignedTx }) => {
      // 1. Deserialize the builder's PTB (serialized via Transaction.toJSON(); signer adds sender+gas).
      const tx = Transaction.from(unsignedTx);

      // 2. Re-simulate (defense-in-depth — catch drift since the builder's sim; no gas, no signature).
      const sim = await signer.devInspect(tx);
      const status = sim.effects.status.status;
      if (requireSimSuccess && status !== "success") {
        throw new Error(`sui_execute_ptb: simulation failed (${sim.effects.status.error ?? status})`);
      }

      // 3. Soft policy: estimated-gas ceiling (the hard budget cap is on-chain via agent_wallet).
      if (opts.policy?.maxGasBudgetMist !== undefined) {
        const gas = sim.effects.gasUsed as GasUsed;
        const estGas = BigInt(gas.computationCost) + BigInt(gas.storageCost);
        if (estGas > opts.policy.maxGasBudgetMist) {
          throw new Error(
            `sui_execute_ptb: estimated gas ${estGas.toString()} MIST exceeds policy cap ${opts.policy.maxGasBudgetMist.toString()}.`,
          );
        }
      }

      // 4. Approval gate (headless or human).
      if (opts.approver) {
        const ok = await opts.approver({
          tool: "sui_execute_ptb",
          args: { unsignedTx },
          reason: "sign and submit a Sui PTB",
        });
        if (!ok) throw new Error("sui_execute_ptb: rejected by approver.");
      }

      // 5. Sign + submit (mainnet guard enforced inside the signer).
      const { digest, effects } = await signer.signAndExecute(tx);
      return { digest, effects, explorerUrl: explorerTxUrl(signer.network, digest) };
    },
  });

  return { name: "sui", tools: [balance, object, executePtb] };
}
