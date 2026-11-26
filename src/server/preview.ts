// The island on the landing page: a few rounds of a real match between two house
// bots, played on the server once and replayed in the browser.
import { BOTS, playBotTurn, snapshotOpponent } from "../engine/bots.ts";
import { commit, createDuel, resolveRound } from "../engine/duel.ts";
import type { Lighting } from "../viewer/voxel.ts";
import type { Feed, FeedPlayer } from "../viewer/feed.ts";
import { rankFor } from "./rating.ts";

export interface IslandPreview { feed: Feed; lighting: Lighting["key"] }

// Played to a round where the defence is built up and a busy wave is on the road.
const SHOWCASE = { seed: 914, round: 9, lighting: "golden" } as const;

function botPlayer(level: number): FeedPlayer {
  const b = BOTS.find((x) => x.level === level)!;
  return {
    handle: b.handle, rating: b.rating, peak: b.rating, rank: rankFor(b.rating).label, games: 0, wins: 0, losses: 0, draws: 0, streak: 0,
    avatarSeed: level * 7919, houseBot: true, tagline: b.tagline, agentModel: "", playbookVersion: null, calls: 0, ratingBefore: null, ratingAfter: null,
  };
}

let cached: IslandPreview | null = null;

export function landingIsland(): IslandPreview {
  if (cached) return cached;
  const { seed, round, lighting } = SHOWCASE;
  const s = createDuel(seed);
  while (s.status === "planning" && s.history.length < round) {
    const snaps = [snapshotOpponent(s, 0), snapshotOpponent(s, 1)];
    playBotTurn(s, 0, 5, snaps[0]);
    playBotTurn(s, 1, 4, snaps[1]);
    commit(s, 0); commit(s, 1);
    resolveRound(s);
  }
  // Never loop the round a core falls in: the island would show the end of a match, not one under way.
  const resolved = s.status === "finished" ? s.history.length - 1 : s.history.length;
  // Shown as a match in progress, so the replay loops its last round instead of running on to the result.
  const feed: Feed = {
    view: "full", id: `preview-${seed}`, seed, rulesVersion: s.map.rulesVersion, mode: "practice", status: "active", resolvedRounds: resolved,
    log: s.log.slice(0, resolved), winner: null, endReason: null, createdAt: 0, finishedAt: null,
    players: [botPlayer(5), botPlayer(4)], live: null,
  };
  return (cached = { feed, lighting });
}
