import { useNavigate } from "react-router-dom";
import { useChatStore } from "../../store/chat.ts";
import type { Session } from "../../store/sessions.ts";

interface SessionRowProps {
  session: Session;
  isActive: boolean;
}

function relativeTime(ms: number): string {
  const diffMins = Math.floor((Date.now() - ms) / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${String(diffMins)}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${String(diffHours)}h ago`;
  return `${String(Math.floor(diffHours / 24))}d ago`;
}

export function SessionRow({ session, isActive }: SessionRowProps) {
  const navigate = useNavigate();
  const { setSession } = useChatStore();

  function handleClick() {
    setSession(session.id);
    navigate("/");
  }

  return (
    <div
      onClick={handleClick}
      className={`grid cursor-pointer items-center border-b border-[#161616] px-6 py-[10px] transition-colors ${
        isActive ? "bg-strip" : "hover:bg-[#0e0e0e]"
      }`}
      style={{ gridTemplateColumns: "1fr 2fr 80px 80px" }}
    >
      <div className="flex items-center gap-1.5">
        {isActive && <div className="h-[5px] w-[5px] flex-shrink-0 rounded-full bg-[#22c55e]" />}
        <span
          className={`font-mono text-[10px] ${isActive ? "text-sub" : "text-mid"}`}
          style={{ paddingLeft: isActive ? 0 : "11px" }}
        >
          {session.id}
        </span>
      </div>

      <div className="overflow-hidden text-ellipsis whitespace-nowrap pr-4 text-[10px] text-dim">
        {session.lastMessage || <span className="italic text-muted">empty</span>}
      </div>

      <span className="text-[10px] text-muted">{session.messageCount}</span>
      <span className="text-[10px] text-muted">{relativeTime(session.updatedAt)}</span>
    </div>
  );
}
