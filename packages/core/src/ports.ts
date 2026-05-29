import type { Message, ModelResponse } from "./domain/messages.js";
import type { StreamEvent } from "./domain/stream.js";
import type { Tool } from "./tool.js";

/** PORT: the LLM. Adapters are the only concrete implementations. */
export interface ModelProvider {
  generate(messages: Message[], tools: Tool[]): Promise<ModelResponse>;
  /** Optional streaming. When present + onToken is provided, the loop uses it. */
  stream?(messages: Message[], tools: Tool[]): AsyncIterable<StreamEvent>;
}

/** PORT: conversation memory. The core never knows the storage medium. */
export interface MemoryBackend {
  load(sessionId: string): Promise<Message[]>;
  append(sessionId: string, messages: Message[]): Promise<void>;
}

/** PORT: structured logging / audit sink. */
export interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

/** PORT: human-in-the-loop approval for sensitive tool calls. */
export interface ApprovalRequest {
  tool: string;
  args: unknown;
  reason: string;
}
export type Approver = (req: ApprovalRequest) => Promise<boolean>;
