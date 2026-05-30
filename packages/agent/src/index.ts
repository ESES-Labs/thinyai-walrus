/**
 * @thiny/agent — batteries-included entry point for Thiny.
 *
 * Re-exports everything you need to build a Web2 or Web3 AI agent.
 * All packages are listed as peerDependencies — your project controls versions.
 *
 * Intentionally NOT included (install separately):
 * - @thiny/plugin-user-memory — user-specific, brings extra SQLite convention
 * - @thiny/plugin-resilience  — opt-in middleware bundle (upcoming)
 * - @thiny/plugin-knowledge   — RAG with vector store (upcoming)
 */

// Core kernel — types, loop, plugins, middleware, approvers, spawn
export * from "@thiny/core";

// Model adapter — aiSdkModel, loadThinyConfig, modelFromEnv
export * from "@thiny/model-aisdk";

// Logger
export { pinoLogger, type PinoLoggerOptions } from "@thiny/logger-pino";

// Memory
export { sqliteMemory, type SqliteMemoryOptions } from "@thiny/memory-sqlite";

// Web2 plugins
export { webSearchPlugin, type WebSearchOptions } from "@thiny/plugin-web-search";

// Web3 — EVM
export {
  evmPlugin,
  evmTransferRules,
  type EvmPluginOptions,
  type EvmTransferLimits,
} from "@thiny/plugin-evm";
export { viemSigner, type ViemSignerOptions } from "@thiny/signer-viem";

// Web3 — Solana
export {
  solanaPlugin,
  solanaTransferRules,
  type SolanaPluginOptions,
  type SolanaTransferLimits,
} from "@thiny/plugin-solana";

// Eval harness — scriptModel + runEval
export { scriptModel, runEval, type Scenario, type EvalResult } from "@thiny/eval";

// Autonomous runtime
export { Runtime, type Job, type Trigger, type RuntimeOptions } from "@thiny/runtime";

// MCP client adapter
export { mcpPlugin, jsonSchemaToZod, type McpPlugin, type McpStdioOptions } from "@thiny/mcp";
