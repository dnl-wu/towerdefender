import assert from "node:assert/strict";
import { test } from "node:test";
import { playBotMatch } from "../scripts/balance.ts";
import { runBattle, type Tower } from "../src/engine/battle.ts";
import { RULES, UNITS, lootFor, scannerPrice, sendCap } from "../src/engine/data.ts";
import { applyAction, commit, createDuel, endKind, forfeit, replayDuel, resolveRound } from "../src/engine/duel.ts";
import { readMatchLog, writeMatchLog } from "../src/engine/match-log.ts";
import { generateMap, isBuildable } from "../src/engine/map.ts";
import { scoutView, stateView } from "../src/engine/view.ts";
import { debrief, roundReport } from "../src/engine/report.ts";
import { baseWave } from "../src/engine/waves.ts";

const tower = (over: Partial<Tower>): Tower => ({
  id: 1, type: "gatling", x: 0, y: 0, level: 1, spec: null, targeting: "first", invested: 0, dmg: 0, kills: 0, ...over,
});

test("maps have one unbroken path from the left edge to the right edge", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const map = generateMap(seed);
    assert.equal(map.path[0][0], 0);
    assert.equal(map.path[map.path.length - 1][0], map.w - 1);
    const seen = new Set<string>();
    for (let i = 0; i < map.path.length; i++) {
      const [x, y] = map.path[i];
      assert.ok(x >= 0 && x < map.w && y >= 0 && y < map.h, `seed ${seed}: cell off map`);
      assert.ok(!seen.has(`${x},${y}`), `seed ${seed}: path crosses itself`);
      seen.add(`${x},${y}`);
      if (i > 0) {
        const [px, py] = map.path[i - 1];
        assert.equal(Math.abs(px - x) + Math.abs(py - y), 1, `seed ${seed}: path jumps`);
      }
    }
    assert.ok(map.path.length >= 14, `seed ${seed}: path too short`);
  }
});

test("a match replays identically from its seed and action log, Scanners and intel included", () => {
  let scans = 0;
  for (const seed of [3, 77, 4242]) {
    const played = playBotMatch(seed, 5, 4);
    scans += played.lanes[0].totals.scannerGold;
    const replayed = replayDuel(seed, played.log, played.history.length);
    assert.deepEqual(replayed.history, played.history);
    assert.equal(replayed.winner, played.winner);
    assert.deepEqual(replayed.lanes, played.lanes);
  }
  assert.ok(scans > 0, "Tyrant bought Scanners in these matches, so their replay is covered");
});

test("an archived match keeps its combat rules and renamed orders after resuming", () => {
  const builds = ["nailgun", "mortar", "harpoon", "sentinel"].map((tower, i) => ({
    type: "build", tower, x: [0, 1, 2, 4][i], y: 0,
  }));
  const saved = readMatchLog(JSON.stringify([[builds, [{ type: "send", unit: "scuttler" }]]]));
  const state = replayDuel(73, saved.rounds, 1, saved.rulesVersion);
  // Recorded with the original engine at seed 73, before the health and range changes.
  assert.deepEqual(state.lanes[0].towers.map(t => [t.type, t.kills]), [
    ["gatling", 0], ["cannon", 14], ["ballista", 2], ["laser", 0],
  ]);
  assert.deepEqual(state.lanes.map(lane => [lane.lives, lane.gold]), [[20, 159], [9, 345]]);
  const resumed = readMatchLog(writeMatchLog(state));
  assert.equal(resumed.rulesVersion, 1);
  assert.deepEqual(replayDuel(73, resumed.rounds, 1, resumed.rulesVersion).lanes, state.lanes);
  assert.equal(readMatchLog(writeMatchLog(createDuel(73))).rulesVersion, 2);
});

