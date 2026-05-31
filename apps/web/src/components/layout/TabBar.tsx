import { NavLink, useNavigate } from "react-router-dom";
import { useChatStore } from "../../store/chat.ts";

interface TabBarProps {
  modelName?: string;
  connected?: boolean;
}

export function TabBar({ modelName = "thiny", connected = true }: TabBarProps) {
  const { newSession } = useChatStore();
  const navigate = useNavigate();

  function handleNewSession() {
    newSession();
    navigate("/");
  }

  return (
    <div className="flex h-[38px] flex-shrink-0 items-stretch border-b border-border bg-surface">
      <div className="flex items-center border-r border-border px-4">
        <span className="text-[11px] font-bold tracking-wide text-bright">thiny</span>
      </div>

      <div className="flex items-stretch">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-4 text-[11px] transition-colors ${
              isActive ? "-mb-px border-b border-bright text-bright" : "text-mid hover:text-sub"
            }`
          }
        >
          <span>↵</span>
          <span>Chat</span>
        </NavLink>

        <NavLink
          to="/sessions"
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-4 text-[11px] transition-colors ${
              isActive ? "-mb-px border-b border-bright text-bright" : "text-mid hover:text-sub"
            }`
          }
        >
          <span>≡</span>
          <span>Sessions</span>
        </NavLink>
      </div>

      <div className="ml-auto flex items-center gap-3 px-4">
        <div className="flex items-center gap-1.5">
          <div
            className="h-[5px] w-[5px] rounded-full"
            style={{ background: connected ? "#22c55e" : "#555" }}
          />
          <span className="text-[10px] text-mid">{modelName}</span>
        </div>
        <button
          onClick={handleNewSession}
          className="text-[13px] text-muted transition-colors hover:text-dim"
          title="New session"
        >
          ⊕
        </button>
      </div>
    </div>
  );
}
