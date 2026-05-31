import { useChatStore, type ChatMessage } from "../../store/chat.ts";
import { ToolCall } from "./ToolCall.tsx";
import { StreamingCursor } from "./StreamingCursor.tsx";
import { Markdown } from "./Markdown.tsx";

interface MessageProps {
  message: ChatMessage;
  isLast: boolean;
}

export function Message({ message, isLast }: MessageProps) {
  const { streaming, partialText } = useChatStore();
  const isStreaming = isLast && streaming && message.role === "agent";

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[60%] rounded-[8px_8px_2px_8px] border border-[#242424] bg-[#1a1a1a] px-3 py-2 text-[11px] leading-[1.7] text-primary">
          {message.text}
        </div>
        <span className="text-[9px] text-muted">
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    );
  }

  // Agent message
  const hasContent = isStreaming ? partialText.length > 0 : message.text.length > 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[9px] text-sub">thiny</div>

      {message.toolCalls.map((tc, i) => (
        <ToolCall key={i} tool={tc} />
      ))}

      {hasContent && (
        <div className="max-w-[72%]">
          {isStreaming ? (
            // While streaming: plain text to avoid markdown re-parsing every token
            <div className="text-[11px] leading-[1.7] text-agent">
              {partialText}
              <StreamingCursor />
            </div>
          ) : (
            // Finalized: render as markdown
            <div className="text-[11px]">
              <Markdown content={message.text} />
            </div>
          )}
        </div>
      )}

      {isStreaming && partialText.length === 0 && (
        <div className="text-[11px] text-muted">
          <StreamingCursor />
        </div>
      )}
    </div>
  );
}
