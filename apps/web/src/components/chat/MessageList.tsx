import { useEffect, useRef } from "react";
import { AnimatedList } from "../magicui/AnimatedList.tsx";
import { Message } from "./Message.tsx";
import { useChatStore } from "../../store/chat.ts";

export function MessageList() {
  const { messages } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[11px] text-muted">no messages yet — start a conversation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <AnimatedList delay={0}>
        {messages.map((msg, i) => (
          <div key={msg.id}>
            <Message message={msg} isLast={i === messages.length - 1} />
          </div>
        ))}
      </AnimatedList>
      <div ref={bottomRef} />
    </div>
  );
}
