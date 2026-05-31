import { useChatStore } from "../store/chat.ts";

export function sendMessage(input: string, sessionId: string): AbortController {
  const controller = new AbortController();

  useChatStore.getState().addUserMessage(input);
  const agentMsgId = useChatStore.getState().startAgentMessage();

  void (async () => {
    let finalized = false;

    function finalize() {
      if (finalized) return;
      finalized = true;
      useChatStore.getState().finalizeStreaming(agentMsgId);
    }

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, sessionId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        finalize();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (!frame.startsWith("data: ")) continue;

          const raw = frame.slice(6);
          let event: { type: string; text?: string; message?: string };
          try {
            event = JSON.parse(raw) as typeof event;
          } catch {
            continue;
          }

          if (event.type === "delta" && event.text) {
            useChatStore.getState().appendPartial(event.text);
          } else if (event.type === "done") {
            finalize();
          } else if (event.type === "error") {
            useChatStore.getState().appendPartial(`\n[error: ${event.message ?? "unknown"}]`);
            finalize();
          }
        }
      }

      // Fallback: finalize if server closed stream without sending "done"
      finalize();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        useChatStore.getState().appendPartial(`\n[connection error: ${String(err)}]`);
        finalize();
      }
    }
  })();

  return controller;
}
