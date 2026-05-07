import type { WebSocketServer, WebSocket } from "ws";
import { SessionManager } from "@/lib/sessions/manager";
import type { ClaudeEvent } from "@/lib/claude/types";
import { streamTranscript } from "@/lib/sessions/transcript";
import { decodeClient, encodeServer, type ServerEnvelope } from "./protocol";

type Subscription = {
  ws: WebSocket;
  sessionId: string;
};

export type RouterOpts = {
  /** Project root for resolving Claude transcript files. Required for replay. */
  projectRoot?: string;
};

export function attachWsRouter(
  wss: WebSocketServer,
  manager: SessionManager,
  opts: RouterOpts = {},
): void {
  // Map session_id → owning WebSocket. Enforces single-active-client per session.
  const subscriptions = new Map<string, Subscription>();

  // Per-connection event listener registered when a client opens; removed on close.
  // We register a manager-level listener once and dispatch by sessionId via subscriptions.
  const onManagerEvent = (sessionId: string, ev: ClaudeEvent) => {
    if (!sessionId) return;
    const sub = subscriptions.get(sessionId);
    if (!sub) return;
    for (const env of eventToServerEnvelopes(sessionId, ev)) {
      sub.ws.send(encodeServer(env));
    }
  };
  const onManagerError = (sessionId: string, err: Error) => {
    const sub = subscriptions.get(sessionId);
    if (!sub) return;
    sub.ws.send(
      encodeServer({
        type: "error",
        session_id: sessionId,
        reason: "subprocess_error",
        detail: err.message,
      }),
    );
  };
  manager.on("event", onManagerEvent);
  manager.on("error", onManagerError);

  wss.on("connection", (ws) => {
    let claimedSession: string | null = null;
    let pendingTempClaim = false;

    const onPromotionEvent = (sessionId: string, ev: ClaudeEvent) => {
      if (pendingTempClaim && ev.kind === "system_init" && sessionId) {
        pendingTempClaim = false;
        // Reserve session for this connection
        subscriptions.set(sessionId, { ws, sessionId });
        claimedSession = sessionId;
        ws.send(encodeServer({ type: "session_started", session_id: sessionId }));
      }
    };
    manager.on("event", onPromotionEvent);

    ws.on("message", async (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        ws.send(encodeServer({ type: "error", reason: "invalid_envelope" }));
        return;
      }
      const result = decodeClient(parsed);
      if (!result.success) {
        ws.send(
          encodeServer({
            type: "error",
            reason: "invalid_envelope",
            detail: result.error.message,
          }),
        );
        return;
      }
      const env = result.data;

      try {
        switch (env.type) {
          case "new_chat":
            pendingTempClaim = true;
            break;

          case "subscribe": {
            const existing = subscriptions.get(env.session_id);
            if (existing && existing.ws !== ws) {
              ws.send(
                encodeServer({
                  type: "error",
                  session_id: env.session_id,
                  reason: "session_in_use",
                }),
              );
              return;
            }
            subscriptions.set(env.session_id, { ws, sessionId: env.session_id });
            claimedSession = env.session_id;
            ws.send(encodeServer({ type: "subscribed", session_id: env.session_id }));
            // Kick off async transcript replay if we have a project root configured.
            if (opts.projectRoot) {
              void replayTranscriptToClient(ws, opts.projectRoot, env.session_id);
            }
            break;
          }

          case "user_msg": {
            if (env.session_id) {
              const existing = subscriptions.get(env.session_id);
              if (existing && existing.ws !== ws) {
                ws.send(
                  encodeServer({
                    type: "error",
                    session_id: env.session_id,
                    reason: "session_in_use",
                  }),
                );
                return;
              }
              subscriptions.set(env.session_id, { ws, sessionId: env.session_id });
              claimedSession = env.session_id;
              await manager.dispatchUserMessage(env.session_id, env.content);
            } else {
              pendingTempClaim = true;
              await manager.dispatchUserMessage(undefined, env.content);
            }
            break;
          }

          case "cancel":
            manager.cancel(env.session_id);
            break;
        }
      } catch (err) {
        ws.send(
          encodeServer({
            type: "error",
            session_id: claimedSession ?? undefined,
            reason: "dispatch_failed",
            detail: (err as Error).message,
          }),
        );
      }
    });

    ws.on("close", () => {
      manager.off("event", onPromotionEvent);
      if (claimedSession) {
        const sub = subscriptions.get(claimedSession);
        if (sub?.ws === ws) subscriptions.delete(claimedSession);
      }
    });
  });
}

async function replayTranscriptToClient(
  ws: WebSocket,
  projectRoot: string,
  sessionId: string,
): Promise<void> {
  try {
    for await (const ev of streamTranscript(projectRoot, sessionId)) {
      if (ws.readyState !== ws.OPEN) return;
      switch (ev.kind) {
        case "user_msg":
          ws.send(encodeServer({ type: "replay_user_msg", session_id: sessionId, content: ev.content }));
          break;
        case "text_delta":
          ws.send(encodeServer({ type: "text_delta", session_id: sessionId, content: ev.text }));
          break;
        case "tool_use_start":
          ws.send(
            encodeServer({
              type: "tool_use_start",
              session_id: sessionId,
              id: ev.id,
              name: ev.name,
              args: ev.input,
            }),
          );
          break;
        case "tool_result":
          ws.send(
            encodeServer({
              type: "tool_use_result",
              session_id: sessionId,
              id: ev.tool_use_id,
              result: ev.content,
              error: ev.is_error ? "tool_error" : undefined,
            }),
          );
          break;
      }
    }
    if (ws.readyState === ws.OPEN) {
      ws.send(encodeServer({ type: "replay_done", session_id: sessionId }));
    }
  } catch (err) {
    if (ws.readyState === ws.OPEN) {
      ws.send(
        encodeServer({
          type: "error",
          session_id: sessionId,
          reason: "replay_failed",
          detail: (err as Error).message,
        }),
      );
    }
  }
}

function eventToServerEnvelopes(sessionId: string, ev: ClaudeEvent): ServerEnvelope[] {
  switch (ev.kind) {
    case "system_init":
      return []; // session_started is emitted by the per-connection promotion handler
    case "text_delta":
      return [{ type: "text_delta", session_id: sessionId, content: ev.text }];
    case "tool_use_start":
      return [
        {
          type: "tool_use_start",
          session_id: sessionId,
          id: ev.id,
          name: ev.name,
          args: ev.input,
        },
      ];
    case "tool_result":
      return [
        {
          type: "tool_use_result",
          session_id: sessionId,
          id: ev.tool_use_id,
          result: ev.content,
          error: ev.is_error ? "tool_error" : undefined,
        },
      ];
    case "result":
      return [
        {
          type: "result",
          session_id: sessionId,
          permission_denials: ev.permission_denials,
        },
      ];
    case "parse_error":
      return [
        {
          type: "error",
          session_id: sessionId,
          reason: "parse_error",
          detail: ev.reason,
        },
      ];
    case "unknown":
      return [];
  }
}
