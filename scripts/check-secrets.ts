#!/usr/bin/env node
/**
 * check-secrets.ts — grep-based scan for secret-shaped literals in tracked source.
 *
 * Run:  pnpm tsx scripts/check-secrets.ts
 *
 * Scans .ts, .tsx, .js, .json files (excluding node_modules, dist, .git).
 * Flags patterns like private keys, API keys, and hex strings that look like secrets.
 */

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Patterns that suggest secrets in source code (case-insensitive)
const SECRET_PATTERNS = [
  // Private keys (hex or base64)
  "0x[a-fA-F0-9]{64}",
  // Common env var patterns hardcoded
  "AGENT_PRIVATE_KEY\\s*[=:]\\s*['\"`]0x",
  "PRIVATE_KEY\\s*[=:]\\s*['\"`]0x",
  "API_KEY\\s*[=:]\\s*['\"`][a-zA-Z0-9_-]{20,}['\"`]",
  "SECRET\\s*[=:]\\s*['\"`][a-zA-Z0-9_-]{12,}['\"`]",
  // OpenAI-style keys
  "sk-[a-zA-Z0-9]{20,}",
  // Solana private key arrays
  "\\[[0-9,\\s]{50,}\\].*private",
  // Mnemonic phrases (12+ words)
  '"[a-z]+\\s[a-z]+\\s[a-z]+\\s[a-z]+\\s[a-z]+\\s[a-z]+\\s[a-z]+\\s[a-z]+\\s[a-z]+\\s[a-z]+\\s[a-z]+\\s[a-z]+"',
] as const;

const errors: string[] = [];

for (const pattern of SECRET_PATTERNS) {
  const result = spawnSync("grep", [
    "-rnI",
    "--include=*.ts",
    "--include=*.tsx",
    "--include=*.js",
    "--exclude-dir=node_modules",
    "--exclude-dir=dist",
    "--exclude-dir=.git",
    "--exclude-dir=.changeset",
    "--exclude=*.test.ts",
    "--exclude=vitest.config.ts",
    pattern,
    ROOT,
  ], { encoding: "utf-8" });

  if (result.status === 0 && result.stdout.trim()) {
    const lines = result.stdout.trim().split("\n");
    errors.push(
      `Pattern "${pattern}" matched ${lines.length} file(s):\n  ${lines.slice(0, 5).join("\n  ")}`,
    );
  }
}

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} potential secret(s) found in source:\n`);
  errors.forEach((e) => console.error(`   ${e}`));
  console.error("\n⚠  Review each match — some may be test fixtures or false positives.");
  console.error("   If a match is a false positive, add a comment with 'nosec' on that line.\n");
  process.exit(1);
}

console.log("✓ No secret-shaped literals found in tracked source.");
