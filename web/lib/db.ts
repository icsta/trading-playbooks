import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.COCKPIT_DB_PATH ?? "./data/cockpit.db";
  const absPath = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  _db = new Database(absPath);
  _db.pragma("journal_mode = WAL");
  applyMigrations(_db);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT    PRIMARY KEY,
      title           TEXT    NOT NULL DEFAULT '',
      created_at      INTEGER NOT NULL,
      last_touched_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_last_touched ON sessions(last_touched_at DESC);
  `);
}
