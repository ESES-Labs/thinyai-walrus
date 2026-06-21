#!/usr/bin/env node
// Unified `thiny` launcher. Symlinked onto PATH by install.sh; resolves its own
// repo via the symlink and runs the heads through tsx (same as the pnpm scripts).
// Config lives in ~/.thiny/config.json — NO .env needed; the launcher translates
// it into the env vars the heads already read.
// ponytail: zero deps — stdlib readline for prompts, config.json -> env bridge keeps heads unchanged.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, realpathSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import readline from "node:readline";

const self = realpathSync(fileURLToPath(import.meta.url)); // follow the PATH symlink
const repo = resolve(dirname(self), "..");                 // bin/ -> repo root
const version = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version;

const THINY_DIR = join(homedir(), ".thiny");
const CONFIG = join(THINY_DIR, "config.json");
const REPO_ENV = join(repo, ".env"); // dev fallback only

const HEADS = {
  web: "heads/http/src/main.ts",
  daemon: "heads/daemon/src/main.ts",
  "walrus-demo": "heads/walrus-demo/src/main.ts",
};

// ── config ───────────────────────────────────────────────────────────────────
function loadConfig() {
  return existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : null;
}
function saveConfig(cfg) {
  mkdirSync(THINY_DIR, { recursive: true });
  chmodSync(THINY_DIR, 0o700);
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
  chmodSync(CONFIG, 0o600); // holds API key + Sui private key — keep it owner-only.
}
// config.json -> env vars the heads expect.
function configToEnv(c) {
  const e = {};
  if (!c) return e;
  if (c.model) e.THINY_MODEL = c.model;
  if (c.apiKey) {
    if (c.model?.startsWith("anthropic")) e.THINY_ANTHROPIC_API_KEY = c.apiKey;
    else e.THINY_OPENAI_API_KEY = c.apiKey;
  }
  if (c.baseUrl) e.THINY_OPENAI_BASE_URL = c.baseUrl;
  if (c.agentName) e.THINY_PERSONA_NAME = c.agentName;
  if (c.userId) e.THINY_USER_ID = c.userId;
  if (c.sui?.network) {
    e.SUI_NETWORK = c.sui.network;
    if (c.sui.network === "mainnet") e.SUI_ALLOW_MAINNET = "1";
  }
  const sk = c.sui?.wallet?.secretKey;
  if (sk) { e.SUI_SECRET_KEY = sk; e.THINY_SUI_SECRET_KEY = sk; }
  if (c.sui?.rillMcpUrl) e.MCP_URL = c.sui.rillMcpUrl;
  return e;
}

// ── prompts (stdlib) ───────────────────────────────────────────────────────────
// node's rl.question() hangs on the 2nd sequential read from piped stdin, so we
// consume `line` events into a queue and write prompts ourselves. One shared
// interface for the whole flow; close it before spawning a head so the child owns stdin.
let _rl, _buf = [], _waiters = [], _mask = false;
function initRl() {
  if (_rl) return;
  _rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });
  _rl.on("line", (l) => (_waiters.length ? _waiters.shift()(l) : _buf.push(l)));
  _rl.on("close", () => { _waiters.forEach((w) => w(undefined)); _waiters = []; });
  const orig = _rl._writeToOutput?.bind(_rl); // mask echoed chars during askSecret (TTY only)
  if (orig) _rl._writeToOutput = (s) => orig(_mask ? s.replace(/[^\r\n]/g, "*") : s);
}
function nextLine() { return _buf.length ? Promise.resolve(_buf.shift()) : new Promise((r) => _waiters.push(r)); }
function closeRl() { if (_rl) { _rl.close(); _rl = undefined; _buf = []; _waiters = []; } }
async function ask(query, def = "") {
  initRl();
  process.stdout.write(def ? `${query} (${def}): ` : `${query}: `);
  const a = ((await nextLine()) ?? "").trim();
  return a || def;
}
async function askSecret(query) {
  initRl();
  process.stdout.write(`${query}: `);
  _mask = true; // ponytail: masks typed chars; backspace cursor handling is imperfect, fine for paste
  const a = ((await nextLine()) ?? "").trim();
  _mask = false;
  if (process.stdin.isTTY) process.stdout.write("\n");
  return a;
}
async function select(query, choices) {
  console.log(`\n${query}`);
  choices.forEach((c, i) => console.log(`  ${i + 1}. ${c.label}`));
  while (true) {
    const a = await ask("Choose", "1");
    const i = Number(a) - 1;
    if (i >= 0 && i < choices.length) return choices[i].value;
    console.log("  Please enter a number from the list.");
  }
}

// ── setup flows ────────────────────────────────────────────────────────────────
const MODELS = [
  { label: "OpenAI · gpt-4o-mini (fast, cheap)", value: { model: "openai:gpt-4o-mini", needsKey: true } },
  { label: "OpenAI · gpt-4o", value: { model: "openai:gpt-4o", needsKey: true } },
  { label: "Anthropic · claude-haiku-4-5", value: { model: "anthropic:claude-haiku-4-5-20251001", needsKey: true } },
  { label: "Anthropic · claude-sonnet-4-6", value: { model: "anthropic:claude-sonnet-4-6", needsKey: true } },
  { label: "Ollama (local, no key)", value: { model: "llama3", baseUrl: "http://localhost:11434/v1", apiKey: "ollama" } },
  { label: "Custom (any OpenAI-compatible endpoint)", value: { custom: true } },
];

