// Is the Sentinel a real counter to goblins? Take boards the house bots actually
// built in rounds 4, 7 and 10, send the same goblin pack at each, and compare
// the board as built with the same board plus one Nailgun or one Sentinel.
// Run: pnpm goblins [seeds]
import { runBattle, type Tower } from "../src/engine/battle.ts";
import { UNITS } from "../src/engine/data.ts";
import { replayDuel } from "../src/engine/duel.ts";
import { isBuildable, pathCoverage } from "../src/engine/map.ts";
import { baseWave, sendGroups } from "../src/engine/waves.ts";
import { playBotMatch } from "./balance.ts";

const seeds = Number(process.argv[2] ?? 40), orders = 3;
const total = { asBuilt: 0, nailgun: 0, sentinel: 0 };
let boards = 0;
for (let seed = 1; seed <= seeds; seed++) {
  const match = playBotMatch(seed * 13, 5, 4);
  for (const round of [4, 7, 10]) {
    if (match.history.length < round) continue;
    // The defender's board as it was built for this round, without any Sentinels it already had.
    const then = replayDuel(match.seed, match.log.slice(0, round), round - 1);
    const towers: Tower[] = then.lanes[1].towers.filter((t) => t.type !== "sentinel");
    let spot = { x: -1, y: -1, n: -1 };
    for (let y = 0; y < then.map.h; y++) for (let x = 0; x < then.map.w; x++) {
      if (!isBuildable(then.map, x, y) || towers.some((t) => t.x === x && t.y === y)) continue;
      const n = pathCoverage(then.map, x, y, 3.2);
      if (n > spot.n) spot = { x, y, n };
    }
    const extra = (type: "nailgun" | "sentinel"): Tower => ({ id: 999, type, x: spot.x, y: spot.y, level: 1, spec: null, targeting: type === "sentinel" ? "weak" : "first", invested: 0, dmg: 0, kills: 0 });
    const groups = [...baseWave(match.seed, round), ...sendGroups([{ unit: "goblin", orders }])];
    total.asBuilt += runBattle(then.map, towers, groups, round).stolen;
    total.nailgun += runBattle(then.map, [...towers, extra("nailgun")], groups, round).stolen;
    total.sentinel += runBattle(then.map, [...towers, extra("sentinel")], groups, round).stolen;
    boards++;
  }
}
const avg = (v: number) => (v / boards).toFixed(1);
console.log(`${boards} boards; ${orders * UNITS.goblin.send.count} goblins (${orders * UNITS.goblin.send.cost} gold) sent at each.`);
console.log(`Average gold stolen: as built ${avg(total.asBuilt)}, plus one Nailgun ${avg(total.nailgun)}, plus one Sentinel ${avg(total.sentinel)}.`);
