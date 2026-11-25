import assert from "node:assert/strict";
import { test } from "node:test";
import { playBotMatch } from "../scripts/balance.ts";
import { runBattle, type Tower } from "../src/engine/battle.ts";
import { RULES, UNITS, sendCap } from "../src/engine/data.ts";
import { applyAction, commit, createDuel, replayDuel, resolveRound } from "../src/engine/duel.ts";
import { generateMap, isBuildable } from "../src/engine/map.ts";
import { baseWave } from "../src/engine/waves.ts";

const tower = (over: Partial<Tower>): Tower => ({
  id: 1, type: "nailgun", x: 0, y: 0, level: 1, spec: null, targeting: "first", invested: 0, dmg: 0, kills: 0, ...over,
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

test("a match replays identically from its seed and action log", () => {
  for (const seed of [3, 77, 4242]) {
    const played = playBotMatch(seed, 5, 4);
    const replayed = replayDuel(seed, played.log, played.history.length);
    assert.deepEqual(replayed.history, played.history);
    assert.equal(replayed.winner, played.winner);
    assert.deepEqual(replayed.lanes, played.lanes);
  }
});

test("illegal actions are rejected and change nothing", () => {
  const s = createDuel(11);
  const [px, py] = s.map.path[3];
  const before = JSON.stringify(s.lanes[0]);
  assert.equal(applyAction(s, 0, { type: "build", tower: "nailgun", x: px, y: py }).ok, false);
  assert.equal(applyAction(s, 0, { type: "build", tower: "nailgun", x: -1, y: 0 }).ok, false);
  assert.equal(applyAction(s, 0, { type: "upgrade", id: 99 }).ok, false);
  assert.equal(applyAction(s, 0, { type: "send", unit: "colossus" }).ok, false, "locked until its unlock round");
  assert.equal(applyAction(s, 0, { type: "send", unit: "scuttler", orders: 4 }).ok, false, "over the round-one send cap");
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
  assert.ok(applyAction(s, 0, { type: "build", tower: "nailgun", x, y }).ok);
  assert.equal(s.lanes[0].gold, RULES.startGold - 40);
  assert.equal(applyAction(s, 0, { type: "build", tower: "nailgun", x, y }).ok, false, "tile is taken");
  const orders = Math.floor(sendCap(1) / UNITS.scuttler.send.cost);
  assert.ok(applyAction(s, 0, { type: "send", unit: "scuttler", orders }).ok);
  assert.equal(s.lanes[0].income, RULES.baseIncome + orders * UNITS.scuttler.send.income);
  assert.equal(applyAction(s, 0, { type: "send", unit: "scuttler" }).ok, false, "send cap reached");
  commit(s, 0);
  assert.equal(applyAction(s, 0, { type: "sell", id: 1 }).ok, false, "turn already ended");
});

test("sends arrive in the opponent's lane and the round pays out", () => {
  const s = createDuel(11);
  assert.ok(applyAction(s, 0, { type: "send", unit: "scuttler" }).ok);
  commit(s, 0);
  commit(s, 1);
  const rec = resolveRound(s);
  const baseScuttlers = baseWave(11, 1).find((g) => g.unit === "scuttler")?.count ?? 0;
  assert.equal(rec.sides[1].battle.spawned.scuttler, baseScuttlers + UNITS.scuttler.send.count);
  assert.equal(rec.sides[0].battle.spawned.scuttler, baseScuttlers);
  assert.equal(rec.sides[1].battle.leakedLives.send, UNITS.scuttler.send.count);
  assert.equal(s.lanes[0].totals.livesTaken, UNITS.scuttler.send.count);
  assert.equal(s.lanes[0].gold, RULES.startGold - 20 + RULES.baseIncome + UNITS.scuttler.send.income);
  assert.equal(s.status, "planning");
  assert.equal(s.round, 2);
  assert.equal(s.lanes[0].committed, false);
});

test("mortars cannot hit flyers and flak cannot hit ground", () => {
  const map = generateMap(5);
  const [sx, sy] = map.path[2];
  const drones = [{ unit: "drone" as const, count: 3, start: 0, gap: 1, source: "base" as const }];
  const grunts = [{ unit: "scuttler" as const, count: 3, start: 0, gap: 1, source: "base" as const }];
  const mortar = runBattle(map, [tower({ type: "mortar", x: sx, y: sy, level: 3 })], drones, 1);
  assert.equal(mortar.towers[0].dmg, 0);
  assert.equal(mortar.leaked.drone, 3);
  const flak = runBattle(map, [tower({ type: "flak", x: sx, y: sy, level: 3 })], grunts, 1);
  assert.equal(flak.towers[0].dmg, 0);
});

test("armour blunts small hits but not piercing ones", () => {
  const map = generateMap(5);
  const [x, y] = map.path[Math.floor(map.path.length / 2)];
  const hulks = [{ unit: "hulk" as const, count: 1, start: 0, gap: 1, source: "base" as const }];
  const nail = runBattle(map, [tower({ type: "nailgun", x, y })], hulks, 1);
  const harp = runBattle(map, [tower({ type: "harpoon", x, y })], hulks, 1);
  // Nailgun: 6 damage less 4 armour leaves 2 per hit. Harpoon ignores armour.
  assert.equal(nail.towers[0].dmg, nail.towers[0].shots * 2);
  assert.ok(harp.towers[0].dmg > nail.towers[0].dmg);
});
