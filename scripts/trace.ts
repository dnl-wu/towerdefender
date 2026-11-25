// Print a round-by-round trace of one bot match. Run: node --experimental-strip-types scripts/trace.ts <seed> <levelA> <levelB>
import { playBotMatch } from "./balance.ts";
import { renderAscii } from "../src/engine/map.ts";
import { hpScale, waveBudget } from "../src/engine/data.ts";
import { waveArchetype } from "../src/engine/waves.ts";

const [seed, a, b] = process.argv.slice(2).map(Number);
const s = playBotMatch(seed || 1, a || 3, b || 5);
console.log(renderAscii(s.map, s.lanes[0].towers));
for (const r of s.history) {
  console.log(`\nR${r.round} ${waveArchetype(s.seed, r.round)} budget=${waveBudget(r.round)} hp×${hpScale(r.round)}`);
  r.sides.forEach((side, p) => {
    const f = (o: object) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(" ");
    console.log(
      `  P${p} lives=${side.livesAfter} gold=${side.goldAfter} inc=${side.incomeAfter} towers=${side.towerValue} sent[${side.sent.map((x) => x.unit + "×" + x.orders).join(",")}] ` +
        `faced{${f(side.battle.spawned)}} leaked{${f(side.battle.leaked)}} lost=${side.battle.livesLost} (send ${side.battle.leakedLives.send}) ${side.battle.duration}s`,
    );
  });
}
console.log(`\nwinner: ${s.winner} — ${s.endReason}`);
console.log(s.lanes.map((l) => l.towers.map((t) => `${t.type}${t.level}`).join(" ")).join("\n"));
