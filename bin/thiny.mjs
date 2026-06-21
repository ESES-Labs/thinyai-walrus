#!/usr/bin/env node
// Unified `thiny` launcher. Symlinked onto PATH by install.sh; resolves its own
// repo via the symlink and runs the heads through tsx (same as the pnpm scripts).
// ponytail: spawns the in-repo heads instead of bundling them — no publish/build step needed.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, realpathSync, copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

const self = realpathSync(fileURLToPath(import.meta.url)); // follow the PATH symlink
const repo = resolve(dirname(self), "..");                 // bin/ -> repo root
const version = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version;

// Global config lives in ~/.thiny/.env; repo .env is the dev fallback.
const globalEnv = join(homedir(), ".thiny", ".env");
const envFile = existsSync(globalEnv) ? globalEnv : join(repo, ".env");

const HEADS = {
  web: "heads/http/src/main.ts",
  daemon: "heads/daemon/src/main.ts",
  "walrus-demo": "heads/walrus-demo/src/main.ts",
};

const [sub, ...rest] = process.argv.slice(2);

function runHead(entry, args) {
  const env = existsSync(envFile) ? ["--env-file", envFile] : [];
  const child = spawn(process.execPath, [...env, "--import", "tsx", join(repo, entry), ...args], {
    stdio: "inherit",
    cwd: repo,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

function init() {
  const dir = join(homedir(), ".thiny");
  mkdirSync(dir, { recursive: true });
  if (existsSync(globalEnv)) {
    console.log(`Config already exists: ${globalEnv}`);
  } else {
    copyFileSync(join(repo, ".env.example"), globalEnv);
    console.log(`Created ${globalEnv}`);
  }
  console.log("\nNext: open it and set a model + key, e.g.");
  console.log("  THINY_MODEL=openai:gpt-4o-mini");
  console.log("  THINY_OPENAI_API_KEY=sk-...");
  console.log("\nThen run:  thiny");
}

function help() {
  console.log(`thiny ${version}

Usage:
  thiny                 Start the interactive CLI agent
  thiny init            Create ~/.thiny/.env (first-time setup)
  thiny web             Start the HTTP server head
  thiny daemon          Start the background runtime head
  thiny walrus-demo     Run the Walrus monitoring demo
  thiny --version       Print version
  thiny help            Show this help

Config: ~/.thiny/.env  (falls back to <repo>/.env)`);
}

switch (sub) {
  case "init": init(); break;
  case "web": case "daemon": case "walrus-demo": runHead(HEADS[sub], rest); break;
  case "--version": case "-v": console.log(version); break;
  case "help": case "--help": case "-h": help(); break;
  default: runHead("heads/cli/src/main.ts", process.argv.slice(2)); // pass all args to the CLI
}
