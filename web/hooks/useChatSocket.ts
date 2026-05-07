"use client";
import { useEffect } from "react";
import { useChatStore } from "@/stores/chatStore";

type Server =
  | { type: "session_started"; session_id: string }
  | { type: "subscribed"; session_id: string }
  | { type: "replay_user_msg"; session_id: string; content: string }
  | { type: "replay_done"; session_id: string }
  | { type: "text_delta"; session_id: string; content: string }
  | { type: "tool_use_start"; session_id: string; id: string; name: string; args: unknown }
  | { type: "tool_use_result"; session_id: string; id: string; result: unknown; error?: string }
  | {
      type: "result";
      session_id: string;
      permission_denials: Array<{ tool_name: string; tool_use_id: string; tool_input: unknown }>;
    }
  | { type: "error"; session_id?: string; reason: string; detail?: string };

export type SendOpts =
  | { kind: "user_msg"; content: string }
  | { kind: "subscribe"; session_id: string }
  | { kind: "cancel" };

// ---------- Singleton WebSocket ----------
//
// We deliberately keep the connection at module scope, not per-hook-caller.
// Both ChatPane and SessionDrawer (and anyone else) use the same socket so
// the server only sees ONE owning client per page. Without this, opening
// a session from the drawer and then sending a message from the composer
// would arrive on two different sockets and trip the session_in_use lock.

let sock: WebSocket | null = null;
let connecting = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function ensureConnection() {
  if (typeof window === "undefined") return; // SSR / node guard
  if (sock && (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING)) {
    return;
  }
  if (connecting) return;
  connecting = true;

  const s = new WebSocket(`ws://${location.host}/ws`);
  sock = s;

  s.onopen = () => {
    connecting = false;
    reconnectAttempts = 0;
    useChatStore.getState().setConnected(true);
  };

  s.onclose = () => {
    connecting = false;
    sock = null;
    useChatStore.getState().setConnected(false);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delay = Math.min(1000 * 2 ** reconnectAttempts++, 10_000);
    reconnectTimer = setTimeout(ensureConnection, delay);
  };

  s.onerror = () => {
    try { s.close(); } catch { /* noop */ }
  };

  s.onmessage = (e) => handleMessage(JSON.parse(e.data) as Server);
}

function handleMessage(m: Server) {
  const s = useChatStore.getState();
  switch (m.type) {
    case "session_started":
    case "subscribed":
      s.setSessionId(m.session_id);
      s.setError(null);
      break;

    case "replay_user_msg": {
      const last = s.messages[s.messages.length - 1];
      if (last?.role === "assistant" && !last.done) s.finishAssistant();
      s.appendUser(m.content);
      break;
    }

    case "replay_done": {
      const last = s.messages[s.messages.length - 1];
      if (last?.role === "assistant" && !last.done) s.finishAssistant();
      break;
    }

    case "text_delta": {
      const last = s.messages[s.messages.length - 1];
      if (!last || last.role === "user" || (last.role === "assistant" && last.done)) {
        s.startAssistant();
      }
      s.appendDelta(m.content);
      break;
    }

    case "tool_use_start": {
      const last = s.messages[s.messages.length - 1];
      if (!last || last.role === "user" || (last.role === "assistant" && last.done)) {
        s.startAssistant();
      }
      s.addToolStart({ id: m.id, name: m.name, args: m.args });
      break;
    }

    case "tool_use_result":
      s.addToolResult(m.id, m.result, m.error);
      break;

    case "result":
      s.setPermissionDenials(m.permission_denials);
      s.finishAssistant();
      break;

    case "error":
      // eslint-disable-next-line no-console
      console.warn("[ws error]", m.reason, m.detail);
      useChatStore
        .getState()
        .setError(`${m.reason}${m.detail ? `: ${m.detail}` : ""}`);
      break;
  }
}

function rawSend(payload: unknown) {
  if (!sock || sock.readyState !== WebSocket.OPEN) return false;
  sock.send(JSON.stringify(payload));
  return true;
}

// ---------- Hook ----------

export function useChatSocket() {
  // Mount once per page; the singleton is idempotent.
  useEffect(() => {
    ensureConnection();
    // We deliberately do NOT close on unmount — the socket should outlive
    // any single component lifecycle. It only closes when the page unloads.
  }, []);

  function send(opts: SendOpts) {
    const sessionId = useChatStore.getState().sessionId;
    if (opts.kind === "user_msg") {
      useChatStore.getState().appendUser(opts.content);
      rawSend(
        sessionId
          ? { type: "user_msg", session_id: sessionId, content: opts.content }
          : { type: "user_msg", content: opts.content },
      );
    } else if (opts.kind === "subscribe") {
      rawSend({ type: "subscribe", session_id: opts.session_id });
    } else if (opts.kind === "cancel") {
      if (!sessionId) return;
      rawSend({ type: "cancel", session_id: sessionId });
    }
  }

  return { send };
}
