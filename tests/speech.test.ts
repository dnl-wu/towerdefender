import assert from "node:assert/strict";
import { test } from "node:test";
import { playBotTurn, snapshotOpponent } from "../src/engine/bots.ts";
import { SPEECH_LIMIT, applyAction, commit, createDuel, replayDuel, resolveRound, type Action } from "../src/engine/duel.ts";
import { roundReport } from "../src/engine/report.ts";
import { stateView } from "../src/engine/view.ts";
import { laneOf } from "../src/server/lane.ts";

test("a player can say one clean line a round, and it changes nothing in the game", () => {
  const s = createDuel(77);
  const gold = s.lanes[0].gold;
  assert.equal(applyAction(s, 0, { type: "say", text: "" }).ok, false);
  assert.equal(applyAction(s, 0, { type: "say", text: "x".repeat(SPEECH_LIMIT + 1) }).ok, false);
  const said = applyAction(s, 0, { type: "say", text: "  Hello,\n\tneighbour!‮  " });
  assert.ok(said.ok);
  assert.deepEqual(s.log[0][0], [{ type: "say", text: "Hello, neighbour!" }], "the stored line is one clean line");
  assert.equal(applyAction(s, 0, { type: "say", text: "again" }).ok, false, "once a round");
  assert.equal(s.lanes[0].gold, gold);

  commit(s, 0); commit(s, 1);
  const rec = resolveRound(s);
  assert.equal(rec.sides[0].said, "Hello, neighbour!");
  assert.equal(rec.sides[1].said, null);
  assert.equal(s.lanes[0].said, null, "a new round starts silent");
  assert.ok(applyAction(s, 0, { type: "say", text: "Round two." }).ok);

  // The opponent hears it: in the round report, in their state, and in their view of the log.
  assert.equal(roundReport(s, 1, rec).opponentSaid, "Hello, neighbour!");
  assert.equal(stateView(s, 1).opponent.saidLastRound, "Hello, neighbour!");
  assert.deepEqual(laneOf(s, s.log, 1, 1).log[0][0], [{ type: "say", text: "Hello, neighbour!" }]);
});

test("house bots talk, and their talk has no effect on how the match plays out", () => {
  const s = createDuel(31337);
  while (s.status === "planning") {
    const snaps = [snapshotOpponent(s, 0), snapshotOpponent(s, 1)];
    playBotTurn(s, 0, 5, snaps[0], 11); playBotTurn(s, 1, 3, snaps[1], 12);
    commit(s, 0); commit(s, 1);
    resolveRound(s);
  }
  const lines = s.log.flatMap((r) => r.flatMap((acts) => acts.filter((a) => a.type === "say")));
  assert.ok(lines.length >= 2, "both bots greet in round one");
  assert.ok(lines.every((a) => a.type === "say" && a.text.length <= SPEECH_LIMIT));

  const silent = s.log.map((r) => r.map((acts) => acts.filter((a) => a.type !== "say")) as [Action[], Action[]]);
  const replayed = replayDuel(s.seed, silent, s.history.length);
  assert.deepEqual(replayed.history.map((r) => r.sides.map((d) => [d.livesAfter, d.goldAfter, d.incomeAfter])), s.history.map((r) => r.sides.map((d) => [d.livesAfter, d.goldAfter, d.incomeAfter])));
  assert.equal(replayed.winner, s.winner);
});
