import type Database from "better-sqlite3";

export type SessionRow = {
  id: string;
  title: string;
  created_at: number;
  last_touched_at: number;
};

export function upsertSession(db: Database.Database, s: SessionRow): void {
  db.prepare(
    `INSERT INTO sessions (id, title, created_at, last_touched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       last_touched_at = excluded.last_touched_at`,
  ).run(s.id, s.title, s.created_at, s.last_touched_at);
}

export function getSession(db: Database.Database, id: string): SessionRow | null {
  const row = db
    .prepare("SELECT id, title, created_at, last_touched_at FROM sessions WHERE id = ?")
    .get(id) as SessionRow | undefined;
  return row ?? null;
}

export function listSessions(db: Database.Database): SessionRow[] {
  return db
    .prepare(
      "SELECT id, title, created_at, last_touched_at FROM sessions ORDER BY last_touched_at DESC",
    )
    .all() as SessionRow[];
}

export function touchSession(db: Database.Database, id: string, ts: number): void {
  db.prepare("UPDATE sessions SET last_touched_at = ? WHERE id = ?").run(ts, id);
}

export function setSessionTitle(db: Database.Database, id: string, title: string): void {
  db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, id);
}
