"use client";
import { useEffect, useState, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";

export type SessionSummary = {
  id: string;
  title: string;
  created_at: number;
  last_touched_at: number;
};

export function useSessionList() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const sessionId = useChatStore((s) => s.sessionId);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/sessions");
      if (!r.ok) return;
      const j = (await r.json()) as { sessions: SessionSummary[] };
      setSessions(j.sessions);
    } catch {
      // ignore — drawer will retry on next session change or focus
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-fetch shortly after a session id changes (new chat or switch)
  useEffect(() => {
    const t = setTimeout(refresh, 500);
    return () => clearTimeout(t);
  }, [sessionId, refresh]);

  return { sessions, refresh };
}
