// Live matches: matchmaking, the turn clock, round resolution and results.
// State lives in this process and is persisted after every change, so a
// restart resumes active matches from their action logs.
import { randomBytes } from "node:crypto";
import { playBotTurn, snapshotOpponent } from "../engine/bots.ts";
import {
  applyAction, bothCommitted, commit, createDuel, forfeit, replayDuel, resolveRound,
  type Action, type ActionResult, type DuelState, type RoundRecord, type Winner,
} from "../engine/duel.ts";
import { readMatchLog, writeMatchLog } from "../engine/match-log.ts";
import { debrief, type Debrief } from "../engine/report.ts";
import { bots, latestPlaybook, userById, type User } from "./accounts.ts";
import { durableHost } from "./host.ts";
import { all, get, run } from "./db.ts";
import { nextRating } from "./rating.ts";

export type Mode = "ranked" | "practice";

const env = (name: string, fallback: number) => Number(process.env[name] ?? fallback);
export const CLOCK = {
  /** Planning time per round, in ms. The first round is longer: the agent has rules to read. */
  ranked: () => env("TD_TURN_MS", 90_000),
  practice: () => env("TD_PRACTICE_TURN_MS", 300_000),
  firstRoundBonus: () => env("TD_FIRST_ROUND_BONUS_MS", 90_000),
  /** How long a ranked search waits for a human before a house bot steps in, unless the player asks for longer. */
  queueWait: () => env("TD_QUEUE_MS", 10_000),
  /** The longest a player may ask to wait. A search is one tool call, so it has to end well inside the request limit. */
  maxQueueWait: 45_000,
  /** Expired turns in a row, with no actions taken, before a forfeit. */
  maxMisses: 3,
};

export interface LiveMatch {
  id: string;
  mode: Mode;
  state: DuelState;
  users: [number, number];
  botLevels: [number | null, number | null];
  deadline: number;
  timer: ReturnType<typeof setTimeout> | null;
  waiters: Set<() => void>;
  misses: [number, number];
  acted: [boolean, boolean];
  calls: [number, number];
  /** Each player's most recent MCP call, saved with the active turn. */
  lastCall: [number | null, number | null];
}

interface QueueEntry {
  user: User;
  waiting: Promise<LiveMatch>;
  resolve: (m: LiveMatch) => void;
}

export interface Arena {
  live: Map<string, LiveMatch>;
  queue: QueueEntry[];
  recovered: boolean;
}

const g = globalThis as unknown as { __tdArena?: Arena };
function arena(): Arena {
  const host = durableHost();
  const fresh = (): Arena => ({ live: new Map(), queue: [], recovered: false });
  const a = host ? (host.arena ??= fresh()) : (g.__tdArena ??= fresh());
  if (!a.recovered) {
    a.recovered = true;
    recover(a);
  }
  return a;
}

export interface MatchRow {
  id: string;
  seed: number;
  mode: Mode;
  status: "active" | "finished";
  p0: number;
  p1: number;
  log: string;
  resolved_rounds: number;
  winner: string | null;
  end_reason: string | null;
  lives0: number;
  lives1: number;
  rating0_before: number | null;
  rating0_after: number | null;
  rating1_before: number | null;
  rating1_after: number | null;
  playbook0: number | null;
  playbook1: number | null;
  debrief0: string | null;
  debrief1: string | null;
  calls0: number;
  calls1: number;
  created_at: number;
  finished_at: number | null;
}

function restoreMatch(row: MatchRow): LiveMatch {
  const state = rebuild(row);
  const users: [number, number] = [row.p0, row.p1];
  const botLevels = users.map((id) => userById(id)?.bot_level ?? null) as [number | null, number | null];
  return {
    id: row.id, mode: row.mode, state, users, botLevels, deadline: 0, timer: null,
    waiters: new Set(), misses: [0, 0], acted: [false, false], calls: [row.calls0, row.calls1], lastCall: [null, null],
  };
}

