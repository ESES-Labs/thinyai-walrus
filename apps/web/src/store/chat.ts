import { create } from "zustand";

export type MessageRole = "user" | "agent";

export interface ToolCallInfo {
  name: string;
  args: string;
  result?: string;
  durationMs?: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  toolCalls: ToolCallInfo[];
  createdAt: number;
}

interface ChatState {
  sessionId: string;
  messages: ChatMessage[];
  streaming: boolean;
  partialText: string;

  newSession: () => void;
  setSession: (id: string) => void;
  addUserMessage: (text: string) => string;
  startAgentMessage: () => string;
  appendPartial: (delta: string) => void;
  finalizeStreaming: (messageId: string) => void;
  addToolCall: (messageId: string, tool: ToolCallInfo) => void;
  clearMessages: () => void;
}

function generateId(): string {
  return `msg-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`;
}

function generateSessionId(): string {
  return `web-${String(Date.now())}`;
}

export const useChatStore = create<ChatState>((set) => ({
  sessionId: generateSessionId(),
  messages: [],
  streaming: false,
  partialText: "",

  newSession: () => {
    set({ sessionId: generateSessionId(), messages: [], streaming: false, partialText: "" });
  },

  setSession: (id) => {
    set({ sessionId: id, messages: [], streaming: false, partialText: "" });
  },

  addUserMessage: (text) => {
    const id = generateId();
    const msg: ChatMessage = { id, role: "user", text, toolCalls: [], createdAt: Date.now() };
    set((s) => ({ messages: [...s.messages, msg] }));
    return id;
  },

  startAgentMessage: () => {
    const id = generateId();
    const msg: ChatMessage = { id, role: "agent", text: "", toolCalls: [], createdAt: Date.now() };
    set((s) => ({ messages: [...s.messages, msg], streaming: true, partialText: "" }));
    return id;
  },

  appendPartial: (delta) => {
    set((s) => ({ partialText: s.partialText + delta }));
  },

  finalizeStreaming: (messageId) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, text: s.partialText } : m)),
      streaming: false,
      partialText: "",
    }));
  },

  addToolCall: (messageId, tool) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, toolCalls: [...m.toolCalls, tool] } : m,
      ),
    }));
  },

  clearMessages: () => {
    set({ messages: [] });
  },
}));
