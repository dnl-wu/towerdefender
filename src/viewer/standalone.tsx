// A self-contained spectator page for design review: it plays a real match
// between two house bots in the browser, with the real engine, and replays it.
// Built by scripts/standalone.ts. Nothing here is mocked except the absence of a server.
import { createRoot } from "react-dom/client";
import { BOTS, playBotTurn, snapshotOpponent } from "../engine/bots.ts";
import { commit, createDuel, resolveRound } from "../engine/duel.ts";
import { rankFor } from "../server/rating.ts";
import type { Feed, FeedPlayer } from "./feed.ts";
import { MatchViewer } from "./MatchViewer.tsx";

function botMatch(seed: number, a: number, b: number) {
  const s = createDuel(seed);
  while (s.status === "planning") {
    const snaps = [snapshotOpponent(s, 0), snapshotOpponent(s, 1)];
    playBotTurn(s, 0, a, snaps[0]);
    playBotTurn(s, 1, b, snaps[1]);
    commit(s, 0); commit(s, 1);
    resolveRound(s);
  }
  return s;
}

function botPlayer(level: number): FeedPlayer {
  const b = BOTS.find((x) => x.level === level)!;
  return {
    handle: b.handle, rating: b.rating, peak: b.rating, rank: rankFor(b.rating).label, games: 0, wins: 0, losses: 0, draws: 0, streak: 0,
    avatarSeed: level * 7919, houseBot: true, tagline: b.tagline, agentModel: "", playbookVersion: null, calls: 0, ratingBefore: null, ratingAfter: null,
  };
}

const params = new URLSearchParams(location.search);
const levels: [number, number] = [Number(params.get("a") ?? 5), Number(params.get("b") ?? 4)];
// Unless a seed is given, look for a match long enough to be worth watching.
let seed = Number(params.get("seed") ?? 0), s = seed ? botMatch(seed, ...levels) : null;
for (let i = 1; !s && i < 40; i++) { const m = botMatch(i * 37, ...levels); if (m.history.length >= 12 || i === 39) { s = m; seed = i * 37; } }
const feed: Feed = {
  view: "full", id: "standalone", seed, mode: "practice", status: "finished", resolvedRounds: s!.history.length, log: s!.log,
  winner: s!.winner, endReason: s!.endReason, createdAt: Date.now(), finishedAt: Date.now(), players: [botPlayer(levels[0]), botPlayer(levels[1])], live: null,
};
createRoot(document.getElementById("root")!).render(<MatchViewer initial={feed} onReady={(pb, scene) => Object.assign(window, { __td: { pb, scene } })} />);
