/**
 * `thiny` CLI entrypoint (the published binary). Dispatches subcommands, runs first-time setup,
 * then starts the interactive agent in-process. Self-contained — no repo or tsx needed.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCli } from "./main.js";
import { applyConfig, baseSetup, suiInit, ensureSetup, loadConfig, version } from "./onboarding.js";

function help(): void {
  console.log(`thiny ${version()}

Usage:
  thiny                 Start the interactive CLI agent (runs setup on first use)
  thiny init            Re-run setup (model, agent name, key)
  thiny sui init        Add Sui capabilities (network + wallet)
  thiny update          Update thinyai to the latest version
  thiny --version       Print version
  thiny help            Show this help

Config: ~/.thiny/config.json  (no .env needed)`);
}

/** Guess the package manager that installed this binary, from where it lives on disk. */
function detectPackageManager(): "bun" | "pnpm" | "npm" {
  const here = fileURLToPath(import.meta.url);
  if (here.includes("/.bun/") || here.includes("\\.bun\\")) return "bun";
  if (here.includes("pnpm")) return "pnpm";
  return "npm";
}

/** `thiny update` — re-install the latest published version with the detected package manager. */
function update(): void {
  const pm = detectPackageManager();
  const args = pm === "npm" ? ["install", "-g", "thinyai@latest"] : ["add", "-g", "thinyai@latest"];
  console.log(`Updating thinyai via ${pm}…  (${pm} ${args.join(" ")})`);
  const res = spawnSync(pm, args, { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(
      `\nUpdate failed. Run it manually:  ${pm} ${args.join(" ")}\n` +
        `(or, if you used a different installer:  npm i -g thinyai@latest)`,
    );
    process.exit(res.status ?? 1);
  }
  console.log("\n✓ Updated. Run `thiny --version` to confirm.");
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
    case "update":
    case "upgrade":
      update();
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
