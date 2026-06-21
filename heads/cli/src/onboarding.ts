/**
 * First-run setup + config for the `thiny` CLI. Config lives in ~/.thiny/config.json (chmod 0600)
 * and is translated into the THINY_ / SUI_ env vars the agent already reads — no .env required.
 * Uses @clack/prompts for arrow-key selects (like opencode / Claude Code).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";

export interface ThinyConfig {
  agentName?: string;
  userId?: string;
  /** Configured LLM providers; switch between them with /connect, change models with /models. */
  providers?: ModelProviderConfig[];
  /** id of the provider currently in use. */
  activeProviderId?: string;
  // ── legacy single-provider shape (migrated on read) ──
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  sui?: {
    network: string;
    /** All known agent wallets (local keys). */
    wallets?: SuiWallet[];
    /** Address of the wallet the signer currently uses. */
    activeAddress?: string;
    /** Rill MCP signer URL (keyless builder; its wallet is managed by Rill). */
    rillMcpUrl?: string;
    // ── legacy single-wallet shape (pre-multi-wallet) — migrated on read ──
    wallet?: { type: string; secretKey: string };
    address?: string;
  };
}

/** A configured LLM provider + its selected model. */
export interface ModelProviderConfig {
  /** Stable id, e.g. "openai", "anthropic", "ollama", or a custom name. */
  id: string;
  /** Human label for menus. */
  label: string;
  /** Model string passed to the model layer, e.g. "openai:gpt-4o-mini" or a bare id. */
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

/** A locally-held Sui wallet (agent wallet). */
export interface SuiWallet {
  label: string;
  address: string;
  secretKey: string;
  source: string; // "generated" | "imported"
}

const THINY_DIR = join(homedir(), ".thiny");
const CONFIG = join(THINY_DIR, "config.json");

export function version(): string {
  try {
    const pkg = join(dirname(fileURLToPath(import.meta.url)), "../package.json");
    return (JSON.parse(readFileSync(pkg, "utf8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function loadConfig(): ThinyConfig | null {
  return existsSync(CONFIG) ? (JSON.parse(readFileSync(CONFIG, "utf8")) as ThinyConfig) : null;
}

export function saveConfig(cfg: ThinyConfig): void {
  mkdirSync(THINY_DIR, { recursive: true });
  chmodSync(THINY_DIR, 0o700);
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
  chmodSync(CONFIG, 0o600); // holds API key + Sui private key — owner-only.
}

/** Apply config.json onto process.env so the agent picks it up. Existing env vars win (dev .env). */
export function applyConfig(cfg: ThinyConfig | null): void {
  if (!cfg) return;
  const set = (k: string, v: string | undefined): void => {
    if (v && !process.env[k]) process.env[k] = v;
  };
  const prov = activeProvider(cfg);
  if (prov) {
    set("THINY_MODEL", prov.model);
    if (prov.apiKey) {
      set(prov.model.startsWith("anthropic") ? "THINY_ANTHROPIC_API_KEY" : "THINY_OPENAI_API_KEY", prov.apiKey);
    }
    set("THINY_OPENAI_BASE_URL", prov.baseUrl);
  }
  set("THINY_PERSONA_NAME", cfg.agentName);
  set("THINY_USER_ID", cfg.userId);
  if (cfg.sui?.network) {
    set("SUI_NETWORK", cfg.sui.network);
    if (cfg.sui.network === "mainnet") set("SUI_ALLOW_MAINNET", "1");
  }
  const active = activeSuiWallet(cfg);
  if (active) {
    set("SUI_SECRET_KEY", active.secretKey);
    set("THINY_SUI_SECRET_KEY", active.secretKey);
  }
  set("MCP_URL", cfg.sui?.rillMcpUrl);
}

/** All agent wallets, migrating the legacy single-wallet shape transparently. */
export function suiWalletsOf(cfg: ThinyConfig | null): SuiWallet[] {
  const s = cfg?.sui;
  if (!s) return [];
  if (s.wallets && s.wallets.length > 0) return s.wallets;
  if (s.wallet && s.address) {
    return [{ label: "default", address: s.address, secretKey: s.wallet.secretKey, source: s.wallet.type }];
  }
  return [];
}

/** The wallet the signer should use (the active one, or the first). */
export function activeSuiWallet(cfg: ThinyConfig | null): SuiWallet | undefined {
  const all = suiWalletsOf(cfg);
  const active = cfg?.sui?.activeAddress ?? cfg?.sui?.address;
  return all.find((w) => w.address === active) ?? all[0];
}

/** Add (or replace by address) an agent wallet and persist; optionally make it active. */
export function saveSuiWallet(
  cfg: ThinyConfig,
  network: string,
  wallet: SuiWallet,
  makeActive: boolean,
): void {
  cfg.sui ??= { network };
  cfg.sui.network = network;
  const all = suiWalletsOf(cfg).filter((w) => w.address !== wallet.address);
  all.push(wallet);
  cfg.sui.wallets = all;
  delete cfg.sui.wallet; // drop legacy mirror now that we track a list
  delete cfg.sui.address;
  if (makeActive || !cfg.sui.activeAddress) cfg.sui.activeAddress = wallet.address;
  saveConfig(cfg);
}

/** All configured providers, migrating the legacy single-provider shape transparently. */
export function providersOf(cfg: ThinyConfig | null): ModelProviderConfig[] {
  if (!cfg) return [];
  if (cfg.providers && cfg.providers.length > 0) return cfg.providers;
  if (cfg.model) {
    const id = cfg.model.startsWith("anthropic")
      ? "anthropic"
      : cfg.baseUrl
        ? "custom"
        : "openai";
    return [{ id, label: cfg.model, model: cfg.model, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }];
  }
  return [];
}

/** The provider the model layer should use (active, or first). */
export function activeProvider(cfg: ThinyConfig | null): ModelProviderConfig | undefined {
  const all = providersOf(cfg);
  return all.find((x) => x.id === cfg?.activeProviderId) ?? all[0];
}

/** Add (or replace by id) a provider and persist; optionally make it active. */
export function saveProvider(cfg: ThinyConfig, provider: ModelProviderConfig, makeActive: boolean): void {
  const all = providersOf(cfg).filter((x) => x.id !== provider.id);
  all.push(provider);
  cfg.providers = all;
  delete cfg.model; // drop legacy mirror now that we track a list
  delete cfg.apiKey;
  delete cfg.baseUrl;
  if (makeActive || !cfg.activeProviderId) cfg.activeProviderId = provider.id;
  saveConfig(cfg);
}

/** Switch the active provider by id; returns the provider or undefined if unknown. */
export function setActiveProvider(cfg: ThinyConfig, id: string): ModelProviderConfig | undefined {
  const prov = providersOf(cfg).find((x) => x.id === id);
  if (!prov) return undefined;
  cfg.providers = providersOf(cfg); // persist the migrated list too
  cfg.activeProviderId = id;
  saveConfig(cfg);
  return prov;
}

function bail<T>(v: T | symbol): T {
  if (p.isCancel(v)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return v;
}

interface ModelChoice {
  value: string;
  label: string;
  hint?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  needsKey?: boolean;
  custom?: boolean;
}

const MODELS: ModelChoice[] = [
  { value: "oai-mini", label: "OpenAI · gpt-4o-mini", hint: "fast, cheap", model: "openai:gpt-4o-mini", needsKey: true },
  { value: "oai-4o", label: "OpenAI · gpt-4o", model: "openai:gpt-4o", needsKey: true },
  { value: "claude-haiku", label: "Anthropic · claude-haiku-4-5", model: "anthropic:claude-haiku-4-5-20251001", needsKey: true },
  { value: "claude-sonnet", label: "Anthropic · claude-sonnet-4-6", model: "anthropic:claude-sonnet-4-6", needsKey: true },
  { value: "ollama", label: "Ollama", hint: "local, no key", model: "llama3", baseUrl: "http://localhost:11434/v1", apiKey: "ollama" },
  { value: "custom", label: "Custom", hint: "any OpenAI-compatible endpoint", custom: true },
];

export async function baseSetup(): Promise<ThinyConfig> {
  p.intro(`Thiny ${version()} — setup`);
  const agentName = bail(
    await p.text({ message: "Agent name", placeholder: "ThinyAI", defaultValue: "ThinyAI" }),
  );
  const choice = bail(
    await p.select({ message: "Pick a model", options: MODELS.map(({ value, label, hint }) => ({ value, label, hint })) }),
  );
  const pick = MODELS.find((m) => m.value === choice);
  if (!pick) throw new Error(`unknown model choice: ${choice}`);

  const cfg: ThinyConfig = loadConfig() ?? {};
  cfg.agentName = agentName;
  cfg.userId ??= "default";
  let provider: ModelProviderConfig;
  if (pick.custom) {
    const model = bail(
      await p.text({ message: "Model id", placeholder: "e.g. MiniMax-M3", validate: (v) => (v ? undefined : "Required") }),
    );
    const baseUrl = bail(
      await p.text({
        message: "Base URL (OpenAI-compatible)",
        placeholder: "https://api.example.com/v1",
        validate: (v) => (v && /^https?:\/\//.test(v) ? undefined : "Must start with http(s)://"),
      }),
    );
    const apiKey = bail(await p.password({ message: "API key" }));
    provider = { id: model, label: model, model, baseUrl, apiKey };
  } else {
    const apiKey = pick.apiKey ?? (pick.needsKey ? bail(await p.password({ message: "API key" })) : undefined);
    provider = { id: pick.value, label: pick.label, model: pick.model ?? "", baseUrl: pick.baseUrl, apiKey };
  }
  saveProvider(cfg, provider, true);
  p.outro(`Saved ${CONFIG} — run \`thiny\` to start, or \`thiny sui init\` for Sui.`);
  return cfg;
}

export async function suiInit(): Promise<void> {
  let cfg = loadConfig();
  cfg ??= await baseSetup();

  p.intro("Thiny — Sui setup");
  const network = bail(
    await p.select({
      message: "Sui network (you can change this later)",
      options: [
        { value: "testnet", label: "Testnet", hint: "recommended for testing" },
        { value: "mainnet", label: "Mainnet", hint: "real funds" },
      ],
    }),
  );
  const choice = bail(
    await p.select({
      message: "Wallet",
      options: [
        { value: "paste", label: "Paste an existing private key", hint: "suiprivkey…" },
        { value: "generate", label: "Generate a new key pair locally" },
        { value: "rill", label: "Agent wallet with on-chain capabilities", hint: "Rill" },
      ],
    }),
  );

  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
  let wallet: { type: string; secretKey: string };
  let address: string;
  if (choice === "generate" || choice === "rill") {
    const kp = Ed25519Keypair.generate();
    wallet = { type: "generated", secretKey: kp.getSecretKey() };
    address = kp.getPublicKey().toSuiAddress();
  } else {
    const sk = bail(
      await p.password({
        message: "Private key (suiprivkey…)",
        validate: (v) => (v?.startsWith("suiprivkey") ? undefined : "Expected a suiprivkey… string"),
      }),
    );
    wallet = { type: "imported", secretKey: sk };
    address = Ed25519Keypair.fromSecretKey(sk).getPublicKey().toSuiAddress();
  }

  saveSuiWallet(cfg, network, { label: choice, address, secretKey: wallet.secretKey, source: wallet.type }, true);
  if (choice === "rill") {
    const url = bail(
      await p.text({ message: "Rill MCP URL", placeholder: "leave blank to add later", defaultValue: "" }),
    );
    if (url && cfg.sui) {
      cfg.sui.rillMcpUrl = url;
      saveConfig(cfg);
    }
  }

  const faucet = network === "testnet" ? "\nFaucet: https://faucet.sui.io  (or `sui client faucet`)" : "";
  p.note(`${address}${faucet}`, `⚠ Fund this address (${network}) before sending transactions`);
  p.outro(`Sui configured (${network}).`);
}

/** Run first-time setup unless a config exists or a model is already set via env (dev `.env`). */
export async function ensureSetup(): Promise<void> {
  if (loadConfig() || process.env.THINY_MODEL) return;
  await baseSetup();
}
