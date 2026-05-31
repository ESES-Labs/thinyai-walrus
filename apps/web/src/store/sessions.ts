import { create } from "zustand";

export interface Session {
  id: string;
  messageCount: number;
  lastMessage: string;
  updatedAt: number;
}

interface SessionsState {
  sessions: Session[];
  query: string;
  loading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  setQuery: (q: string) => void;
  filteredSessions: () => Session[];
  deleteSession: (id: string) => Promise<void>;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  query: "",
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/sessions");
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
      const data = (await res.json()) as { sessions: Session[] };
      set({ sessions: data.sessions, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  setQuery: (q) => {
    set({ query: q });
  },

  filteredSessions: () => {
    const { sessions, query } = get();
    if (!query.trim()) return sessions;
    const lower = query.toLowerCase();
    return sessions.filter(
      (s) => s.id.toLowerCase().includes(lower) || s.lastMessage.toLowerCase().includes(lower),
    );
  },

  deleteSession: async (id) => {
    await fetch(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== id) }));
  },
}));
