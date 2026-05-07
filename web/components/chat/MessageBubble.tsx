"use client";
import type { Message } from "@/stores/chatStore";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { ToolCallBlock } from "./ToolCallBlock";

export function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-surface text-text px-4 py-2 text-sm whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {message.text ? (
        <div className="text-text text-sm">
          <MarkdownViewer source={message.text} />
        </div>
      ) : null}
      {message.tools.map((t) => (
        <ToolCallBlock key={t.id} tool={t} />
      ))}
      {message.permissionDenials.length > 0 ? (
        <div className="my-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          {message.permissionDenials.length} tool call{message.permissionDenials.length === 1 ? "" : "s"} denied by permissions:
          <ul className="mt-1 ml-4 list-disc text-text font-mono">
            {message.permissionDenials.map((d) => (
              <li key={d.tool_use_id}>{d.tool_name}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
