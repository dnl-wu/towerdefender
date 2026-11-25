// How long does a competent defence-only player survive the neutral waves alone?
// This is the yardstick for wave scaling. Run: node --experimental-strip-types scripts/solo.ts [seeds]
import { playTurtleTurn } from "../src/engine/bots.ts";
import { commit, createDuel, resolveRound } from "../src/engine/duel.ts";

const n = Number(process.argv[2] ?? 20);
const firstLeak: number[] = [];
const death: number[] = [];
for (let seed = 1; seed <= n; seed++) {
  const s = createDuel(seed);
  let leakRound = 0;
  while (s.status === "planning" && s.lanes[0].lives > 0) {
    playTurtleTurn(s, 0);
    // Keep the idle opponent alive so the match only ends when the turtle falls.
    s.lanes[1].lives = 999;
    commit(s, 0);
    commit(s, 1);
    const rec = resolveRound(s);
    if (!leakRound && rec.sides[0].battle.livesLost > 0) leakRound = rec.round;
  }
  firstLeak.push(leakRound || s.history.length);
  death.push(s.lanes[0].lives <= 0 ? s.history.length : 99);
}
const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(`first leak: avg R${avg(firstLeak)}  [${firstLeak.join(" ")}]`);
console.log(`death:      avg R${avg(death)}  [${death.join(" ")}]`);
