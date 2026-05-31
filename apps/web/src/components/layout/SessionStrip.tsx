import { useChatStore } from "../../store/chat.ts";

export function SessionStrip() {
  const { sessionId, messages, newSession } = useChatStore();

  return (
    <div className="flex flex-shrink-0 items-center border-b border-[#1a1a1a] bg-strip px-4 py-[6px]">
      <span className="font-mono text-[9px] text-muted">
        session: <span className="text-sub">{sessionId}</span>
      </span>
      <span className="mx-3 text-[9px] text-muted">·</span>
      <span className="text-[9px] text-muted">{messages.length} messages</span>
      <button
        onClick={newSession}
        className="ml-auto rounded border border-border px-2 py-[3px] font-mono text-[9px] text-mid transition-colors hover:border-[#333] hover:text-sub"
      >
        + new
      </button>
    </div>
  );
}
