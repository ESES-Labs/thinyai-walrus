/**
 * @thiny/agent — batteries-included entry point for Thiny.
 *
 * Re-exports everything you need to build an agent in one import:
 *
 * ```ts
 * import {
 *   createAgent,      // from @thiny/core
 *   loadThinyConfig,  // from @thiny/model-aisdk
 *   pinoLogger,       // from @thiny/logger-pino
 *   sqliteMemory,     // from @thiny/memory-sqlite
 *   webSearchPlugin,  // from @thiny/plugin-web-search
 *   policyMiddleware, // from @thiny/core
 *   defineTool,       // from @thiny/core
 * } from "@thiny/agent";
 * ```
 *
 * All packages are listed as peerDependencies — your project controls the
 * actual versions. This package itself has zero runtime code.
 */

// ── Kernel — types, loop, plugins, middleware, approvers, spawn ─────────────
export * from "@thiny/core";

// ── Model adapter — aiSdkModel, loadThinyConfig, modelFromEnv ───────────────
export * from "@thiny/model-aisdk";

// ── Logger ───────────────────────────────────────────────────────────────────
export { pinoLogger, type PinoLoggerOptions } from "@thiny/logger-pino";

// ── Memory ───────────────────────────────────────────────────────────────────
export { sqliteMemory, type SqliteMemoryOptions } from "@thiny/memory-sqlite";

// ── Plugins ──────────────────────────────────────────────────────────────────
export { webSearchPlugin, type WebSearchOptions } from "@thiny/plugin-web-search";
