#!/usr/bin/env node
/**
 * sui-signer-smoke.ts — prove the real Sui sign path end-to-end on testnet.
 *
 * Exercises everything that the offline tests can't (it needs a funded key):
 *   1. getBalance           — proves SuiJsonRpcClient.getBalance
 *   2. devInspect           — proves devInspectTransactionBlock
 *   3. signAndExecute       — a 1-MIST self-transfer (proves sign + waitForTransaction)
 *   4. sui_execute_ptb      — the plugin happy-path: a "Rill-style" toJSON PTB → sign → submit
 *   5. mainnet guard        — refuses to sign on mainnet without allowMainnet
 *
 * Run (after putting a FUNDED testnet key in .env):
 *   node --env-file=.env --import tsx scripts/sui-signer-smoke.ts
 */
import { Transaction } from "@mysten/sui/transactions";
import { suiSigner } from "../packages/adapters/signer-sui/src/index.js";
import { suiPlugin } from "../packages/plugins/sui/src/index.js";

const secretKey = process.env.THINY_SUI_SECRET_KEY ?? process.env.SUI_SECRET_KEY;
const network = process.env.SUI_NETWORK === "mainnet" ? "mainnet" : "testnet";

async function main(): Promise<void> {
  if (!secretKey) {
    console.log("⊘ skipped — set THINY_SUI_SECRET_KEY (a FUNDED testnet key) in .env to run.");
    return;
  }
  if (network !== "testnet") {
    console.log("⊘ refusing to run the live sign path on a non-testnet network.");
    return;
  }

  const signer = suiSigner({ network, rpcUrl: process.env.SUI_RPC_URL, secretKey });
  const address = signer.address;
  if (address === undefined) throw new Error("no address derived from key");
  console.log("agent address:", address);

  // 1. getBalance
  const bal = await signer.client.getBalance({ owner: address });
  console.log("1. balance:", bal.totalBalance, "MIST");

  // 2. devInspect (keyless dry-run)
  const probe = new Transaction();
  probe.splitCoins(probe.gas, [probe.pure.u64(1)]);
  const sim = await signer.devInspect(probe);
  console.log("2. devInspect:", sim.effects.status.status);

  // 3. signAndExecute — 1-MIST self-transfer
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
  tx.transferObjects([coin], tx.pure.address(address));
  const res = await signer.signAndExecute(tx);
  console.log(`3. signed + submitted: ${res.digest}`);
  console.log(`   https://suiscan.xyz/${network}/tx/${res.digest}`);

  // 4. plugin happy-path: build a "Rill-style" PTB (no sender/gas) → toJSON → sui_execute_ptb
  const builder = new Transaction();
  const [c2] = builder.splitCoins(builder.gas, [builder.pure.u64(1)]);
  builder.transferObjects([c2], builder.pure.address(address));
  const unsignedTx = await builder.toJSON();
  const tools = suiPlugin({ signer }).tools ?? [];
  const tool = (name: string) => {
    const t = tools.find((x) => x.name === name);
    if (!t) throw new Error(`${name} tool missing`);
    return t;
  };
  const out = await tool("sui_execute_ptb").execute({ unsignedTx }, {} as never);
  console.log("4. sui_execute_ptb:", (out as { digest: string }).digest);

  // 4b. sui_transfer — the local builder path: 1 MIST self-transfer, built + signed by the plugin.
  const t = (await tool("sui_transfer").execute(
    { recipient: address, amountMist: "1" },
    {} as never,
  )) as { digest: string };
  console.log("4b. sui_transfer:", t.digest);

  // 4c. sui_move_call — arbitrary Move call: 0x2::pay::split(gas, 1) splits 1 MIST into a new coin.
  //     Proves the general builder (gas/pure args + type args) produces a valid, executable PTB.
  const m = (await tool("sui_move_call").execute(
    {
      target: "0x2::pay::split",
      typeArguments: ["0x2::sui::SUI"],
      args: [{ kind: "gas" }, { kind: "pure", type: "u64", value: "1" }],
    },
    {} as never,
  )) as { digest: string };
  console.log("4c. sui_move_call:", m.digest);

  // 5. mainnet guard
  const mainnet = suiSigner({ network: "mainnet", secretKey });
  try {
    await mainnet.signAndExecute(new Transaction());
    console.error("5. ✗ mainnet guard did NOT block");
    process.exit(1);
  } catch (err) {
    console.log("5. mainnet guard:", err instanceof Error ? err.message : String(err));
  }

  console.log("\n✓ Sui signer smoke complete (real testnet).");
}

main().catch((err: unknown) => {
  console.error("\n✗ smoke failed:", err);
  process.exit(1);
});