async function baseSetup() {
  console.log(`\n  Welcome to Thiny ${version} — let's get you set up.\n`);
  const agentName = await ask("Agent name", "ThinyAI");
  let pick = await select("Pick a model", MODELS);

  const cfg = { agentName, userId: "default" };
  if (pick.custom) {
    cfg.model = await ask("Model id (e.g. mistral-large)");
    cfg.baseUrl = await ask("Base URL (OpenAI-compatible)");
    cfg.apiKey = await askSecret("API key");
  } else {
    cfg.model = pick.model;
    if (pick.baseUrl) cfg.baseUrl = pick.baseUrl;
    cfg.apiKey = pick.apiKey ?? (pick.needsKey ? await askSecret("API key") : undefined);
  }
  saveConfig(cfg);
  console.log(`\n  ✓ Saved ${CONFIG}\n  Run \`thiny\` to start, or \`thiny sui init\` to add Sui capabilities.\n`);
  return cfg;
}

async function suiInit() {
  let cfg = loadConfig();
  if (!cfg) { console.log("  No Thiny config yet — running base setup first.\n"); cfg = await baseSetup(); }

  const network = await select("Sui network (you can change this later)", [
    { label: "Testnet (recommended for testing)", value: "testnet" },
    { label: "Mainnet (real funds)", value: "mainnet" },
  ]);

  const choice = await select("Wallet", [
    { label: "Paste an existing private key (suiprivkey…)", value: "paste" },
    { label: "Generate a new key pair locally", value: "generate" },
    { label: "Agent wallet with on-chain capabilities (Rill)", value: "rill" },
  ]);

  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
  let wallet, address;
  if (choice === "generate" || choice === "rill") {
    const kp = Ed25519Keypair.generate();
    wallet = { type: "generated", secretKey: kp.getSecretKey() };
    address = kp.getPublicKey().toSuiAddress();
    console.log(`\n  ✓ Generated key. Address: ${address}`);
  } else {
    const sk = await askSecret("Paste private key (suiprivkey…)");
    if (!sk.startsWith("suiprivkey")) { console.error("  ✗ Expected a suiprivkey… string."); process.exit(1); }
    wallet = { type: "imported", secretKey: sk };
    address = Ed25519Keypair.fromSecretKey(sk).getPublicKey().toSuiAddress();
    console.log(`  ✓ Imported key. Address: ${address}`);
  }

  cfg.sui = { network, wallet, address };
  if (choice === "rill") {
    // ponytail: Rill pairing isn't automated yet — capture the per-user MCP URL the user got from Rill.
    cfg.sui.rillMcpUrl = await ask("Rill MCP URL (from your Rill agent; leave blank to add later)");
  }
  saveConfig(cfg);

  console.log(`\n  ✓ Sui configured (${network}).`);
  console.log(`  ⚠ Fund this address before sending transactions:\n      ${address}`);
  if (network === "testnet") console.log(`      Faucet: https://faucet.sui.io  (or \`sui client faucet\`)`);
  console.log("");
}

// ── run ──────────────────────────────────────────────────────────────────────
function runHead(entry, args) {
  const env = { ...process.env, ...configToEnv(loadConfig()) };
  const envFile = existsSync(REPO_ENV) ? ["--env-file", REPO_ENV] : []; // dev fallback; config wins
  const child = spawn(process.execPath, [...envFile, "--import", "tsx", join(repo, entry), ...args], {
    stdio: "inherit", cwd: repo, env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
async function ensureSetup() {
  if (!loadConfig()) await baseSetup();
}

function help() {
  console.log(`thiny ${version}

Usage:
  thiny                 Start the interactive CLI agent (runs setup on first use)
  thiny init            Re-run setup (model, agent name, key)
  thiny sui init        Add Sui capabilities (network + wallet)
  thiny web             Start the HTTP server head
  thiny daemon          Start the background runtime head
  thiny walrus-demo     Run the Walrus monitoring demo
  thiny --version       Print version
  thiny help            Show this help

Config: ~/.thiny/config.json  (no .env needed)`);
}

const [sub, sub2] = process.argv.slice(2);
switch (sub) {
  case "init": await baseSetup(); closeRl(); break;
  case "sui": if (sub2 === "init") await suiInit(); else console.log("Usage: thiny sui init"); closeRl(); break;
  case "web": case "daemon": case "walrus-demo":
    await ensureSetup(); closeRl(); runHead(HEADS[sub], process.argv.slice(3)); break;
  case "--version": case "-v": console.log(version); break;
  case "help": case "--help": case "-h": help(); break;
  default:
    await ensureSetup(); closeRl(); runHead("heads/cli/src/main.ts", process.argv.slice(2)); break;
}
