import { useRef, type KeyboardEvent } from "react";
import { useChatStore } from "../../store/chat.ts";
import { sendMessage } from "../../api/agent.ts";

export function InputBar() {
  const { sessionId, streaming } = useChatStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  function handleSubmit() {
    const text = textareaRef.current?.value.trim();
    if (!text || streaming) return;
    if (textareaRef.current) textareaRef.current.value = "";
    controllerRef.current?.abort();
    controllerRef.current = sendMessage(text, sessionId);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-t border-[#1a1a1a] px-4 py-[10px]">
      <div className="flex flex-1 items-center gap-2 rounded border border-border bg-strip px-3 py-2">
        <span className="select-none text-[11px] text-muted">›</span>
        <textarea
          ref={textareaRef}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          placeholder="ask thiny anything..."
          rows={1}
          className="flex-1 resize-none bg-transparent text-[11px] text-primary placeholder-muted outline-none disabled:opacity-50"
          style={{ maxHeight: "120px" }}
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={streaming}
        className="flex-shrink-0 rounded border border-[#222] bg-[#1a1a1a] px-2 py-[7px] font-mono text-[10px] text-mid transition-colors hover:border-[#333] hover:text-sub disabled:cursor-not-allowed disabled:opacity-40"
      >
        ⏎
      </button>
    </div>
  );
}
