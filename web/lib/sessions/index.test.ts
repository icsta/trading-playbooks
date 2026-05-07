import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db";
import { upsertSession, getSession, listSessions, touchSession, setSessionTitle } from "@/lib/sessions/index";

describe("session index", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    applyMigrations(db);
  });

  it("upserts and reads a session", () => {
    upsertSession(db, { id: "s1", title: "first chat", created_at: 100, last_touched_at: 100 });
    const s = getSession(db, "s1");
    expect(s).toEqual({ id: "s1", title: "first chat", created_at: 100, last_touched_at: 100 });
  });

  it("returns null for missing session", () => {
    expect(getSession(db, "nope")).toBeNull();
  });

  it("lists sessions ordered by last_touched_at desc", () => {
    upsertSession(db, { id: "a", title: "a", created_at: 1, last_touched_at: 1 });
    upsertSession(db, { id: "b", title: "b", created_at: 2, last_touched_at: 5 });
    upsertSession(db, { id: "c", title: "c", created_at: 3, last_touched_at: 3 });
    const list = listSessions(db);
    expect(list.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("touchSession updates only last_touched_at", () => {
    upsertSession(db, { id: "x", title: "x", created_at: 1, last_touched_at: 1 });
    touchSession(db, "x", 99);
    expect(getSession(db, "x")).toEqual({ id: "x", title: "x", created_at: 1, last_touched_at: 99 });
  });

  it("upsert overwrites title when provided", () => {
    upsertSession(db, { id: "y", title: "old", created_at: 1, last_touched_at: 1 });
    upsertSession(db, { id: "y", title: "new", created_at: 1, last_touched_at: 2 });
    expect(getSession(db, "y")?.title).toBe("new");
  });

  it("setSessionTitle updates only the title", () => {
    upsertSession(db, { id: "z", title: "", created_at: 1, last_touched_at: 1 });
    setSessionTitle(db, "z", "renamed");
    const s = getSession(db, "z");
    expect(s?.title).toBe("renamed");
    expect(s?.last_touched_at).toBe(1);
  });
});