function recover(a: Arena) {
  for (const row of all<MatchRow>("SELECT * FROM matches WHERE status = 'active'")) {
    const m = restoreMatch(row);
    const { state, botLevels } = m;
    a.live.set(m.id, m);
    const clock = get<{ deadline: number; turn_state: string }>("SELECT deadline, turn_state FROM match_clocks WHERE match_id = ?", m.id);
    if (clock) {
      const saved = JSON.parse(clock.turn_state);
      m.misses = saved.misses;
      m.acted = saved.acted;
      m.lastCall = saved.lastCall;
      for (const p of [0, 1] as const) if (saved.committed[p]) commit(state, p);
    } else {
      for (const p of [0, 1] as const) if (botLevels[p] !== null) commit(state, p);
    }
    armClock(m, clock?.deadline);
  }
}

function persist(m: LiveMatch) {
  const s = m.state;
  run(
    "UPDATE matches SET log = ?, resolved_rounds = ?, lives0 = ?, lives1 = ?, calls0 = ?, calls1 = ? WHERE id = ?",
    writeMatchLog(s), s.history.length, s.lanes[0].lives, s.lanes[1].lives, m.calls[0], m.calls[1], m.id,
  );
  if (s.status === "planning") {
    const snapshot = { misses: m.misses, acted: m.acted, committed: s.lanes.map(l => l.committed), lastCall: m.lastCall };
    run("INSERT OR REPLACE INTO match_clocks (match_id, deadline, turn_state) VALUES (?, ?, ?)", m.id, m.deadline, JSON.stringify(snapshot));
  } else run("DELETE FROM match_clocks WHERE match_id = ?", m.id);
}

function turnLength(m: LiveMatch): number {
  const base = m.mode === "ranked" ? CLOCK.ranked() : CLOCK.practice();
  return m.state.round === 1 ? base + CLOCK.firstRoundBonus() : base;
}

function scheduleArenaAlarm() {
  const host = durableHost();
  if (!host) return;
  let next = Infinity;
  for (const m of arena().live.values()) if (m.state.status === "planning") next = Math.min(next, m.deadline);
  host.schedule(Number.isFinite(next) ? next : null);
}

export function expireDueMatches(): void {
  const now = Date.now();
  for (const m of arena().live.values())
    if (m.state.status === "planning" && m.deadline <= now) onDeadline(m);
  scheduleArenaAlarm();
}

function armClock(m: LiveMatch, deadline = Date.now() + turnLength(m)) {
  if (m.timer) clearTimeout(m.timer);
  m.deadline = deadline;
  if (durableHost()) { scheduleArenaAlarm(); return; }
  m.timer = setTimeout(() => onDeadline(m), Math.max(0, deadline - Date.now()));
  // Never keep the process alive just for a turn clock.
  (m.timer as { unref?: () => void }).unref?.();
}

function openRound(m: LiveMatch) {
  m.acted = [false, false];
  for (const p of [0, 1] as const) {
    const level = m.botLevels[p];
    if (level === null) continue;
    playBotTurn(m.state, p, level, snapshotOpponent(m.state, p));
    commit(m.state, p);
  }
  armClock(m);
  persist(m);
}

function wake(m: LiveMatch) {
  const waiters = [...m.waiters];
  m.waiters.clear();
  for (const w of waiters) w();
}

function onDeadline(m: LiveMatch) {
  if (m.state.status !== "planning") return;
  for (const p of [0, 1] as const) {
    if (m.state.lanes[p].committed) continue;
    m.misses[p] = m.acted[p] ? 0 : m.misses[p] + 1;
    if (m.misses[p] >= CLOCK.maxMisses) {
      forfeit(m.state, p, `Forfeit: ${CLOCK.maxMisses} turns in a row expired with no actions.`);
      finish(m);
      return;
    }
    commit(m.state, p);
  }
  resolve(m);
}

function resolve(m: LiveMatch): RoundRecord {
  const rec = resolveRound(m.state);
  if (m.state.status === "finished") finish(m);
  else openRound(m);
  wake(m);
  return rec;
}

