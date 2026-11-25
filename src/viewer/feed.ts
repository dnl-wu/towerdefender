// What the spectator page is given about a match. Everything here is public:
// the action log stops at the last resolved round, so a planning phase in
// progress is never exposed.
import type { Action } from "../engine/duel.ts";

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
}

export interface Feed {
  id: string;
  seed: number;
  mode: "ranked" | "practice";
  status: "active" | "finished";
  resolvedRounds: number;
  log: [Action[], Action[]][];
  winner: 0 | 1 | "draw" | null;
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
}
