/**
 * `thiny` CLI entrypoint (the published binary). Dispatches subcommands, runs first-time setup,
 * then starts the interactive agent in-process. Self-contained — no repo or tsx needed.
 */
import { runCli } from "./main.js";
import { applyConfig, baseSetup, suiInit, ensureSetup, loadConfig, version } from "./onboarding.js";

function help(): void {
  console.log(`thiny ${version()}

Usage:
  thiny                 Start the interactive CLI agent (runs setup on first use)
  thiny init            Re-run setup (model, agent name, key)
  thiny sui init        Add Sui capabilities (network + wallet)
  thiny --version       Print version
  thiny help            Show this help

Config: ~/.thiny/config.json  (no .env needed)`);
}

async function run(): Promise<void> {
  const [sub, sub2] = process.argv.slice(2);
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- default handles the rest
  switch (sub) {
    case "init":
      await baseSetup();
      return;
    case "sui":
      if (sub2 === "init") await suiInit();
      else console.log("Usage: thiny sui init");
      return;
    case "--version":
    case "-v":
      console.log(version());
      return;
    case "help":
    case "--help":
    case "-h":
      help();
      return;
    default:
      await ensureSetup();
      applyConfig(loadConfig());
      await runCli();
  }
}

run().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