function finish(m: LiveMatch) {
  if (m.timer) clearTimeout(m.timer);
  m.timer = null;
  const s = m.state;
  const winner = s.winner as Winner;
  const players = m.users.map((id) => userById(id)!) as [User, User];
  const score = (p: 0 | 1) => (winner === "draw" ? 0.5 : winner === p ? 1 : 0);
  const before: [number, number] = [players[0].rating, players[1].rating];
  const after: [number, number] = [before[0], before[1]];

  for (const p of [0, 1] as const) {
    const u = players[p];
    const sc = score(p);
    if (m.mode === "ranked") {
      // House bots are fixed points on the ladder: they record results but never move.
      if (u.bot_level === null) after[p] = nextRating(before[p], before[1 - p], sc, u.games);
      const streak = sc === 1 ? Math.max(1, u.streak + 1) : sc === 0 ? Math.min(-1, u.streak - 1) : 0;
      run(
        "UPDATE users SET rating = ?, peak_rating = MAX(peak_rating, ?), games = games + 1, wins = wins + ?, losses = losses + ?, draws = draws + ?, streak = ? WHERE id = ?",
        after[p], after[p], sc === 1 ? 1 : 0, sc === 0 ? 1 : 0, sc === 0.5 ? 1 : 0, streak, u.id,
      );
    }
  }
  persist(m);
  run(
    `UPDATE matches SET status = 'finished', winner = ?, end_reason = ?, finished_at = ?,
       rating0_before = ?, rating0_after = ?, rating1_before = ?, rating1_after = ?, debrief0 = ?, debrief1 = ? WHERE id = ?`,
    String(winner), s.endReason, Date.now(), before[0], after[0], before[1], after[1],
    JSON.stringify(debrief(s, 0)), JSON.stringify(debrief(s, 1)), m.id,
  );
  wake(m);
  arena().live.delete(m.id);
  scheduleArenaAlarm();
}

function create(mode: Mode, a: User, b: User, seed?: number): LiveMatch {
  const id = randomBytes(6).toString("base64url");
  const matchSeed = seed ?? randomBytes(4).readUInt32LE(0) % 1_000_000_000;
  const m: LiveMatch = {
    id, mode, state: createDuel(matchSeed), users: [a.id, b.id], botLevels: [a.bot_level, b.bot_level],
    deadline: 0, timer: null, waiters: new Set(), misses: [0, 0], acted: [false, false], calls: [0, 0], lastCall: [null, null],
  };
  run(
    "INSERT INTO matches (id, seed, mode, status, p0, p1, log, lives0, lives1, playbook0, playbook1, created_at) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)",
    id, matchSeed, mode, a.id, b.id, writeMatchLog(m.state), m.state.lanes[0].lives, m.state.lanes[1].lives,
    latestPlaybook(a.id)?.version ?? null, latestPlaybook(b.id)?.version ?? null, Date.now(),
  );
  arena().live.set(id, m);
  openRound(m);
  return m;
}

export function activeMatch(userId: number): LiveMatch | undefined {
  for (const m of arena().live.values()) if (m.state.status === "planning" && m.users.includes(userId)) return m;
  return undefined;
}

export function liveMatch(id: string): LiveMatch | undefined {
  return arena().live.get(id);
}

export function recentlyFinished(userId: number): LiveMatch | undefined {
  const row = recentMatches(userId, 1)[0];
  if (row?.status === "finished" && row.finished_at && row.finished_at >= Date.now() - 60_000)
    return restoreMatch(row);
  return undefined;
}

export function playerIndex(m: LiveMatch, userId: number): 0 | 1 | null {
  return m.users[0] === userId ? 0 : m.users[1] === userId ? 1 : null;
}

function nearestBot(rating: number): User {
  const ranked = bots().sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating));
  // Vary between the two closest so a player is not locked to one sparring partner.
  return ranked[Math.random() < 0.7 || ranked.length < 2 ? 0 : 1];
}

export interface FindOptions {
  mode: Mode;
  /** Practice only: a house bot handle to play against. */
  opponent?: string;
  /** Practice only: replay a specific map and wave schedule. */
  seed?: number;
  /** Ranked only: how long to hold out for another player, in ms. Defaults to the arena's queue wait. */
  waitMs?: number;
}

