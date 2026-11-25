import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { BOTS } from "../engine/bots.ts";
import { all, get, run } from "./db.ts";

export interface User {
  id: number;
  handle: string;
  bot_level: number | null;
  tagline: string;
  agent_model: string;
  avatar: string;
  rating: number;
  peak_rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  key_hint: string | null;
  created_at: number;
}

const USER_COLS = "id, handle, bot_level, tagline, agent_model, avatar, rating, peak_rating, games, wins, losses, draws, streak, key_hint, created_at";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
}

function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 32);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

export const HANDLE_RULE = /^[a-zA-Z0-9_-]{3,20}$/;

export function createUser(handle: string, password: string): User {
  if (!HANDLE_RULE.test(handle)) throw new Error("Handles are 3 to 20 letters, digits, dashes or underscores.");
  if (password.length < 8) throw new Error("Passwords need at least 8 characters.");
  if (get("SELECT 1 FROM users WHERE handle = ?", handle)) throw new Error("That handle is taken.");
  const avatar = JSON.stringify({ seed: randomBytes(4).readUInt32LE(0) });
  const res = run("INSERT INTO users (handle, pass_hash, avatar, created_at) VALUES (?, ?, ?, ?)", handle, hashPassword(password), avatar, Date.now());
  return userById(Number(res.lastInsertRowid))!;
}

export function setPassword(userId: number, password: string): void {
  if (password.length < 8) throw new Error("Passwords need at least 8 characters.");
  run("UPDATE users SET pass_hash = ? WHERE id = ?", hashPassword(password), userId);
}

export function login(handle: string, password: string): User | null {
  const row = get<{ id: number; pass_hash: string | null }>("SELECT id, pass_hash FROM users WHERE handle = ?", handle);
  if (!row?.pass_hash || !checkPassword(password, row.pass_hash)) return null;
  return userById(row.id) ?? null;
}

export function userById(id: number): User | undefined {
  return get<User>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, id);
}

export function userByHandle(handle: string): User | undefined {
  return get<User>(`SELECT ${USER_COLS} FROM users WHERE handle = ?`, handle);
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString("base64url");
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", sha(token), userId, Date.now() + 30 * 86400_000);
  return token;
}

export function userBySession(token: string | undefined): User | undefined {
  if (!token) return undefined;
  const row = get<{ user_id: number }>("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?", sha(token), Date.now());
  return row ? userById(row.user_id) : undefined;
}

export function endSession(token: string): void {
  run("DELETE FROM sessions WHERE token_hash = ?", sha(token));
}

/** Issue a new API key, replacing any old one. The plain key is returned once and never stored. */
export function rotateApiKey(userId: number): string {
  const key = `td_${randomBytes(24).toString("base64url")}`;
  run("UPDATE users SET key_hash = ?, key_hint = ? WHERE id = ?", sha(key), `${key.slice(0, 7)}…${key.slice(-4)}`, userId);
  return key;
}

export function userByApiKey(key: string): User | undefined {
  if (!key.startsWith("td_")) return undefined;
  return get<User>(`SELECT ${USER_COLS} FROM users WHERE key_hash = ?`, sha(key));
}

export function updateProfile(userId: number, fields: { tagline?: string; agent_model?: string; avatar?: string }): void {
  if (fields.tagline !== undefined) run("UPDATE users SET tagline = ? WHERE id = ?", fields.tagline.slice(0, 80), userId);
  if (fields.agent_model !== undefined) run("UPDATE users SET agent_model = ? WHERE id = ?", fields.agent_model.slice(0, 40), userId);
  if (fields.avatar !== undefined) run("UPDATE users SET avatar = ? WHERE id = ?", fields.avatar, userId);
}

/** House bots are ordinary rows with a fixed rating and no way to log in. */
export function ensureBots(): void {
  for (const b of BOTS) {
    const row = get<{ id: number }>("SELECT id FROM users WHERE handle = ?", b.handle);
    if (row) run("UPDATE users SET rating = ?, peak_rating = ?, tagline = ?, bot_level = ? WHERE id = ?", b.rating, b.rating, b.tagline, b.level, row.id);
    else {
      run(
        "INSERT INTO users (handle, bot_level, tagline, agent_model, avatar, rating, peak_rating, created_at) VALUES (?, ?, ?, 'house bot', ?, ?, ?, ?)",
        b.handle, b.level, b.tagline, JSON.stringify({ seed: b.level * 7919 }), b.rating, b.rating, Date.now(),
      );
    }
  }
}

export function bots(): User[] {
  return all<User>(`SELECT ${USER_COLS} FROM users WHERE bot_level IS NOT NULL ORDER BY rating`);
}

export function leaderboard(limit = 100): User[] {
  return all<User>(`SELECT ${USER_COLS} FROM users WHERE games > 0 OR bot_level IS NOT NULL ORDER BY rating DESC, games DESC LIMIT ?`, limit);
}

// Playbooks: versioned notes the agent reads before a match and the human edits between them.

export interface Playbook {
  version: number;
  content: string;
  note: string;
  author: "human" | "agent";
  created_at: number;
}

export function latestPlaybook(userId: number): Playbook | undefined {
  return get<Playbook>("SELECT version, content, note, author, created_at FROM playbooks WHERE user_id = ? ORDER BY version DESC LIMIT 1", userId);
}

export function playbookHistory(userId: number): Playbook[] {
  return all<Playbook>("SELECT version, content, note, author, created_at FROM playbooks WHERE user_id = ? ORDER BY version DESC LIMIT 50", userId);
}

export const PLAYBOOK_LIMIT = 12000;

export function savePlaybook(userId: number, content: string, author: "human" | "agent", note = ""): Playbook {
  if (content.length > PLAYBOOK_LIMIT) throw new Error(`Playbooks are limited to ${PLAYBOOK_LIMIT} characters; this one is ${content.length}.`);
  const prev = latestPlaybook(userId);
  if (prev && prev.content === content) return prev;
  const version = (prev?.version ?? 0) + 1;
  run("INSERT INTO playbooks (user_id, version, content, note, author, created_at) VALUES (?, ?, ?, ?, ?, ?)", userId, version, content, note.slice(0, 200), author, Date.now());
  return latestPlaybook(userId)!;
}
