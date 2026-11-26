import assert from "node:assert/strict";
import { test } from "node:test";
import { playBotTurn, snapshotOpponent } from "../src/engine/bots.ts";
import { commit, createDuel, replayDuel, resolveRound } from "../src/engine/duel.ts";
import type { Feed, FeedPlayer } from "../src/viewer/feed.ts";
import { Playback } from "../src/viewer/playback.ts";

const player = (handle: string): FeedPlayer => ({
  handle, rating: 1000, rank: "", peak: 1000, games: 0, wins: 0, losses: 0, draws: 0, streak: 0, avatarSeed: 1,
  houseBot: true, tagline: "", agentModel: "", playbookVersion: null, calls: 0, ratingBefore: null, ratingAfter: null,
});

/** A finished match between two house bots, as a replay feed. */
function finishedFeed(seed: number): Feed {
  const s = createDuel(seed);
  while (s.status === "planning") {
    const snaps = [snapshotOpponent(s, 0), snapshotOpponent(s, 1)];
    playBotTurn(s, 0, 4, snaps[0]); playBotTurn(s, 1, 2, snaps[1]);
    commit(s, 0); commit(s, 1);
    resolveRound(s);
  }
  return {
    view: "full", id: "t", seed, rulesVersion: s.map.rulesVersion, mode: "practice", status: "finished", resolvedRounds: s.history.length,
    log: s.log, winner: s.winner, endReason: s.endReason, createdAt: 0, finishedAt: 1, players: [player("a"), player("b")], live: null,
  } as Feed;
}

test("a replay can jump to any round and land on the same board as watching up to it", () => {
  const feed = finishedFeed(4242);
  const n = feed.resolvedRounds;
  assert.ok(n >= 4, "the match should run a few rounds");
  const pb = new Playback(feed, 0);

  const target = Math.ceil(n / 2);
  pb.seek(target);
  assert.equal(pb.round, target);
  assert.equal(pb.phase, "build");
  const expected = replayDuel(feed.seed, feed.log, target - 1, feed.rulesVersion);
  for (const p of [0, 1] as const) {
    assert.equal(pb.duel.lanes[p].lives, expected.lanes[p].lives);
    assert.deepEqual(pb.duel.lanes[p].towers.map((t) => [t.type, t.x, t.y, t.level]), expected.lanes[p].towers.map((t) => [t.type, t.x, t.y, t.level]));
  }

  pb.next();
  assert.equal(pb.round, target + 1);
  pb.previous(); // only just begun, so back to the round before
  assert.equal(pb.round, target);

  pb.seek(n + 1);
  assert.equal(pb.phase, "final");
  assert.equal(pb.hud().result?.text, feed.winner === 0 ? "Victory" : feed.winner === 1 ? "Defeat" : "Draw");
  // The result stays on screen: a replay no longer loops by itself.
  for (let i = 0; i < 400; i++) pb.update(0.1);
  assert.equal(pb.phase, "final");
  pb.next();
  assert.equal(pb.round, 1, "from the result, next starts again");
});

test("a paused replay holds still, and a faster one gets further in the same time", () => {
  const feed = finishedFeed(4242);
  const paused = new Playback(feed, 0);
  paused.paused = true;
  for (let i = 0; i < 100; i++) paused.update(0.1);
  assert.equal(paused.round, 1);
  assert.equal(paused.phase, "build");

  const normal = new Playback(feed, 0), fast = new Playback(feed, 0);
  fast.rate = 4;
  for (let i = 0; i < 300; i++) { normal.update(0.1); fast.update(0.1); }
  assert.ok(fast.round > normal.round, `4x reached round ${fast.round}, 1x round ${normal.round}`);
});
