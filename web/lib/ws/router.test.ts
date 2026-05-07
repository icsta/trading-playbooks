import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server } from "node:http";
import path from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db";
import { SessionManager } from "@/lib/sessions/manager";
import { attachWsRouter } from "@/lib/ws/router";

const FAKE = path.resolve(__dirname, "../../__fixtures__/fake-claude.mjs");

// Per-WS message queue: install a single permanent listener and let nextMessage
// consume from it. Without this, messages that arrive between successive
// nextMessage calls are dropped because the handler is detached.
const queues = new WeakMap<WebSocket, { buffer: any[]; waiters: Array<(m: any) => boolean> }>();
function installQueue(ws: WebSocket) {
  if (queues.has(ws)) return;
  const state = { buffer: [] as any[], waiters: [] as Array<(m: any) => boolean> };
  queues.set(ws, state);
  ws.on("message", (raw: Buffer) => {
    const msg = JSON.parse(raw.toString());
    state.buffer.push(msg);
    // Try waiters in order; first that consumes wins. (We model a single consumer.)
    for (let i = 0; i < state.waiters.length; i++) {
      if (state.waiters[i](msg)) {
        state.waiters.splice(i, 1);
        break;
      }
    }
  });
}

async function nextMessage(ws: WebSocket, predicate: (m: any) => boolean, timeoutMs = 5000): Promise<any> {
  installQueue(ws);
  const state = queues.get(ws)!;
  // Drain any already-buffered match.
  for (let i = 0; i < state.buffer.length; i++) {
    if (predicate(state.buffer[i])) {
      const [match] = state.buffer.splice(i, 1);
      return match;
    }
  }
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout waiting for message")), timeoutMs);
    state.waiters.push((m) => {
      if (predicate(m)) {
        clearTimeout(t);
        // Remove m from buffer
        const idx = state.buffer.indexOf(m);
        if (idx >= 0) state.buffer.splice(idx, 1);
        resolve(m);
        return true;
      }
      return false;
    });
  });
}

describe("WS router", () => {
  let db: Database.Database;
  let httpServer: Server;
  let wss: WebSocketServer;
  let manager: SessionManager;
  let port: number;

  beforeEach(async () => {
    db = new Database(":memory:");
    applyMigrations(db);
    manager = new SessionManager({
      db,
      bridgeOpts: {
        command: process.execPath,
        args: [FAKE],
        env: { MODE: "simple", FAKE_SESSION_ID: "test-001" },
        cwd: process.cwd(),
        hangTimeoutMs: 5_000,
      },
    });
    httpServer = createServer();
    wss = new WebSocketServer({ noServer: true });
    attachWsRouter(wss, manager);
    httpServer.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    });
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    port = (httpServer.address() as any).port;
  });

  afterEach(async () => {
    await manager.shutdown();
    wss.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("returns session_started + result on a new chat user_msg flow", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws.once("open", r));
    ws.send(JSON.stringify({ type: "user_msg", content: "hello" }));
    const started = await nextMessage(ws, (m) => m.type === "session_started");
    expect(started.session_id).toBe("test-001");
    const result = await nextMessage(ws, (m) => m.type === "result");
    expect(result.session_id).toBe("test-001");
    ws.close();
  });

  it("returns error envelope on malformed JSON", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws.once("open", r));
    ws.send("not json");
    const err = await nextMessage(ws, (m) => m.type === "error");
    expect(err.reason).toBe("invalid_envelope");
    ws.close();
  });

  it("returns error envelope on unknown envelope type", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws.once("open", r));
    ws.send(JSON.stringify({ type: "bogus" }));
    const err = await nextMessage(ws, (m) => m.type === "error");
    expect(err.reason).toBe("invalid_envelope");
    ws.close();
  });

  it("rejects a second subscribe on the same session with session_in_use", async () => {
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws1.once("open", r));
    ws1.send(JSON.stringify({ type: "user_msg", content: "hello" }));
    const started = await nextMessage(ws1, (m) => m.type === "session_started");
    await nextMessage(ws1, (m) => m.type === "result");

    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws2.once("open", r));
    ws2.send(JSON.stringify({ type: "subscribe", session_id: started.session_id }));
    const err = await nextMessage(ws2, (m) => m.type === "error");
    expect(err.reason).toBe("session_in_use");
    ws1.close();
    ws2.close();
  });

  it("relays text_delta envelopes to the subscribed client", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws.once("open", r));
    ws.send(JSON.stringify({ type: "user_msg", content: "hi" }));
    const td = await nextMessage(ws, (m) => m.type === "text_delta");
    expect(td.content).toMatch(/pong/);
    await nextMessage(ws, (m) => m.type === "result");
    ws.close();
  });
});
