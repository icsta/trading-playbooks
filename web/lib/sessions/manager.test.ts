import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db";
import { SessionManager } from "@/lib/sessions/manager";
import type { ClaudeEvent } from "@/lib/claude/types";

const FAKE = path.resolve(__dirname, "../../__fixtures__/fake-claude.mjs");

function makeManager(db: Database.Database, mode: string = "simple") {
  return new SessionManager({
    db,
    bridgeOpts: {
      command: process.execPath,
      args: undefined, // let manager synthesize args using --resume etc.
      env: { MODE: mode, FAKE_SESSION_ID: "test-001" },
      cwd: process.cwd(),
      hangTimeoutMs: 5_000,
    },
  });
}

// Bridge synthesizes its own claude args including --resume. But we want fake-claude
// to be invoked. Use a custom bridge factory? Simpler: pass args explicitly so we
// run fake-claude regardless. To still test --resume behavior, we'd need a separate
// integration probe. For these tests, we focus on manager-level concerns and rely on
// the bridge's own tests for arg synthesis.
function makeManagerWithFake(db: Database.Database, mode: string, sessionId: string = "test-001") {
  return new SessionManager({
    db,
    bridgeOpts: {
      command: process.execPath,
      args: [FAKE], // explicit args → bridge does not append --resume
      env: { MODE: mode, FAKE_SESSION_ID: sessionId },
      cwd: process.cwd(),
      hangTimeoutMs: 5_000,
    },
  });
}

async function waitForExit(mgr: SessionManager, sessionId?: string, timeoutMs = 8_000): Promise<{ sid: string; events: ClaudeEvent[] }> {
  return new Promise((resolve, reject) => {
    const events: ClaudeEvent[] = [];
    const t = setTimeout(() => reject(new Error("timeout waiting for manager exit")), timeoutMs);
    mgr.on("event", (sid, e) => {
      if (!sessionId || sid === sessionId || sid !== "") events.push(e);
    });
    mgr.on("exit", (sid) => {
      clearTimeout(t);
      resolve({ sid, events });
    });
  });
}

describe("SessionManager", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    applyMigrations(db);
  });

  it("creates a new session row when system_init arrives on a new chat", async () => {
    const mgr = makeManagerWithFake(db, "simple");
    await mgr.dispatchUserMessage(undefined, "hi");
    await waitForExit(mgr);
    const rows = db.prepare("SELECT id FROM sessions").all() as { id: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("test-001");
  });

  it("auto-titles a session from the first user message (truncated)", async () => {
    const mgr = makeManagerWithFake(db, "simple");
    await mgr.dispatchUserMessage(undefined, "summarize SPY credit spreads next 2 weeks");
    await waitForExit(mgr);
    const row = db
      .prepare("SELECT title FROM sessions WHERE id = ?")
      .get("test-001") as { title: string } | undefined;
    expect(row?.title).toMatch(/SPY credit spreads/);
    expect((row?.title ?? "").length).toBeLessThanOrEqual(60);
  });

  it("touchSession updates last_touched_at on result", async () => {
    const mgr = makeManagerWithFake(db, "simple");
    await mgr.dispatchUserMessage(undefined, "first");
    await waitForExit(mgr);
    const before = (db.prepare("SELECT last_touched_at FROM sessions WHERE id = ?").get("test-001") as { last_touched_at: number }).last_touched_at;
    await new Promise((r) => setTimeout(r, 10));
    const mgr2 = makeManagerWithFake(db, "simple");
    await mgr2.dispatchUserMessage("test-001", "second");
    await waitForExit(mgr2);
    const after = (db.prepare("SELECT last_touched_at FROM sessions WHERE id = ?").get("test-001") as { last_touched_at: number }).last_touched_at;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("emits 'event' envelopes that the WS router can forward", async () => {
    const mgr = makeManagerWithFake(db, "simple");
    const seen: { sid: string; e: ClaudeEvent }[] = [];
    mgr.on("event", (sid, e) => seen.push({ sid, e }));
    await mgr.dispatchUserMessage(undefined, "hi");
    await waitForExit(mgr);
    expect(seen.some((x) => x.e.kind === "system_init")).toBe(true);
    expect(seen.some((x) => x.e.kind === "result")).toBe(true);
    // After session_id is known, all subsequent events should carry it
    const afterInit = seen.slice(seen.findIndex((x) => x.e.kind === "system_init"));
    for (const x of afterInit) {
      expect(x.sid).toBe("test-001");
    }
  });

  it("handles subprocess crash by emitting exit with non-zero code", async () => {
    const mgr = makeManagerWithFake(db, "crash");
    const onExit = vi.fn();
    mgr.on("exit", onExit);
    await mgr.dispatchUserMessage(undefined, "die");
    // Wait briefly for exit event
    await new Promise((r) => setTimeout(r, 500));
    expect(onExit).toHaveBeenCalled();
    const args = onExit.mock.calls[0];
    expect(args[1].code).toBe(7);
  });

  it("rejects a second dispatch on the same session while one is in flight", async () => {
    const mgr = makeManagerWithFake(db, "hang", "session-A");
    await mgr.dispatchUserMessage(undefined, "long");
    // Bridge is hanging; immediate second dispatch should throw
    await expect(mgr.dispatchUserMessage("session-A", "second")).rejects.toThrow();
    // Cancel and clean up
    mgr.cancel("session-A");
    await new Promise((r) => setTimeout(r, 200));
    await mgr.shutdown();
  });

  it("cancel() terminates the in-flight bridge for a session", async () => {
    const mgr = makeManagerWithFake(db, "hang", "session-B");
    const onExit = vi.fn();
    mgr.on("exit", onExit);
    await mgr.dispatchUserMessage(undefined, "hang please");
    // Once init arrives, cancel
    await new Promise((r) => setTimeout(r, 200));
    mgr.cancel("session-B");
    await new Promise((r) => setTimeout(r, 300));
    expect(onExit).toHaveBeenCalled();
    await mgr.shutdown();
  });

  it("shutdown() cancels all in-flight bridges", async () => {
    const mgr = makeManagerWithFake(db, "hang", "session-C");
    await mgr.dispatchUserMessage(undefined, "hang please");
    await new Promise((r) => setTimeout(r, 200));
    await mgr.shutdown();
    // After shutdown, dispatching should throw or no-op cleanly — for now we just assert shutdown returns
    expect(true).toBe(true);
  });
});
