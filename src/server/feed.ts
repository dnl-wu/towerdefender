// What each viewer may see of a match. A finished match is public in full. A
// live match is never shown in full to anyone: each of its two players sees
// their own lane plus their agent's fog-of-war intel, and everyone else sees
// public facts. Anything a viewer can load, an agent can load too, so these
// rules are what keeps the opponent's board, gold and income hidden.
import type { Action } from "../engine/duel.ts";
import type { Feed, FeedPlayer, MatchSummary, MatchView } from "../viewer/feed.ts";
import { userById } from "./accounts.ts";
import { liveMatch, matchRow, rebuild, recentMatches, type MatchRow } from "./arena.ts";
import { laneOf } from "./lane.ts";
import { all } from "./db.ts";
import { PLACEMENT_GAMES, rankFor } from "./rating.ts";

function player(row: MatchRow, p: 0 | 1): FeedPlayer {
  const u = userById(p === 0 ? row.p0 : row.p1)!;
  let avatarSeed = 1;
  try { avatarSeed = Number(JSON.parse(u.avatar).seed) || 1; } catch { /* malformed avatar: fall back to a fixed figure */ }
  return {
    handle: u.handle, rating: u.rating, peak: u.peak_rating,
    rank: u.bot_level === null && u.games < PLACEMENT_GAMES ? "Unranked" : rankFor(u.rating).label,
    games: u.games, wins: u.wins, losses: u.losses, draws: u.draws, streak: u.streak,
    avatarSeed, houseBot: u.bot_level !== null, tagline: u.tagline, agentModel: u.bot_level !== null ? "" : u.agent_model,
    playbookVersion: p === 0 ? row.playbook0 : row.playbook1,
    calls: p === 0 ? row.calls0 : row.calls1,
    ratingBefore: p === 0 ? row.rating0_before : row.rating1_before,
    ratingAfter: p === 0 ? row.rating0_after : row.rating1_after,
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
  const log = (JSON.parse(row.log) as [Action[], Action[]][]).slice(0, row.resolved_rounds);
  const base = {
    id: row.id, seed: row.seed, mode: row.mode, status: row.status, resolvedRounds: row.resolved_rounds,
    winner: row.winner === null ? null : row.winner === "draw" ? "draw" as const : (Number(row.winner) as 0 | 1),
    endReason: row.end_reason, createdAt: row.created_at, finishedAt: row.finished_at, players,
  };
  if (row.status === "finished") return { view: "full", ...base, log, live: null };

  const state = rebuild(row);
  const seat = seatOf(row, viewerId);
  if (seat === null) {
    const summary: MatchSummary = {
      view: "summary", id: row.id, mode: row.mode, status: "active", resolvedRounds: row.resolved_rounds, players,
      lives: state.history.map((r) => [r.sides[0].livesAfter, r.sides[1].livesAfter]),
    };
    return summary;
  }
  const { log: laneLog, lane } = laneOf(state, log, seat, row.resolved_rounds);
  const live = liveMatch(id);
  const feed: Feed = {
    view: "lane", ...base, log: laneLog,
    live: live ? { turnEnded: [live.state.lanes[0].committed, live.state.lanes[1].committed], deadline: live.deadline, lastCall: live.lastCall, now: Date.now() } : null,
    lane,
  };
  return feed;
}

export interface MatchListing { id: string; status: string; mode: string; rounds: number; players: [string, string]; createdAt: number }

const listing = (r: MatchRow): MatchListing => ({
  id: r.id, status: r.status, mode: r.mode, rounds: r.resolved_rounds, createdAt: r.created_at,
  players: [userById(r.p0)?.handle ?? "?", userById(r.p1)?.handle ?? "?"],
});

export function latestMatches(limit = 20): MatchListing[] {
  return all<MatchRow>("SELECT * FROM matches ORDER BY created_at DESC LIMIT ?", limit).map(listing);
}

export function matchesFor(userId: number, limit = 30): MatchListing[] {
  return recentMatches(userId, limit).map(listing);
}
