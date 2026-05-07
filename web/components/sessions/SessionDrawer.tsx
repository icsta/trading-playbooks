"use client";
import { Plus } from "lucide-react";
import { useSessionList, type SessionSummary } from "@/hooks/useSessionList";
import { useChatStore } from "@/stores/chatStore";
import { useChatSocket } from "@/hooks/useChatSocket";

export function SessionDrawer() {
  const { sessions } = useSessionList();
  const sessionId = useChatStore((s) => s.sessionId);
  const reset = useChatStore((s) => s.reset);
  const { send } = useChatSocket();

  const groups = groupByRecency(sessions);

  return (
    <div className="flex flex-col gap-2 h-full">
      <button
        type="button"
        onClick={() => reset()}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-md bg-primary text-[#0a0e16] text-sm hover:opacity-90"
      >
        <Plus size={14} /> New chat
      </button>
      <div className="flex-1 overflow-y-auto">
        {Object.entries(groups).map(([label, list]) =>
          list.length === 0 ? null : (
            <div key={label} className="mb-3">
              <div className="text-[10px] uppercase tracking-wider text-muted px-2 mb-1">
                {label}
              </div>
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    reset();
                    useChatStore.getState().setSessionId(s.id);
                    send({ kind: "subscribe", session_id: s.id });
                  }}
                  className={[
                    "block w-full text-left px-3 py-1.5 rounded text-xs truncate",
                    s.id === sessionId
                      ? "bg-surface text-text"
                      : "text-muted hover:bg-surface/50 hover:text-text",
                  ].join(" ")}
                >
                  {s.title || "(untitled)"}
                </button>
              ))}
            </div>
          ),
        )}
        {sessions.length === 0 ? (
          <div className="text-muted text-xs p-2">no chats yet</div>
        ) : null}
      </div>
    </div>
  );
}

function groupByRecency(list: SessionSummary[]): Record<string, SessionSummary[]> {
  const now = Date.now();
  const today: SessionSummary[] = [];
  const yesterday: SessionSummary[] = [];
  const older: SessionSummary[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (const s of list) {
    const age = now - s.last_touched_at;
    if (age < dayMs) today.push(s);
    else if (age < 2 * dayMs) yesterday.push(s);
    else older.push(s);
  }
  return { Today: today, Yesterday: yesterday, Older: older };
}
