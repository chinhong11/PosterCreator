import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionState, SessionSummary } from "@poster/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "posters.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const upsert = db.prepare(
  `INSERT INTO sessions (id, data, updated_at) VALUES (@id, @data, @updated_at)
   ON CONFLICT(id) DO UPDATE SET data = @data, updated_at = @updated_at`,
);
const selectAll = db.prepare(`SELECT data FROM sessions`);
const selectSummaries = db.prepare(
  `SELECT id, data, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 50`,
);

/** Persist (insert or update) a session snapshot. */
export function saveSession(session: SessionState): void {
  upsert.run({ id: session.id, data: JSON.stringify(session), updated_at: Date.now() });
}

/** Load every persisted session (used to warm the in-memory cache on startup). */
export function loadAllSessions(): SessionState[] {
  return (selectAll.all() as { data: string }[]).map((r) => JSON.parse(r.data) as SessionState);
}

/** List recent sessions as lightweight summaries. */
export function listSummaries(): SessionSummary[] {
  const rows = selectSummaries.all() as { id: string; data: string; updated_at: number }[];
  return rows.map((r) => {
    const s = JSON.parse(r.data) as SessionState;
    return {
      id: s.id,
      size: s.size,
      versionCount: s.versions.length,
      title: s.versions[0]?.prompt?.slice(0, 80) || "Untitled poster",
      updatedAt: r.updated_at,
    };
  });
}
