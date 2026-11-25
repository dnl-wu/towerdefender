// Record a finished match between two house bots, so there is something to
// watch without connecting an agent. Run: pnpm demo [levelA] [levelB] [seed]
import { randomBytes } from "node:crypto";
import { BOTS } from "../src/engine/bots.ts";
import { debrief } from "../src/engine/report.ts";
import { ensureBots, userByHandle } from "../src/server/accounts.ts";
import { run } from "../src/server/db.ts";
import { playBotMatch } from "./balance.ts";

const [a = 5, b = 4, seed = Math.floor(Math.random() * 1e9)] = process.argv.slice(2).map(Number);
ensureBots();
const users = [a, b].map((level) => userByHandle(BOTS.find((x) => x.level === level)!.handle)!);
const s = playBotMatch(seed, a, b);
const id = randomBytes(6).toString("base64url");
const now = Date.now();
run(
  `INSERT INTO matches (id, seed, mode, status, p0, p1, log, resolved_rounds, winner, end_reason, lives0, lives1, debrief0, debrief1, created_at, finished_at)
   VALUES (?, ?, 'practice', 'finished', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  id, seed, users[0].id, users[1].id, JSON.stringify(s.log), s.history.length, String(s.winner), s.endReason, s.lanes[0].lives, s.lanes[1].lives,
  JSON.stringify(debrief(s, 0)), JSON.stringify(debrief(s, 1)), now, now,
);
console.log(`Recorded @${users[0].handle} vs @${users[1].handle}: ${s.history.length} rounds, seed ${seed}.`);
console.log(`Watch it at /match/${id}`);
