/**
 * @thiny/agent — batteries-included entry point for Thiny.
 *
 * Re-exports everything you need to build a Web2 or Web3 AI agent.
 * All packages are listed as peerDependencies — your project controls versions.
 *
 * Cross-session memory is Walrus-native by default (`walrusMemoryPlugin`) — no SQLite, portable.
 *
 * Intentionally NOT included (install separately):
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
export {
  memwalMemory,
  memwalFactsPlugin,
  finalizeSessionToMemwal,
  type MemwalMemoryOptions,
  type MemwalFactsOptions,
  type FinalizeMemwalOptions,
  type MemWalCreds,
  type MemWalLike,
  type MemWalRecall,
  type MemWalRememberResult,
  type MemwalStoreRef,
} from "@thiny/memory-memwal";

// Walrus — verifiable audit trail + artifact store on Walrus
export {
  walrusClient,
  walrusAuditLogger,
  verifyAuditTrail,
  walrusArtifacts,
  walrusMemory,
  walrusMemoryPlugin,
  inMemoryPointerStore,
  filePointerStore,
  moveObjectPointerStore,
  walruscanBlobUrl,
  suiscanObjectUrl,
  suiscanTxUrl,
  explorerLinks,
  type WalrusClient,
  type WalrusClientOptions,
  type WalrusNetwork,
  type WalrusBlobRef,
  type ExplorerLinks,
  type WalrusAuditLogger,
  type WalrusAuditOptions,
  type AuditEntry,
  type AuditManifest,
  type WalrusArtifacts,
  type PointerStore,
  type WalrusMemoryOptions,
  type WalrusMemoryRef,
  type WalrusMemoryPluginOptions,
  type WalrusFacts,
  type MemoryHeadLike,
} from "@thiny/walrus";

// Sui — on-chain memory-head pointer (verifiable + portable)
export {
  suiMemoryHead,
  type SuiMemoryHead,
  type SuiMemoryHeadOptions,
  type MemoryHeadPointers,
} from "@thiny/signer-sui";

// Multi-agent — sub-agent delegation + planning tools
export {
  agentsPlugin,
  PLAN_STATE_KEY,
  type AgentsPluginOptions,
  type SubagentDef,
  type PlanStep,
  type PlanStatus,
} from "@thiny/plugin-agents";

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
