// How long does each house bot survive the neutral waves on its own, with an
// opponent that never builds or sends? This is the yardstick for difficulty:
// careless play should fall early, careful play should go deep.
// Run: pnpm solo [seeds]
import { BOTS, playBotTurn, playTurtleTurn, snapshotOpponent } from "../src/engine/bots.ts";
import { RULES } from "../src/engine/data.ts";
import { commit, createDuel, resolveRound } from "../src/engine/duel.ts";

const n = Number(process.argv[2] ?? 24);
const pct = (a: number[], q: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))];
console.log(`${n} seeds per bot. Round of death (median, 10th–90th percentile); "${RULES.maxRounds + 1}" means it survived.\n`);
// The house bots, then Tyrant's defence logic on its own: it buys what each round needs and never sends.
for (const bot of [...BOTS, { level: 0, name: "Turtle" }]) {
  const death: number[] = [];
  const firstLeak: number[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const s = createDuel(seed * 101);
    let leak = 0;
    while (s.status === "planning") {
      s.lanes[1].lives = 999;
      if (bot.level) playBotTurn(s, 0, bot.level, snapshotOpponent(s, 0));
      else playTurtleTurn(s, 0);
      commit(s, 0); commit(s, 1);
      const rec = resolveRound(s);
      if (!leak && rec.sides[0].battle.livesLost > 0) leak = rec.round;
    }
    death.push(s.lanes[0].lives <= 0 ? s.history.length : RULES.maxRounds + 1);
    firstLeak.push(leak || RULES.maxRounds + 1);
  }
  console.log(`${bot.name.padEnd(11)} ${bot.level ? `L${bot.level}` : "  "}  dies R${pct(death, 0.5)} (${pct(death, 0.1)}–${pct(death, 0.9)})   first leak R${pct(firstLeak, 0.5)}`);
}