test("illegal actions are rejected and change nothing", () => {
  const s = createDuel(11);
  const [px, py] = s.map.path[3];
  const before = JSON.stringify(s.lanes[0]);
  assert.equal(applyAction(s, 0, { type: "build", tower: "gatling", x: px, y: py }).ok, false);
  assert.equal(applyAction(s, 0, { type: "build", tower: "gatling", x: -1, y: 0 }).ok, false);
  assert.equal(applyAction(s, 0, { type: "upgrade", id: 99 }).ok, false);
  assert.equal(applyAction(s, 0, { type: "send", unit: "minotaur" }).ok, false, "locked until its unlock round");
  assert.equal(applyAction(s, 0, { type: "send", unit: "kobold", orders: 4 }).ok, false, "over the round-one send cap");
  assert.equal(JSON.stringify(s.lanes[0]), before);
  assert.deepEqual(s.log[0][0], []);
});

function firstOpenTile(s: ReturnType<typeof createDuel>): [number, number] {
  for (let y = 0; y < s.map.h; y++) for (let x = 0; x < s.map.w; x++) if (isBuildable(s.map, x, y)) return [x, y];
  throw new Error("map has no buildable tile");
}

test("building and sending follow the economy rules", () => {
  const s = createDuel(11);
  const [x, y] = firstOpenTile(s);
  assert.ok(applyAction(s, 0, { type: "build", tower: "gatling", x, y }).ok);
  assert.equal(s.lanes[0].gold, RULES.startGold - 40);
  assert.equal(applyAction(s, 0, { type: "build", tower: "gatling", x, y }).ok, false, "tile is taken");
  const orders = Math.floor(sendCap(1) / UNITS.kobold.send.cost);
  assert.ok(applyAction(s, 0, { type: "send", unit: "kobold", orders }).ok);
  assert.equal(s.lanes[0].income, RULES.baseIncome + orders * UNITS.kobold.send.income);
  assert.equal(applyAction(s, 0, { type: "send", unit: "kobold" }).ok, false, "send cap reached");
  commit(s, 0);
  assert.equal(applyAction(s, 0, { type: "sell", id: 1 }).ok, false, "turn already ended");
});

test("sends arrive in the opponent's lane and the round pays out", () => {
  const s = createDuel(11);
  assert.ok(applyAction(s, 0, { type: "send", unit: "kobold" }).ok);
  commit(s, 0);
  commit(s, 1);
  const rec = resolveRound(s);
  const baseScuttlers = baseWave(11, 1).find((g) => g.unit === "kobold")?.count ?? 0;
  assert.equal(rec.sides[1].battle.spawned.kobold, baseScuttlers + UNITS.kobold.send.count);
  assert.equal(rec.sides[0].battle.spawned.kobold, baseScuttlers);
  assert.equal(rec.sides[1].battle.leakedLives.send, UNITS.kobold.send.count);
  assert.equal(s.lanes[0].totals.livesTaken, UNITS.kobold.send.count);
  assert.equal(s.lanes[0].gold, RULES.startGold - 20 + RULES.baseIncome + UNITS.kobold.send.income);
  assert.equal(s.status, "planning");
  assert.equal(s.round, 2);
  assert.equal(s.lanes[0].committed, false);
});

test("cannons cannot hit flyers and flak cannot hit ground", () => {
  const map = generateMap(5);
  const [sx, sy] = map.path[2];
  const imps = [{ unit: "imp" as const, count: 3, start: 0, gap: 1, source: "base" as const }];
  const grunts = [{ unit: "kobold" as const, count: 3, start: 0, gap: 1, source: "base" as const }];
  const cannon = runBattle(map, [tower({ type: "cannon", x: sx, y: sy, level: 3 })], imps, 1);
  assert.equal(cannon.towers[0].dmg, 0);
  assert.equal(cannon.leaked.imp, 3);
  const flak = runBattle(map, [tower({ type: "flak", x: sx, y: sy, level: 3 })], grunts, 1);
  assert.equal(flak.towers[0].dmg, 0);
});

