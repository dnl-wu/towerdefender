import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { durableHost } from "./host.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT,
  key_hash TEXT UNIQUE,
  key_hint TEXT,
  bot_level INTEGER,
  tagline TEXT NOT NULL DEFAULT '',
  agent_model TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '{}',
  rating REAL NOT NULL DEFAULT 1000,
  peak_rating REAL NOT NULL DEFAULT 1000,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS playbooks (
  user_id INTEGER NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, version)
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  p0 INTEGER NOT NULL REFERENCES users(id),
  p1 INTEGER NOT NULL REFERENCES users(id),
  log TEXT NOT NULL DEFAULT '[]',
  resolved_rounds INTEGER NOT NULL DEFAULT 0,
  winner TEXT,
  end_reason TEXT,
  lives0 INTEGER NOT NULL DEFAULT 0,
  lives1 INTEGER NOT NULL DEFAULT 0,
  rating0_before REAL, rating0_after REAL,
  rating1_before REAL, rating1_after REAL,
  playbook0 INTEGER, playbook1 INTEGER,
  debrief0 TEXT, debrief1 TEXT,
  calls0 INTEGER NOT NULL DEFAULT 0,
  calls1 INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS match_clocks (
  match_id TEXT PRIMARY KEY REFERENCES matches(id),
  deadline INTEGER NOT NULL,
  turn_state TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_p0 ON matches(p0, created_at);
CREATE INDEX IF NOT EXISTS matches_p1 ON matches(p1, created_at);
CREATE INDEX IF NOT EXISTS matches_status ON matches(status);
`;

const g = globalThis as unknown as { __tdDb?: DatabaseSync };

function nodeDb(): DatabaseSync {
  if (!g.__tdDb) {
    const file = process.env.TD_DB ?? resolve(process.cwd(), "data/towerdefender.db");
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
    const conn = new DatabaseSync(file);
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;");
    conn.exec(SCHEMA);
    g.__tdDb = conn;
  }
  return g.__tdDb;
}

type Param = string | number | bigint | null;

function cloudSql() {
  const host = durableHost();
  if (host && !host.initialized) {
    host.sql.exec(SCHEMA);
    host.initialized = true;
  }
  return host?.sql;
}

export function all<T>(sql: string, ...params: Param[]): T[] {
  const storage = cloudSql();
  return (storage ? storage.exec(sql, ...params).toArray() : nodeDb().prepare(sql).all(...params)) as T[];
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  const storage = cloudSql();
  return (storage ? storage.exec(sql, ...params).toArray()[0] : nodeDb().prepare(sql).get(...params)) as T | undefined;
}

export function run(sql: string, ...params: Param[]): void {
  const storage = cloudSql();
  if (storage) storage.exec(sql, ...params);
  else nodeDb().prepare(sql).run(...params);
}
