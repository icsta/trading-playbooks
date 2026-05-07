"use client";
import { useChatSocket } from "@/hooks/useChatSocket";
import { useChatStore } from "@/stores/chatStore";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export function ChatPane() {
  const { send } = useChatSocket();
  const lastError = useChatStore((s) => s.lastError);
  const setError = useChatStore((s) => s.setError);
  return (
    <>
      {lastError ? (
        <div className="flex items-start gap-2 px-4 py-2 bg-warning/10 text-warning text-xs border-b border-warning/30">
          <span className="flex-1 break-words">{lastError}</span>
          <button
            type="button"
            aria-label="dismiss error"
            onClick={() => setError(null)}
            className="text-warning hover:text-text px-1 leading-none"
          >
            ×
          </button>
        </div>
      ) : null}
      <MessageList />
      <Composer onSend={(text) => send({ kind: "user_msg", content: text })} />
    </>
  );
}
