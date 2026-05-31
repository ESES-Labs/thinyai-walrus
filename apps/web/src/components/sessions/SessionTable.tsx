import { useSessionsStore } from "../../store/sessions.ts";
import { useChatStore } from "../../store/chat.ts";
import { SessionRow } from "./SessionRow.tsx";
import { SearchBar } from "./SearchBar.tsx";

export function SessionTable() {
  const { filteredSessions, sessions, loading, error } = useSessionsStore();
  const { sessionId: activeSessionId } = useChatStore();
  const displayed = filteredSessions();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-6 py-[10px]">
        <span className="text-[10px] text-sub">{sessions.length} sessions</span>
        <SearchBar />
        <button
          onClick={() => void useSessionsStore.getState().fetch()}
          className="ml-auto text-[9px] text-muted transition-colors hover:text-dim"
          title="Refresh"
        >
          ↺
        </button>
      </div>

      <div
        className="grid flex-shrink-0 border-b border-[#161616] px-6 py-[6px]"
        style={{ gridTemplateColumns: "1fr 2fr 80px 80px" }}
      >
        {["SESSION", "LAST MESSAGE", "MSGS", "DATE"].map((h) => (
          <span key={h} className="font-mono text-[9px] uppercase tracking-widest text-muted">
            {h}
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <span className="text-[11px] text-muted">loading...</span>
          </div>
        )}
        {error && (
          <div className="px-6 py-4 text-[11px] text-[#ef4444]">failed to load: {error}</div>
        )}
        {!loading && !error && displayed.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <span className="text-[11px] text-muted">no sessions found</span>
          </div>
        )}
        {displayed.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
          />
        ))}
      </div>
    </div>
  );
}