/** Find or resume a match. Ranked waits briefly for a human near the player's rating, then falls back to a house bot. */
export async function findMatch(user: User, opts: FindOptions): Promise<{ match: LiveMatch; resumed: boolean }> {
  const existing = activeMatch(user.id);
  if (existing) return { match: existing, resumed: true };

  const a = arena();
  const pending = a.queue.find(entry => entry.user.id === user.id);
  if (pending) {
    const match = await pending.waiting;
    return { match, resumed: true };
  }

  if (opts.mode === "practice") {
    const pool = bots();
    const wanted = opts.opponent?.toLowerCase();
    const bot = pool.find((b) => b.handle === wanted) ?? nearestBot(user.rating);
    return { match: create("practice", user, bot, opts.seed), resumed: false };
  }

  const idx = a.queue.findIndex((q) => q.user.id !== user.id && Math.abs(q.user.rating - user.rating) <= 300);
  if (idx >= 0) {
    const other = a.queue.splice(idx, 1)[0];
    const match = create("ranked", other.user, user);
    other.resolve(match);
    return { match, resumed: false };
  }

  let resolveEntry!: (m: LiveMatch) => void;
  const waiting = new Promise<LiveMatch>(res => { resolveEntry = res; });
  const entry: QueueEntry = { user, waiting, resolve: resolveEntry };
  a.queue.push(entry);
  const timer = setTimeout(() => {
    const i = a.queue.indexOf(entry);
    if (i < 0) return;
    a.queue.splice(i, 1);
    resolveEntry(create("ranked", user, nearestBot(user.rating)));
  }, Math.min(CLOCK.maxQueueWait, Math.max(0, opts.waitMs ?? CLOCK.queueWait())));
  try { return { match: await waiting, resumed: false }; }
  finally { clearTimeout(timer); }
}

export interface SubmitResult {
  results: ActionResult[];
  /** Set when this call caused the round to resolve. */
  resolved: boolean;
}

export function submit(m: LiveMatch, player: 0 | 1, actions: Action[], endTurn: boolean): SubmitResult {
  const results = actions.map((a) => applyAction(m.state, player, a));
  if (results.some((r) => r.ok)) m.acted[player] = true;
  let resolved = false;
  if (endTurn && m.state.status === "planning" && !m.state.lanes[player].committed) {
    commit(m.state, player);
    m.acted[player] = true;
    m.misses[player] = 0;
    if (bothCommitted(m.state)) {
      resolve(m);
      resolved = true;
    }
  }
  if (!resolved) persist(m);
  return { results, resolved };
}

/** Wait until the match moves past `round` or ends. Resolves false on timeout. */
export function waitForRound(m: LiveMatch, round: number, ms: number): Promise<boolean> {
  const moved = () => m.state.status === "finished" || m.state.round > round;
  if (moved()) return Promise.resolve(true);
  return new Promise((res) => {
    const done = () => {
      clearTimeout(t);
      m.waiters.delete(done);
      res(moved());
    };
    const t = setTimeout(done, ms);
    m.waiters.add(done);
  });
}

export function resign(m: LiveMatch, player: 0 | 1): void {
  if (m.state.status !== "planning") return;
  forfeit(m.state, player, "Resigned.");
  finish(m);
}

export function countCall(m: LiveMatch, player: 0 | 1): void {
  m.calls[player]++;
  m.lastCall[player] = Date.now();
}

export function matchRow(id: string): MatchRow | undefined {
  return get<MatchRow>("SELECT * FROM matches WHERE id = ?", id);
}

export function matchDebrief(row: MatchRow, player: 0 | 1): Debrief | null {
  const raw = player === 0 ? row.debrief0 : row.debrief1;
  return raw ? (JSON.parse(raw) as Debrief) : null;
}

/** Rebuild a stored match. A forfeit is not in the action log, so the stored result is restored on top. */
export function rebuild(row: MatchRow): DuelState {
  const log = readMatchLog(row.log);
  const state = replayDuel(row.seed, log.rounds, row.resolved_rounds, log.rulesVersion);
  if (row.status === "finished" && state.status !== "finished") {
    state.status = "finished";
    state.winner = row.winner === "draw" ? "draw" : (Number(row.winner) as 0 | 1);
    state.endReason = row.end_reason;
  }
  return state;
}

export function recentMatches(userId: number, limit = 20): MatchRow[] {
  return all<MatchRow>("SELECT * FROM matches WHERE (p0 = ? OR p1 = ?) ORDER BY created_at DESC LIMIT ?", userId, userId, limit);
}
