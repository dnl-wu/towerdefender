// What each viewer may see of a match. A finished match is public in full. A
// live match is never shown in full to anyone: each of its two players sees
// their own lane plus their agent's fog-of-war intel, and everyone else sees
// public facts. Anything a viewer can load, an agent can load too, so these
// rules are what keeps the opponent's board, gold and income hidden.
import { endKind, type EndKind } from "../engine/duel.ts";
import { readMatchLog } from "../engine/match-log.ts";
import type { Feed, FeedPlayer, MatchSummary, MatchView } from "../viewer/feed.ts";
import { avatarSeed, islandOf, userById, type User } from "./accounts.ts";
import { liveMatch, matchRow, rebuild, type MatchRow } from "./arena.ts";
import { laneOf } from "./lane.ts";
import { all } from "./db.ts";
import { rankLabel } from "./rating.ts";

function player(row: MatchRow, p: 0 | 1): FeedPlayer {
  const u = userById(p === 0 ? row.p0 : row.p1)!;
  return {
    handle: u.handle, rating: u.rating, peak: u.peak_rating, rank: rankLabel(u),
    games: u.games, wins: u.wins, losses: u.losses, draws: u.draws, streak: u.streak,
    avatarSeed: avatarSeed(u), houseBot: u.bot_level !== null, tagline: u.tagline, agentModel: u.bot_level !== null ? "" : u.agent_model,
    playbookVersion: p === 0 ? row.playbook0 : row.playbook1,
    calls: p === 0 ? row.calls0 : row.calls1,
    ratingBefore: p === 0 ? row.rating0_before : row.rating1_before,
    ratingAfter: p === 0 ? row.rating0_after : row.rating1_after,
    island: islandOf(u),
  };
}

/** Which player a signed-in viewer is in this match, if any. */
export function seatOf(row: MatchRow, viewerId: number | undefined): 0 | 1 | null {
  if (viewerId === undefined) return null;
  return row.p0 === viewerId ? 0 : row.p1 === viewerId ? 1 : null;
}

/** The match as this viewer may see it. `viewerId` is the signed-in user, if any. */
export function matchView(id: string, viewerId?: number): MatchView | null {
  const row = matchRow(id);
  if (!row) return null;
  const players: [FeedPlayer, FeedPlayer] = [player(row, 0), player(row, 1)];
  const { rulesVersion, rounds } = readMatchLog(row.log);
  const log = rounds.slice(0, row.resolved_rounds);
  const base = {
    id: row.id, seed: row.seed, rulesVersion, mode: row.mode, status: row.status, resolvedRounds: row.resolved_rounds,
    winner: readWinner(row.winner),
    endReason: row.end_reason, createdAt: row.created_at, finishedAt: row.finished_at, players,
  };
  if (row.status === "finished") return { view: "full", ...base, log, live: null, finalLives: [row.lives0, row.lives1] };

  const live = liveMatch(id);
  const state = live?.state ?? rebuild(row);
  const seat = seatOf(row, viewerId);
  if (seat === null) {
    const summary: MatchSummary = {
      view: "summary", id: row.id, mode: row.mode, status: "active", resolvedRounds: row.resolved_rounds, players,
      lives: state.history.map((r) => [r.sides[0].livesAfter, r.sides[1].livesAfter]),
    };
    return summary;
  }
  const { log: laneLog, lane } = laneOf(state, log, seat, row.resolved_rounds);
  const feed: Feed = {
    view: "lane", ...base, log: laneLog,
    live: live ? { turnEnded: [live.state.lanes[0].committed, live.state.lanes[1].committed], deadline: live.deadline, lastCall: live.lastCall, now: Date.now() } : null,
    lane,
  };
  return feed;
}

function readWinner(value: string | null): Feed["winner"] {
  if (value === "0") return 0;
  if (value === "1") return 1;
  return value === "draw" ? "draw" : null;
}

export interface MatchListing {
  id: string;
  status: MatchRow["status"];
  mode: MatchRow["mode"];
  rounds: number;
  players: [string, string];
  winner: Feed["winner"];
  lives: [number, number];
  end: EndKind | null;
  /** Rating gained or lost by each player. Null in practice, and for house bots, whose ratings never move. */
  ratingChange: [number | null, number | null];
  /** When it ended, or when it began if it is still being played. */
  at: number;
}

type ListingRow = Pick<MatchRow, "id" | "status" | "mode" | "resolved_rounds" | "winner" | "lives0" | "lives1" | "end_reason"
  | "rating0_before" | "rating0_after" | "rating1_before" | "rating1_after" | "created_at" | "finished_at"> & { handle0: string; handle1: string; bot0: number | null; bot1: number | null };

const listingColumns = `SELECT m.id, m.status, m.mode, m.resolved_rounds, m.winner, m.lives0, m.lives1, m.end_reason,
  m.rating0_before, m.rating0_after, m.rating1_before, m.rating1_after, m.created_at, m.finished_at,
  a.handle AS handle0, b.handle AS handle1, a.bot_level AS bot0, b.bot_level AS bot1 FROM matches m
  JOIN users a ON a.id = m.p0 JOIN users b ON b.id = m.p1`;

function listing(row: ListingRow): MatchListing {
  return {
    id: row.id, mode: row.mode, status: row.status, rounds: row.resolved_rounds,
    players: [row.handle0, row.handle1], winner: readWinner(row.winner), lives: [row.lives0, row.lives1],
    end: endKind(row.end_reason), at: row.finished_at ?? row.created_at,
    ratingChange: [change(row.mode, row.bot0, row.rating0_before, row.rating0_after), change(row.mode, row.bot1, row.rating1_before, row.rating1_after)],
  };
}

function change(mode: MatchRow["mode"], bot: number | null, before: number | null, after: number | null): number | null {
  return mode === "ranked" && bot === null && before !== null && after !== null ? Math.round(after) - Math.round(before) : null;
}

export function latestReplays(limit = 12): MatchListing[] {
  return all<ListingRow>(`${listingColumns} WHERE m.status = 'finished' ORDER BY m.finished_at DESC LIMIT ?`, limit).map(listing);
}

export function matchesFor(userId: number, limit = 30): MatchListing[] {
  return all<ListingRow>(`${listingColumns} WHERE m.p0 = ? OR m.p1 = ? ORDER BY m.created_at DESC LIMIT ?`, userId, userId, limit).map(listing);
}

/** A player's rating after each of their recent ranked matches, oldest first, starting from where they stood before the first. */
export function ratingHistory(user: Pick<User, "id">, limit = 60): number[] {
  const rows = all<{ before: number; after: number }>(
    `SELECT CASE WHEN p0 = ? THEN rating0_before ELSE rating1_before END AS before, CASE WHEN p0 = ? THEN rating0_after ELSE rating1_after END AS after
     FROM matches WHERE status = 'finished' AND mode = 'ranked' AND (p0 = ? OR p1 = ?) AND rating0_after IS NOT NULL ORDER BY finished_at DESC, rowid DESC LIMIT ?`,
    user.id, user.id, user.id, user.id, limit,
  ).reverse();
  return rows.length ? [rows[0].before, ...rows.map((r) => r.after)] : [];
}
