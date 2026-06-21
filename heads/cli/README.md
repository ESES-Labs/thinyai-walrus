# thinyai

> A beautiful terminal AI agent — interactive chat, tools, cross-session memory on **Walrus**, and grounded **Sui** execution. The command is `thiny`.

[![npm](https://img.shields.io/npm/v/thinyai)](https://www.npmjs.com/package/thinyai)

```text
 _____ _     _                _    ___
|_   _| |__ (_)_ __  _   _   / \  |_ _|
  | | | '_ \| | '_ \| | | | / _ \  | |
  | | | | | | | | | | |_| |/ ___ \ | |
  |_| |_| |_|_|_| |_|\__, /_/   \_\___|
                     |___/
```

---

## Install

```bash
bun add -g thinyai      # or:  npm i -g thinyai   /   pnpm add -g thinyai
```

This installs one command: **`thiny`**. No `.env`, no config files to hand-edit — the first run sets you up.

```bash
thiny                   # first launch runs setup, then starts chatting
```

---

## Commands

| Command | What it does |
|---|---|
| `thiny` | Start the interactive agent. Runs first-time setup if needed. |
| `thiny init` | (Re)run base setup — pick a model + agent name + API key. |
| `thiny sui init` | Add Sui on-chain capabilities — pick a network + wallet. |
| `thiny help` | Show all commands. |
| `thiny --version` | Print the version. |

Everything is saved to **`~/.thiny/config.json`** (chmod `0600` — it holds your API key and any Sui key). No `.env` required.

---

## First run / `thiny init`

The first time you run `thiny` (or any time you run `thiny init`), an arrow-key wizard asks:

1. **Agent name** — what the assistant calls itself (default `ThinyAI`).
2. **Model** — pick from the list, or **Custom** for any OpenAI-compatible endpoint:

   | Choice | Notes |
   |---|---|
   | OpenAI · gpt-4o-mini | fast, cheap |
   | OpenAI · gpt-4o | |
   | Anthropic · claude-haiku-4-5 | |
   | Anthropic · claude-sonnet-4-6 | |
   | Ollama | local, no key (`http://localhost:11434/v1`) |
   | Custom | enter model id + base URL + key — works with Groq, Together, OpenRouter, LM Studio, vLLM, Mimo, Azure, … |

3. **API key** — pasted securely (masked); skipped for keyless setups like Ollama.

That's it — `thiny` starts.

---

## Sui setup / `thiny sui init`

Adds grounded, capped on-chain execution. If you haven't run base setup yet, this runs it first.

1. **Network** — `Testnet` (recommended) or `Mainnet`. You can change this later by re-running `thiny sui init`.
2. **Wallet** — choose one:

   | Option | What happens |
   |---|---|
   | **Paste an existing private key** | Enter a `suiprivkey…` key (masked). |
   | **Generate a new key pair locally** | A fresh Ed25519 key is created and stored in your config. |
   | **Agent wallet (Rill)** | Generates a signer key and stores your per-user Rill MCP URL for grounded execution. |

After setup it prints your **address** — you must **fund it** before sending transactions:

```text
⚠ Fund this address (testnet) before sending transactions
  0xabc…
  Faucet: https://faucet.sui.io   (or `sui client faucet`)
```

> Mainnet is gated: the signer refuses to sign on mainnet unless explicitly enabled, and per-tx / budget / expiry caps are enforced **on-chain** by the agent-wallet contract — the local policy is only a soft UX layer.

---

## In-chat commands

While chatting, type a slash command:

| Command | Description |
|---|---|
| `/new` | Start a fresh session (long-term memory carries over). |
| `/tools` | List available tools. |
| `/skills` | List available skills. |
| `/session` | Show the current session id. |
| `/stats` | Session totals (turns, tokens, tool calls). |
| `/verify <blobId>` | Re-fetch and replay a stored Walrus audit trail. |
| `/clear` | Clear the screen. |
| `/help` | Show these commands. |

Press **Ctrl-D** (or Ctrl-C) to exit.

---

## Memory (Walrus)

Thiny remembers across sessions. Durable facts about you are stored on **Walrus** (content-addressed, verifiable, portable — not locked to one machine) and auto-injected at the start of each conversation. When a fact is saved you'll see a compact, verifiable line:

```text
✓ memory saved on Walrus · https://walruscan.com/testnet/blob/…
```

Writes are non-blocking — you can keep chatting while they upload. Set `MEMWAL_*` env vars to use MemWal (semantic memory) instead.

---

## Output

Responses render as **markdown** in the terminal — bold, italics, `inline code`, lists, headings, blockquotes, fenced code blocks, and clickable `[links](url)`. Model reasoning (`<think>…</think>`) streams dimmed.

---

## Config reference

`~/.thiny/config.json`:

```jsonc
{
  "agentName": "ThinyAI",
  "userId": "default",
  "model": "openai:gpt-4o-mini",   // or "anthropic:…", or a bare id with baseUrl
  "baseUrl": "https://…/v1",        // optional — for OpenAI-compatible endpoints
  "apiKey": "sk-…",
  "sui": {                          // present after `thiny sui init`
    "network": "testnet",
    "address": "0x…",
    "wallet": { "type": "generated", "secretKey": "suiprivkey…" },
    "rillMcpUrl": "https://…"       // optional — Rill agent wallet
  }
}
```

Environment variables override the config when set (handy for CI/dev): `THINY_MODEL`, `THINY_OPENAI_API_KEY`, `THINY_ANTHROPIC_API_KEY`, `THINY_OPENAI_BASE_URL`, `THINY_PERSONA_NAME`, `THINY_USER_ID`, `SUI_NETWORK`, `SUI_SECRET_KEY`, `MCP_URL`.

---

## Troubleshooting

- **`(model returned empty response)` / API error** — wrong model id, base URL, or key. Re-run `thiny init`, or edit `~/.thiny/config.json`. The CLI prints the underlying provider error.
- **Transactions fail** — make sure the address from `thiny sui init` is funded.
- **Logs** — written to `~/.thiny/cli.log` (never to the chat). Tail with `tail -f ~/.thiny/cli.log`.

---

*Part of the [Thiny](https://github.com/ESES-Labs/thinyai-walrus) framework — a tiny, hexagonal agent kernel for Web2 + Web3.*
