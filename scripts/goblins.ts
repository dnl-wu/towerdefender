// Is the Laser Sentry a real counter to goblins? Take boards the house bots actually
// built in rounds 4, 7 and 10, send the same goblin pack at each, and compare
// the board as built with the same board plus one Gatling or one Laser Sentry.
// Run: pnpm goblins [seeds]
import { runBattle, type Tower } from "../src/engine/battle.ts";
import { TOWERS, UNITS } from "../src/engine/data.ts";
import { replayDuel } from "../src/engine/duel.ts";
import { isBuildable, pathCoverage } from "../src/engine/map.ts";
import { baseWave, sendGroups } from "../src/engine/waves.ts";
import { playBotMatch } from "./balance.ts";

const seeds = Number(process.argv[2] ?? 40), orders = 3;
const total = { asBuilt: 0, gatling: 0, laser: 0 };
let boards = 0;
for (let seed = 1; seed <= seeds; seed++) {
  const match = playBotMatch(seed * 13, 5, 4);
  for (const round of [4, 7, 10]) {
    if (match.history.length < round) continue;
    // The defender's board as it was built for this round, without any Laser Sentries it already had.
    const then = replayDuel(match.seed, match.log.slice(0, round), round - 1);
    const towers: Tower[] = then.lanes[1].towers.filter((t) => t.type !== "laser");
    let spot = { x: -1, y: -1, n: -1 };
    for (let y = 0; y < then.map.h; y++) for (let x = 0; x < then.map.w; x++) {
      if (!isBuildable(then.map, x, y) || towers.some((t) => t.x === x && t.y === y)) continue;
      const n = pathCoverage(then.map, x, y, TOWERS.laser.levels[0].range);
      if (n > spot.n) spot = { x, y, n };
    }
    const extra = (type: "gatling" | "laser"): Tower => ({ id: 999, type, x: spot.x, y: spot.y, level: 1, spec: null, targeting: type === "laser" ? "weak" : "first", invested: 0, dmg: 0, kills: 0 });
    const groups = [...baseWave(match.seed, round), ...sendGroups([{ unit: "goblin", orders }])];
    total.asBuilt += runBattle(then.map, towers, groups, round).stolen;
    total.gatling += runBattle(then.map, [...towers, extra("gatling")], groups, round).stolen;
    total.laser += runBattle(then.map, [...towers, extra("laser")], groups, round).stolen;
    boards++;
  }
}
const avg = (v: number) => (v / boards).toFixed(1);
console.log(`${boards} boards; ${orders * UNITS.goblin.send.count} goblins (${orders * UNITS.goblin.send.cost} gold) sent at each.`);
console.log(`Average gold stolen: as built ${avg(total.asBuilt)}, plus one Gatling ${avg(total.gatling)}, plus one Laser Sentry ${avg(total.laser)}.`);
