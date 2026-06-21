#!/usr/bin/env node
// DEV launcher for running `thiny` from a clone (symlinked onto PATH by install.sh).
// It runs the TypeScript sources via tsx. The PUBLISHED package (`thinyai`) ships a bundled
// dist/bin.js instead — this file is not part of that package.
// CLI / init / sui init / help / version are handled by heads/cli/src/bin.ts (single source of
// onboarding); the extra server/demo heads are dev-only conveniences.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, realpathSync } from "node:fs";

const self = realpathSync(fileURLToPath(import.meta.url));
const repo = resolve(dirname(self), ".."); // bin/ -> repo root
const envFile = existsSync(join(repo, ".env")) ? ["--env-file", join(repo, ".env")] : [];

const DEV_HEADS = {
  web: "heads/http/src/main.ts",
  daemon: "heads/daemon/src/main.ts",
  "walrus-demo": "heads/walrus-demo/src/main.ts",
};

const [sub] = process.argv.slice(2);
// web/daemon/walrus-demo are dev-only heads; everything else goes through the CLI entry (bin.ts).
const entry = DEV_HEADS[sub] ?? "heads/cli/src/bin.ts";
const args = sub in DEV_HEADS ? process.argv.slice(3) : process.argv.slice(2);

const child = spawn(process.execPath, [...envFile, "--import", "tsx", join(repo, entry), ...args], {
  stdio: "inherit",
  cwd: repo,
});
child.on("exit", (code) => process.exit(code ?? 0));
