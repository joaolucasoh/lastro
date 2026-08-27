import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const defaultDataDir = join(process.env.HOME ?? process.cwd(), "LastroData");
const dataDir = process.env.LASTRO_DATA_DIR || defaultDataDir;
const dbPath = process.env.LASTRO_DB_PATH || join(dataDir, "lastro.sqlite");

let db: DatabaseSync | null = null;

function getDb() {
  if (db) return db;
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export function readLastroState() {
  const row = getDb().prepare("SELECT payload, updated_at FROM app_state WHERE id = ?").get("main") as { payload: string; updated_at: string } | undefined;
  if (!row) return null;
  return {
    payload: JSON.parse(row.payload) as unknown,
    updatedAt: row.updated_at,
    dbPath
  };
}

export function writeLastroState(payload: unknown) {
  const updatedAt = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO app_state (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at")
    .run("main", JSON.stringify(payload), updatedAt);
  return { updatedAt, dbPath };
}

export function lastroDbInfo() {
  return { dbPath, dataDir };
}
