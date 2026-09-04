import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "watchlist.db");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'en',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS watchlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, symbol)
  );

  -- One row per price poll per symbol. This is the source of truth
  -- for "what changed" - we diff consecutive snapshots per symbol.
  CREATE TABLE IF NOT EXISTS price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    price REAL NOT NULL,
    volume INTEGER NOT NULL,
    day_high REAL,
    day_low REAL,
    week52_high REAL,
    week52_low REAL,
    prev_close REAL,
    source TEXT NOT NULL DEFAULT 'mock',
    is_stale INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_time ON price_snapshots(symbol, fetched_at);

  -- Computed once per symbol per poll (not per-user) - a symbol watched
  -- by 10,000 users still only gets ONE change computation per poll.
  CREATE TABLE IF NOT EXISTS change_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL,
    message_en TEXT NOT NULL,
    message_hi TEXT NOT NULL,
    score INTEGER NOT NULL,
    price REAL NOT NULL,
    pct_change REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_symbol_time ON change_events(symbol, created_at);

  -- Tracks per-user "last seen" so returning users get a personal digest
  -- of everything that happened on their watched symbols since they left.
  CREATE TABLE IF NOT EXISTS user_seen (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export default db;