test("armour blunts small hits but not piercing ones", () => {
  const map = generateMap(5);
  const [x, y] = map.path[Math.floor(map.path.length / 2)];
  const ogres = [{ unit: "ogre" as const, count: 1, start: 0, gap: 1, source: "base" as const }];
  const nail = runBattle(map, [tower({ type: "gatling", x, y })], ogres, 1);
  const harp = runBattle(map, [tower({ type: "ballista", x, y })], ogres, 1);
  // Gatling: 6 damage less 4 armour leaves 2 per hit. Ballista ignores armour.
  assert.equal(nail.towers[0].dmg, nail.towers[0].shots * 2);
  assert.ok(harp.towers[0].dmg > nail.towers[0].dmg);
});

test("selling a defence returns its quoted salvage, including upgrades, exactly once", () => {
  const state = createDuel(37);
  const [x, y] = firstOpenTile(state);
  assert.ok(applyAction(state, 0, { type: "build", tower: "cannon", x, y }).ok);
  assert.ok(applyAction(state, 0, { type: "upgrade", id: 1 }).ok);
  const quote = stateView(state, 0).you.towers[0].resaleGold;
  assert.equal(quote, 91);
  assert.ok(applyAction(state, 0, { type: "sell", id: 1 }).ok);
  assert.equal(applyAction(state, 0, { type: "sell", id: 1 }).ok, false);
  assert.equal(state.lanes[0].gold, RULES.startGold - 130 + quote);
});

test("scouting reports the opponent's current lives", () => {
  const state = createDuel(11);
  commit(state, 0); commit(state, 1);
  resolveRound(state);
  const lives = state.lanes[1].lives;
  assert.ok(lives < RULES.startLives, "the empty lane leaked");
  assert.equal(scoutView(state, 0).lives, lives);
  assert.equal(stateView(state, 0).opponent.lives, lives);
});

test("goblins cost no lives but take gold from the defender's payout and give it to the sender", () => {
  const state = createDuel(11);
  state.round = 3;
  state.log = [[[], []], [[], []], [[], []]];
  assert.ok(applyAction(state, 0, { type: "send", unit: "goblin", orders: 2 }).ok);
  commit(state, 0); commit(state, 1);
  const [before0, before1] = [state.lanes[0].gold, state.lanes[1].gold];
  const rec = resolveRound(state);
  const theirs = rec.sides[1].battle;
  const goblins = theirs.leaked.goblin ?? 0;
  assert.equal(goblins, 2 * UNITS.goblin.send.count, "an empty lane catches nothing");
  assert.equal(theirs.stolen, goblins * lootFor("goblin", 3));
  assert.equal(theirs.leakedLives.send, 0, "goblins take no lives");
  assert.equal(rec.sides[1].goldLost, theirs.stolen);
  assert.equal(state.lanes[0].gold, before0 + state.lanes[0].income + rec.sides[0].battle.bounty + theirs.stolen);
  assert.equal(state.lanes[1].gold, before1 + state.lanes[1].income + theirs.bounty - theirs.stolen);
  assert.equal(state.lanes[0].totals.goldStolen, theirs.stolen);
});

test("theft never pushes a defender below zero gold", () => {
  const state = createDuel(11);
  state.round = 20;
  state.log = Array.from({ length: 20 }, () => [[], []] as [never[], never[]]);
  state.lanes[0].gold = 10_000;
  state.lanes[1].gold = 0;
  state.lanes[1].income = 1;
  assert.ok(applyAction(state, 0, { type: "send", unit: "goblin", orders: 10 }).ok);
  commit(state, 0); commit(state, 1);
  const rec = resolveRound(state);
  assert.ok(rec.sides[1].battle.stolen > rec.sides[1].goldLost, "the haul was capped");
  assert.equal(state.lanes[1].gold, 0);
});

