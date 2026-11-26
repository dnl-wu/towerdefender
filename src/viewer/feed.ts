// What the match page is given. Three views, decided on the server:
// - "full": a finished match. Everything is revealed, like cards at a showdown.
// - "lane": a live match, for one of its two players. Your own lane in full; of
//   the opponent only what fog of war lets your agent know.
// - "summary": a live match, for anyone else. Public facts only.
// A live match's log never includes the round being planned.
import type { CoreHit } from "../engine/battle.ts";
import type { RulesVersion } from "../engine/match-log.ts";
import type { Action, SeenTower } from "../engine/duel.ts";
import type { IslandStyle } from "./island-style.ts";

export interface FeedPlayer {
  handle: string;
  rating: number;
  rank: string;
  peak: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  avatarSeed: number;
  houseBot: boolean;
  tagline: string;
  /** Model name the owner entered for their agent, if any. */
  agentModel: string;
  /** Playbook version in use when the match began. */
  playbookVersion: number | null;
  /** MCP tool calls made in this match. */
  calls: number;
  ratingBefore: number | null;
  ratingAfter: number | null;
  /** How this player's lane is drawn. Cosmetic only; absent means the default island. */
  island?: IslandStyle;
}

export interface Feed {
  view: "full" | "lane";
  id: string;
  seed: number;
  rulesVersion?: RulesVersion;
  mode: "ranked" | "practice";
  status: "active" | "finished";
  resolvedRounds: number;
  /** In a lane view, the opponent's half of each round holds only the raiders they sent at you. */
  log: [Action[], Action[]][];
  winner: 0 | 1 | "draw" | null;
  /** Signed core lives when the match ended, in original seat order. */
  finalLives?: [number, number];
  endReason: string | null;
  createdAt: number;
  finishedAt: number | null;
  players: [FeedPlayer, FeedPlayer];
  /** Present while the match is being played. Times are server epoch milliseconds. */
  live: null | {
    turnEnded: [boolean, boolean];
    deadline: number;
    /** When each agent last made an MCP call; null if not seen since the server started. */
    lastCall: [number | null, number | null];
    now: number;
  };
  /** Present only in a lane view. */
  lane?: LaneInfo;
}

/** What one player is entitled to see of their live match beyond their own moves. */
export interface LaneInfo {
  /** Which player you are. */
  side: 0 | 1;
  /** Only the viewing player’s accepted orders from the open planning round. */
  planning: { round: number; actions: Action[] };
  /** Settled after each resolved round, for values your own lane cannot reproduce (stolen gold, their lives). */
  rounds: { goldAfter: number; incomeAfter: number; livesAfter: number; opponentLivesAfter: number; goldStolen: number; livesTaken: number; sentHits: Pick<CoreHit, "tick" | "unit">[] }[];
  /** Opponent towers your agent has seen, as last seen. */
  intel: SeenTower[];
  /** Round of your agent's last Scanner, or 0. */
  lastScanRound: number;
}

/** A live match for someone who is not playing in it. */
export interface MatchSummary {
  view: "summary";
  id: string;
  mode: "ranked" | "practice";
  status: "active";
  resolvedRounds: number;
  players: [FeedPlayer, FeedPlayer];
  /** Lives after each resolved round, per player. */
  lives: [number, number][];
}

export type MatchView = Feed | MatchSummary;
