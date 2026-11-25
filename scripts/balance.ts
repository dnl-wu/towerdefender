// Headless round-robin between house bots. Run: pnpm balance [games-per-pair]
import { BOTS, playBotTurn, snapshotOpponent } from "../src/engine/bots.ts";
import { commit, createDuel, resolveRound } from "../src/engine/duel.ts";

export function playBotMatch(seed: number, a: number, b: number) {
  const state = createDuel(seed);
  while (state.status === "planning") {
    const snaps = [snapshotOpponent(state, 0), snapshotOpponent(state, 1)];
    playBotTurn(state, 0, a, snaps[0]);
    playBotTurn(state, 1, b, snaps[1]);
    commit(state, 0);
    commit(state, 1);
    resolveRound(state);
  }
  return state;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = Number(process.argv[2] ?? 30);
  const levels = BOTS.map((b) => b.level);
  const t0 = Date.now();
  console.log(`rows beat columns, ${games} games per pair\n`);
  console.log("      " + levels.map((l) => `L${l}`.padStart(6)).join("") + "   avg rounds");
  for (const a of levels) {
    let line = `L${a}`.padEnd(6);
    let rounds = 0;
    let n = 0;
    for (const b of levels) {
      let score = 0;
      for (let g = 0; g < games; g++) {
        // Alternate sides so lane order cannot bias the result.
        const flip = g % 2 === 1;
        const s = playBotMatch(1000 + g * 7 + a * 131 + b * 17, flip ? b : a, flip ? a : b);
        const mine = flip ? 1 : 0;
        score += s.winner === "draw" ? 0.5 : s.winner === mine ? 1 : 0;
        rounds += s.history.length;
        n++;
      }
      line += `${Math.round((score / games) * 100)}%`.padStart(6);
    }
    console.log(line + `   ${(rounds / n).toFixed(1)}`);
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
