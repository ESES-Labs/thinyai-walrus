import type { ModelMiddleware, ModelNext, ToolMiddleware, ToolNext } from "./middleware.js";

/** Compose model middleware outside-in (first in array wraps everything). */
export function composeModel(mws: ModelMiddleware[], base: ModelNext): ModelNext {
  return mws.reduceRight<ModelNext>((next, mw) => (req) => mw(req, next), base);
}

/** Compose tool middleware outside-in. */
export function composeTool(mws: ToolMiddleware[], base: ToolNext): ToolNext {
  return mws.reduceRight<ToolNext>((next, mw) => (call) => mw(call, next), base);
}
