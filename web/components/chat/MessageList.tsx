"use client";
import { useEffect, useRef } from "react";
import { useChatStore, type Message } from "@/stores/chatStore";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

function isAwaitingResponse(messages: Message[]): boolean {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  // User just sent — claude hasn't replied yet
  if (last.role === "user") return true;
  // Assistant turn started but nothing visible yet (e.g., claude is processing
  // before any text or tool block has streamed)
  if (
    last.role === "assistant" &&
    !last.done &&
    last.text === "" &&
    last.tools.length === 0
  ) {
    return true;
  }
  return false;
}

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const awaiting = isAwaitingResponse(messages);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages, awaiting]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        Ask Claude something to begin.
      </div>
    );
  }
  return (
    <div
      ref={scrollerRef}
      className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 min-h-0"
    >
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {awaiting ? <TypingIndicator /> : null}
    </div>
  );
}
