#!/usr/bin/env node
// Unified `thiny` launcher. Symlinked onto PATH by install.sh; resolves its own
// repo via the symlink and runs the heads through tsx (same as the pnpm scripts).
// Config lives in ~/.thiny/config.json — NO .env needed; the launcher translates
// it into the env vars the heads already read.
// Onboarding uses @clack/prompts for arrow-key selects; config.json -> env bridge keeps heads unchanged.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, realpathSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import * as p from "@clack/prompts";

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

// ── prompts (@clack/prompts — arrow-key selects) ─────────────────────────────────
// Any prompt returns a symbol on Ctrl-C; bail() turns that into a clean exit.
function bail(v) {
  if (p.isCancel(v)) { p.cancel("Cancelled."); process.exit(0); }
  return v;
}

// ── setup flows ────────────────────────────────────────────────────────────────
const MODELS = [
  { value: "oai-mini", label: "OpenAI · gpt-4o-mini", hint: "fast, cheap", model: "openai:gpt-4o-mini", needsKey: true },
  { value: "oai-4o", label: "OpenAI · gpt-4o", model: "openai:gpt-4o", needsKey: true },
  { value: "claude-haiku", label: "Anthropic · claude-haiku-4-5", model: "anthropic:claude-haiku-4-5-20251001", needsKey: true },
  { value: "claude-sonnet", label: "Anthropic · claude-sonnet-4-6", model: "anthropic:claude-sonnet-4-6", needsKey: true },
  { value: "ollama", label: "Ollama", hint: "local, no key", model: "llama3", baseUrl: "http://localhost:11434/v1", apiKey: "ollama" },
  { value: "custom", label: "Custom", hint: "any OpenAI-compatible endpoint", custom: true },
];

async function baseSetup() {
  p.intro(`Thiny ${version} — setup`);
  const agentName = bail(await p.text({ message: "Agent name", placeholder: "ThinyAI", defaultValue: "ThinyAI" }));
  const choice = bail(await p.select({
    message: "Pick a model",
    options: MODELS.map(({ value, label, hint }) => ({ value, label, hint })),
  }));
  const pick = MODELS.find((m) => m.value === choice);

  const cfg = { agentName, userId: "default" };
  if (pick.custom) {
    cfg.model = bail(await p.text({ message: "Model id", placeholder: "e.g. MiniMax-M3", validate: (v) => (v ? undefined : "Required") }));
    cfg.baseUrl = bail(await p.text({ message: "Base URL (OpenAI-compatible)", placeholder: "https://api.example.com/v1", validate: (v) => (/^https?:\/\//.test(v) ? undefined : "Must start with http(s)://") }));
    cfg.apiKey = bail(await p.password({ message: "API key" }));
  } else {
    cfg.model = pick.model;
    if (pick.baseUrl) cfg.baseUrl = pick.baseUrl;
    cfg.apiKey = pick.apiKey ?? (pick.needsKey ? bail(await p.password({ message: "API key" })) : undefined);
  }
  saveConfig(cfg);
  p.outro(`Saved ${CONFIG} — run \`thiny\` to start, or \`thiny sui init\` for Sui.`);
  return cfg;
}

async function suiInit() {
  let cfg = loadConfig();
  if (!cfg) cfg = await baseSetup();

  p.intro("Thiny — Sui setup");
  const network = bail(await p.select({
    message: "Sui network (you can change this later)",
    options: [
      { value: "testnet", label: "Testnet", hint: "recommended for testing" },
      { value: "mainnet", label: "Mainnet", hint: "real funds" },
    ],
  }));
  const choice = bail(await p.select({
    message: "Wallet",
    options: [
      { value: "paste", label: "Paste an existing private key", hint: "suiprivkey…" },
      { value: "generate", label: "Generate a new key pair locally" },
      { value: "rill", label: "Agent wallet with on-chain capabilities", hint: "Rill" },
    ],
  }));

  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
  let wallet, address;
  if (choice === "generate" || choice === "rill") {
    const kp = Ed25519Keypair.generate();
    wallet = { type: "generated", secretKey: kp.getSecretKey() };
    address = kp.getPublicKey().toSuiAddress();
  } else {
    const sk = bail(await p.password({ message: "Private key (suiprivkey…)", validate: (v) => (v.startsWith("suiprivkey") ? undefined : "Expected a suiprivkey… string") }));
    wallet = { type: "imported", secretKey: sk };
    address = Ed25519Keypair.fromSecretKey(sk).getPublicKey().toSuiAddress();
  }

  cfg.sui = { network, wallet, address };
  if (choice === "rill") {
    // ponytail: Rill pairing isn't automated yet — capture the per-user MCP URL the user got from Rill.
    const url = bail(await p.text({ message: "Rill MCP URL", placeholder: "leave blank to add later", defaultValue: "" }));
    if (url) cfg.sui.rillMcpUrl = url;
  }
  saveConfig(cfg);

  const faucet = network === "testnet" ? "\nFaucet: https://faucet.sui.io  (or `sui client faucet`)" : "";
  p.note(`${address}${faucet}`, `⚠ Fund this address (${network}) before sending transactions`);
  p.outro(`Sui configured (${network}).`);
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
  case "init": await baseSetup(); break;
  case "sui": if (sub2 === "init") await suiInit(); else console.log("Usage: thiny sui init"); break;
  case "web": case "daemon": case "walrus-demo":
    await ensureSetup(); runHead(HEADS[sub], process.argv.slice(3)); break;
  case "--version": case "-v": console.log(version); break;
  case "help": case "--help": case "-h": help(); break;
  default:
    await ensureSetup(); runHead("heads/cli/src/main.ts", process.argv.slice(2)); break;
}