test("a Laser Sentry always targets the weakest enemy, whatever it is told", () => {
  const state = createDuel(11);
  const [x, y] = firstOpenTile(state);
  const built = applyAction(state, 0, { type: "build", tower: "laser", x, y, targeting: "strong" });
  assert.ok(built.ok);
  assert.equal(state.lanes[0].towers[0].targeting, "weak");
  assert.equal(applyAction(state, 0, { type: "target", id: 1, mode: "first" }).ok, false);

  const map = generateMap(5);
  const [px, py] = map.path[6];
  const groups = [
    { unit: "ogre" as const, count: 1, start: 0, gap: 1, source: "base" as const },
    { unit: "goblin" as const, count: 1, start: 0.3, gap: 1, source: "send" as const },
  ];
  const res = runBattle(map, [tower({ type: "laser", x: px, y: py + (py > 0 ? -1 : 1), targeting: "weak" })], groups, 4);
  assert.equal(res.killed.goblin, 1, "the goblin was picked out from behind the ogre");
});

/** Tiles beside the road, nearest the spawn first: towers here will meet what comes down the path. */
function roadside(state: ReturnType<typeof createDuel>): [number, number][] {
  const out: [number, number][] = [];
  for (const [px, py] of state.map.path) for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const x = px + dx, y = py + dy;
    if (isBuildable(state.map, x, y) && !out.some(([a, b]) => a === x && b === y)) out.push([x, y]);
  }
  return out;
}

test("fog of war: the opponent's board, gold and income are hidden until revealed", () => {
  const state = createDuel(11);
  const [a, b] = roadside(state);
  assert.ok(applyAction(state, 1, { type: "build", tower: "gatling", x: a[0], y: a[1] }).ok);
  assert.ok(applyAction(state, 1, { type: "build", tower: "beacon", x: b[0], y: b[1] }).ok);
  commit(state, 0); commit(state, 1);
  const rec = resolveRound(state);
  const view = stateView(state, 0);
  assert.equal(view.opponent.knownTowers, 0, "nothing was sent, so nothing was seen");
  assert.ok(!("gold" in view.opponent) && !("income" in view.opponent), "their purse is private");
  assert.equal(scoutView(state, 0).towers.length, 0);
  assert.ok(!("gold" in scoutView(state, 0)) && !("income" in scoutView(state, 0)));
  const report = roundReport(state, 0, rec);
  assert.deepEqual(Object.keys(report.opponent).sort(), ["livesLost", "livesNow"]);
});

test("raiders reveal the towers that shoot them, and only those", () => {
  const state = createDuel(11);
  const [a, b] = roadside(state);
  assert.ok(applyAction(state, 1, { type: "build", tower: "gatling", x: a[0], y: a[1] }).ok);
  assert.ok(applyAction(state, 1, { type: "build", tower: "beacon", x: b[0], y: b[1] }).ok);
  assert.ok(applyAction(state, 0, { type: "send", unit: "kobold" }).ok);
  commit(state, 0); commit(state, 1);
  const rec = resolveRound(state);
  const seen = scoutView(state, 0).towers;
  assert.deepEqual(seen.map((t) => t.type), ["gatling"], "the beacon never fired, so it stays hidden");
  assert.equal(seen[0].seenBy, "contact");
  assert.equal(seen[0].seenRound, 1);
  assert.deepEqual(roundReport(state, 0, rec).revealedThisRound.map((t) => t.type), ["gatling"]);
  assert.equal(scoutView(state, 1).towers.length, 0, "the other side learned nothing");
});

test("a Scanner reveals the whole opening board, once a round, and forgets sold towers", () => {
  const state = createDuel(11);
  // Neither lane defends itself here, so give both cores room to last three rounds.
  state.lanes[0].lives = state.lanes[1].lives = 999;
  const [a, b] = roadside(state);
  assert.ok(applyAction(state, 1, { type: "build", tower: "gatling", x: a[0], y: a[1] }).ok);
  assert.ok(applyAction(state, 1, { type: "build", tower: "beacon", x: b[0], y: b[1] }).ok);
  assert.ok(applyAction(state, 0, { type: "send", unit: "kobold" }).ok);
  commit(state, 0); commit(state, 1);
  resolveRound(state);
  // Round 2: they sell the gatling mid-round; our scan shows the board as the round opened.
  const gold = state.lanes[0].gold;
  assert.ok(applyAction(state, 1, { type: "sell", id: 1 }).ok);
  assert.ok(applyAction(state, 0, { type: "scan" }).ok);
  assert.equal(state.lanes[0].gold, gold - scannerPrice(2));
  assert.deepEqual(scoutView(state, 0).towers.map((t) => [t.type, t.seenBy]), [["gatling", "scan"], ["beacon", "scan"]]);
  assert.equal(applyAction(state, 0, { type: "scan" }).ok, false, "one per round");
  commit(state, 0); commit(state, 1);
  resolveRound(state);
  // Round 3: a fresh scan no longer lists the gatling that was sold.
  assert.ok(applyAction(state, 0, { type: "scan" }).ok);
  assert.deepEqual(scoutView(state, 0).towers.map((t) => t.type), ["beacon"]);
  assert.deepEqual([1, 5, 10, 11, 24].map(scannerPrice), [45, 29, 9, 5, 5]);
});

