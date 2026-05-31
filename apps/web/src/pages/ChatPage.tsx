import { SessionStrip } from "../components/layout/SessionStrip.tsx";
import { MessageList } from "../components/chat/MessageList.tsx";
import { InputBar } from "../components/chat/InputBar.tsx";

export function ChatPage() {
  return (
    <>
      <SessionStrip />
      <MessageList />
      <InputBar />
    </>
  );
}
