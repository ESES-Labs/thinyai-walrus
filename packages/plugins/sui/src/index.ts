import { z } from "zod";
import { defineTool, type Approver, type Plugin } from "@thiny/core";
import type { SuiSigner } from "@thiny/signer-sui";
import { Transaction } from "@mysten/sui/transactions";

/**
 * @thiny/plugin-sui — Sui read tools + a gated PTB executor for grounded agent execution.
 *
 * The agent gets unsigned PTBs from a builder (e.g. Rill's hosted MCP, which returns
 * `{ unsignedTx, preview, simulation }`) and submits them through `sui_execute_ptb`:
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
  /**
   * The Sui signer (from `@thiny/signer-sui`) — holds the key + RPC client.
   * Pass a getter to resolve it lazily (e.g. a wallet configured at runtime via a setup tool);
   * the tools call it on each use and surface a friendly message until a wallet exists.
   */
  signer: SuiSigner | (() => SuiSigner | null | undefined);
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
  const sig = opts.signer;
  const resolve: () => SuiSigner | null | undefined =
    typeof sig === "function" ? sig : () => sig;
  // When no wallet is configured, tools RETURN this (they do NOT throw) — a thrown error makes weak
  // models retry in a loop; a clean terminal result gets relayed to the user immediately.
  const SETUP_NEEDED = {
    ok: false,
    setupNeeded: true,
    message:
      "Sui isn't set up yet. Ask the user which network (testnet or mainnet) and which wallet " +
      "(generate a new key, import a private key, or use a Rill agent wallet), then call sui_setup. " +
      "Do NOT retry this tool until setup is complete.",
  } as const;
  const requireSimSuccess = opts.policy?.requireSimSuccess ?? true;

  // Shared gated path for every transaction the plugin signs (built here or received as a PTB):
  // re-simulate → soft policy → approval gate → sign + submit.
  const executeTx = async (
    signer: SuiSigner,
    tx: Transaction,
    toolName: string,
    approvalArgs: Record<string, unknown>,
    reason: string,
  ): Promise<{ digest: string; effects: unknown; explorerUrl: string }> => {
    const sim = await signer.devInspect(tx);
    const status = sim.effects.status.status;
    if (requireSimSuccess && status !== "success") {
      throw new Error(`${toolName}: simulation failed (${sim.effects.status.error ?? status})`);
    }
    if (opts.policy?.maxGasBudgetMist !== undefined) {
      const gas = sim.effects.gasUsed as GasUsed;
      const estGas = BigInt(gas.computationCost) + BigInt(gas.storageCost);
      if (estGas > opts.policy.maxGasBudgetMist) {
        throw new Error(
          `${toolName}: estimated gas ${estGas.toString()} MIST exceeds policy cap ${opts.policy.maxGasBudgetMist.toString()}.`,
        );
      }
    }
    if (opts.approver) {
      const ok = await opts.approver({ tool: toolName, args: approvalArgs, reason });
      if (!ok) throw new Error(`${toolName}: rejected by approver.`);
    }
    const { digest, effects } = await signer.signAndExecute(tx);
    return { digest, effects, explorerUrl: explorerTxUrl(signer.network, digest) };
  };

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
      const signer = resolve();
      if (!signer) return SETUP_NEEDED;
      const owner = address ?? signer.address;
      if (owner === undefined) {
        return { ok: false, message: "No address given and no wallet is set up. Run sui_setup first." };
      }
      const bal = await signer.client.getBalance({ owner, ...(coinType ? { coinType } : {}) });
      return {
        owner,
        coinType: bal.coinType,
        totalBalanceMist: bal.totalBalance,
        coins: bal.coinObjectCount,
      };
    },
  });

  const object = defineTool({
    name: "sui_object",
    description: "Read a Sui object's type and fields by id.",
    parameters: z.object({ objectId: z.string().min(1).describe("The object id (0x…).") }),
    execute: async ({ objectId }) => {
      const signer = resolve();
      if (!signer) return SETUP_NEEDED;
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
      "Sign and submit an unsigned Sui programmable transaction (PTB) produced by an external " +
      "builder/MCP (e.g. Rill). Re-simulates → soft policy → approval gate → sign + submit. Pass the " +
      "builder's `unsignedTx`: the JSON string from `Transaction.toJSON()`, built with NO sender and " +
      "NO gas (the signer fills both). On-chain caps may still abort it. For your OWN transfers/calls " +
      "use sui_transfer / sui_move_call instead.",
    sensitive: true,
    parameters: z.object({
      unsignedTx: z
        .string()
        .min(1)
        .describe("Unsigned PTB — the JSON string from Transaction.toJSON() (no sender, no gas)."),
    }),
    execute: async ({ unsignedTx }) => {
      const signer = resolve();
      if (!signer) return SETUP_NEEDED;
      // The wire contract is the toJSON() string; the signer adds sender + gas at sign time.
      const tx = Transaction.from(unsignedTx);
      return await executeTx(signer, tx, "sui_execute_ptb", { unsignedTx }, "sign and submit a Sui PTB");
    },
  });

  const transfer = defineTool({
    name: "sui_transfer",
    description:
      "Build, sign, and submit a coin transfer: send an amount of SUI (or any coin type) to an " +
      "address. Amounts are in MIST (1 SUI = 1,000,000,000 MIST). Use this for simple sends.",
    sensitive: true,
    parameters: z.object({
      recipient: z.string().min(1).describe("Destination address (0x…)."),
      amountMist: z.string().min(1).describe('Amount in MIST. e.g. "1000000000" = 1 SUI.'),
      coinType: z.string().optional().describe("Coin type (default 0x2::sui::SUI)."),
    }),
    execute: async ({ recipient, amountMist, coinType }) => {
      const signer = resolve();
      if (!signer) return SETUP_NEEDED;
      const amount = BigInt(amountMist);
      const type = coinType ?? "0x2::sui::SUI";
      const tx = new Transaction();
      if (type.endsWith("::sui::SUI")) {
        // SUI: split straight from the gas coin.
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
        tx.transferObjects([coin], tx.pure.address(recipient));
      } else {
        // Other coins: gather the sender's coins of this type, merge, split the exact amount.
        const owner = signer.address;
        if (owner === undefined) return { ok: false, message: "Wallet has no address. Run sui_setup." };
        const { data } = await signer.client.getCoins({ owner, coinType: type });
        const [first, ...rest] = data;
        if (!first) throw new Error(`sui_transfer: no ${type} coins owned by ${owner}.`);
        const primary = tx.object(first.coinObjectId);
        if (rest.length > 0) {
          tx.mergeCoins(primary, rest.map((c) => tx.object(c.coinObjectId)));
        }
        const [coin] = tx.splitCoins(primary, [tx.pure.u64(amount)]);
        tx.transferObjects([coin], tx.pure.address(recipient));
      }
      return executeTx(
        signer,
        tx,
        "sui_transfer",
        { recipient, amountMist, coinType: type },
        `transfer ${amountMist} MIST of ${type} to ${recipient}`,
      );
    },
  });

  const moveCall = defineTool({
    name: "sui_move_call",
    description:
      "Build, sign, and submit ANY Sui Move call — invoke a function on any package/module. This is " +
      "the general way to run any on-chain action (swaps, mints, staking, arbitrary contracts). " +
      "Provide the exact target, type arguments, and ordered arguments.",
    sensitive: true,
    parameters: z.object({
      target: z
        .string()
        .regex(/^0x[0-9a-fA-F]+::[^:]+::[^:]+$/, "must be package::module::function")
        .describe("Fully-qualified function, e.g. 0x2::coin::value."),
      typeArguments: z
        .array(z.string())
        .optional()
        .describe('Generic type args, e.g. ["0x2::sui::SUI"].'),
      args: z
        .array(
          z.object({
            kind: z.enum(["pure", "object", "gas"]).describe("pure value, object id, or the gas coin"),
            value: z.string().optional().describe("object: the 0x… id; pure: the value as a string"),
            type: z
              .string()
              .optional()
              .describe("pure type: u8|u16|u32|u64|u128|u256|bool|address|string (default string)"),
          }),
        )
        .optional()
        .describe("Ordered arguments to the function."),
    }),
    execute: async ({ target, typeArguments, args }) => {
      const signer = resolve();
      if (!signer) return SETUP_NEEDED;
      const tx = new Transaction();
      const built = (args ?? []).map((a) => {
        if (a.kind === "gas") return tx.gas;
        if (a.kind === "object") {
          if (a.value === undefined) throw new Error("sui_move_call: object arg needs `value` (id).");
          return tx.object(a.value);
        }
        const v = a.value ?? "";
        // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- default handles the rest
        switch (a.type) {
          case "u8": return tx.pure.u8(Number(v));
          case "u16": return tx.pure.u16(Number(v));
          case "u32": return tx.pure.u32(Number(v));
          case "u64": return tx.pure.u64(BigInt(v));
          case "u128": return tx.pure.u128(BigInt(v));
          case "u256": return tx.pure.u256(BigInt(v));
          case "bool": return tx.pure.bool(v === "true");
          case "address": return tx.pure.address(v);
          default: return tx.pure.string(v);
        }
      });
      tx.moveCall({ target, typeArguments: typeArguments ?? [], arguments: built });
      return await executeTx(signer, tx, "sui_move_call", { target, typeArguments, args }, `Move call ${target}`);
    },
  });

  return { name: "sui", tools: [balance, object, executePtb, transfer, moveCall] };
}