test("a player's live view rebuilds their own lane exactly from their moves and the raiders sent at them", async () => {
  const { Playback } = await import("../src/viewer/playback.ts");
  const { laneOf } = await import("../src/server/lane.ts");
  const full = playBotMatch(4242, 5, 4);
  for (const seat of [0, 1] as const) {
    for (const resolved of [3, 6, full.history.length - 1]) {
      // The match as the server would hold it partway through.
      const partway = replayDuel(full.seed, full.log.slice(0, resolved), resolved);
      const { log, lane } = laneOf(partway, full.log, seat, resolved);
      assert.ok(log.every((r) => r[1 - seat].every((a) => a.type === "send")), "only their sends are included");
      const feed = {
        view: "lane" as const, id: "t", seed: full.seed, mode: "practice" as const, status: "active" as const, resolvedRounds: resolved, log,
        winner: null, endReason: null, createdAt: 0, finishedAt: null, players: [] as never, live: null, lane,
      };
      const pb = new Playback(feed, seat);
      // A live view skips to the last resolved round and waits there; play it to the end.
      for (let i = 0; i < 20000 && pb.phase !== "waiting"; i++) pb.update(0.05);
      const mine = pb.duel.lanes[seat], real = partway.lanes[seat];
      assert.deepEqual(mine.towers, real.towers, `seat ${seat}, round ${resolved}: towers`);
      assert.equal(mine.gold, real.gold, `seat ${seat}, round ${resolved}: gold`);
      assert.equal(mine.lives, real.lives, `seat ${seat}, round ${resolved}: lives`);
      assert.equal(pb.duel.lanes[1 - seat].lives, partway.lanes[1 - seat].lives, "their lives, from the server");
      assert.equal(pb.duel.lanes[1 - seat].towers.length, 0, "their towers were never sent");
    }
  }
});

