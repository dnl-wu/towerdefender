// The public view of a match for spectators. The action log is cut at the last
// resolved round, so a planning phase in progress is never exposed.
import type { Action } from "../engine/duel.ts";
import type { Feed, FeedPlayer } from "../viewer/feed.ts";
import { userById } from "./accounts.ts";
import { liveMatch, matchRow, recentMatches, type MatchRow } from "./arena.ts";
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

export function matchFeed(id: string): Feed | null {
  const row = matchRow(id);
  if (!row) return null;
  const live = row.status === "active" ? liveMatch(id) : undefined;
  const log = (JSON.parse(row.log) as [Action[], Action[]][]).slice(0, row.resolved_rounds);
  return {
    id: row.id, seed: row.seed, mode: row.mode, status: row.status, resolvedRounds: row.resolved_rounds, log,
    winner: row.winner === null ? null : row.winner === "draw" ? "draw" : (Number(row.winner) as 0 | 1),
    endReason: row.end_reason, createdAt: row.created_at, finishedAt: row.finished_at,
    players: [player(row, 0), player(row, 1)],
    live: live ? { turnEnded: [live.state.lanes[0].committed, live.state.lanes[1].committed], deadline: live.deadline, lastCall: live.lastCall, now: Date.now() } : null,
  };
}

export interface MatchSummary { id: string; status: string; mode: string; rounds: number; players: [string, string]; createdAt: number }

export function latestMatches(limit = 20): MatchSummary[] {
  return all<MatchRow>("SELECT * FROM matches ORDER BY created_at DESC LIMIT ?", limit).map((r) => ({
    id: r.id, status: r.status, mode: r.mode, rounds: r.resolved_rounds, createdAt: r.created_at,
    players: [userById(r.p0)?.handle ?? "?", userById(r.p1)?.handle ?? "?"],
  }));
}

export { recentMatches };