test("the watched player's log follows planning orders, core hits and settled gold in live play and replays", async () => {
  const { Playback } = await import("../src/viewer/playback.ts");
  const { laneOf } = await import("../src/server/lane.ts");
  const state = createDuel(11);
  const base = {
    id: "log", seed: state.seed, mode: "practice" as const, winner: null, endReason: null,
    createdAt: 0, finishedAt: null, players: [] as never, live: null,
  };
  const liveFeed = () => ({
    ...base, view: "lane" as const, status: "active" as const, resolvedRounds: state.history.length,
    ...laneOf(state, state.log, 0, state.history.length),
  });
  const live = new Playback(liveFeed(), 0);
  assert.ok(applyAction(state, 0, { type: "send", unit: "kobold" }).ok);
  assert.ok(applyAction(state, 1, { type: "send", unit: "hellhound" }).ok);
  live.setFeed(liveFeed());
  assert.ok(applyAction(state, 0, { type: "scan" }).ok);
  live.setFeed(liveFeed());
  live.setFeed(liveFeed());
  assert.deepEqual(live.activity[0].map(e => e.amount), [-20, -scannerPrice(1)]);
  assert.deepEqual(live.activity[1], []);
  assert.deepEqual(liveFeed().lane.planning.actions, state.log[0][0]);
  assert.equal(live.duel.lanes[0].gold, RULES.startGold, "previewing orders never alters the simulation");

  commit(state, 0); commit(state, 1);
  const rec = resolveRound(state);
  live.setFeed(liveFeed());
  const replay = new Playback({
    ...base, view: "full", status: "finished", resolvedRounds: 1, log: state.log,
  }, 1);
  let sawHitDuringBattle = false;
  for (let i = 0; i < 5000 && (live.phase !== "result" || replay.phase !== "result"); i++) {
    if (live.phase !== "result") live.update(0.05);
    if (replay.phase !== "result") replay.update(0.05);
    if (live.phase === "battle" && live.activity[0].some(e => e.kind === "dealt")) sawHitDuringBattle = true;
  }
  assert.equal(live.phase, "result");
  assert.equal(replay.phase, "result");
  assert.ok(sawHitDuringBattle);
  for (const p of [0, 1] as const) {
    replay.setSide(p);
    const rows = replay.activity[p];
    const total = (kind: "gold" | "taken" | "dealt") => rows.filter(e => e.kind === kind).reduce((n, e) => n + e.amount, 0);
    assert.equal(total("taken"), rec.sides[p].battle.livesLost);
    assert.equal(total("dealt"), rec.sides[1 - p].battle.leakedLives.send);
    assert.equal(total("gold"), rec.sides[p].goldAfter - RULES.startGold);
  }
  // Events on opposite lanes can occur in the same tick. Compare their contents.
  const entries = (rows: typeof live.activity[0]) => rows.map(e => JSON.stringify(e)).sort();
  assert.deepEqual(entries(live.activity[0]), entries(replay.activity[0]));
  assert.deepEqual(live.activity[1], []);
  assert.ok(live.activity[0].filter(e => e.kind === "dealt").every(e => e.label.includes("Kobold")));
  replay.restart();
  assert.deepEqual(replay.activity[0].map(e => e.amount), [-20, -scannerPrice(1)]);
});

test("the debrief splits lost lives between the neutral wave and the opponent's sends", () => {
  const s = createDuel(7);
  assert.ok(applyAction(s, 1, { type: "send", unit: "kobold" }).ok);
  commit(s, 0); commit(s, 1);
  const rec = resolveRound(s);
  const { livesLostBy } = debrief(s, 0);
  const sent = livesLostBy.find((e) => e.unit === "kobold" && e.fromSends);
  const neutral = livesLostBy.filter((e) => !e.fromSends);
  assert.equal(sent?.lives, UNITS.kobold.send.count, "an undefended lane leaks every kobold sent at it");
  assert.equal(sent!.lives, rec.sides[0].battle.leakedLives.send);
  assert.equal(neutral.reduce((n, e) => n + e.lives, 0), rec.sides[0].battle.leakedLives.base);
  assert.equal(livesLostBy.reduce((n, e) => n + e.lives, 0), RULES.startLives - s.lanes[0].lives);
});

test("every way a match can end is told apart", () => {
  const ended = (setup: (s: ReturnType<typeof createDuel>) => void) => {
    const s = createDuel(3);
    setup(s);
    return endKind(s.endReason);
  };
  const fight = (s: ReturnType<typeof createDuel>) => { commit(s, 0); commit(s, 1); resolveRound(s); };
  assert.equal(endKind(null), null);
  assert.equal(ended((s) => { s.lanes[0].lives = 1; s.lanes[1].lives = 999; fight(s); }), "core");
  assert.equal(ended((s) => { s.lanes[0].lives = 1; s.lanes[1].lives = 1; fight(s); }), "both-fell");
  assert.equal(ended((s) => { s.lanes[0].lives = 999; s.lanes[1].lives = 999; s.round = RULES.maxRounds; fight(s); }), "round-limit");
  assert.equal(ended((s) => forfeit(s, 0, "Resigned.")), "resigned");
  assert.equal(ended((s) => forfeit(s, 0, "Forfeit: 3 turns in a row expired with no actions.")), "forfeit");
});
