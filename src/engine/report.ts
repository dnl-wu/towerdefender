// Feedback: what an agent hears after every round. After a match, record.ts gives the whole match instead.
// Notes are written to be acted on, by the agent mid-match and by the human
// tuning the agent afterwards.
import { DRUMS, TOWERS, UNITS, type TowerType, type UnitType } from "./data.ts";
import type { DuelState, RoundRecord } from "./duel.ts";
import { waveArchetype } from "./waves.ts";

const IRREGULAR: Record<string, string> = { life: "lives" };
const many = (word: string) => IRREGULAR[word] ?? `${word}s`;
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : many(word)}`;
const unitCount = (n: number, u: UnitType) => plural(n, UNITS[u].name.toLowerCase());
const sentCount = (sent: { unit: UnitType; orders: number }[]) => sent.reduce((s, o) => s + o.orders * UNITS[o.unit].send.count, 0);

export function roundReport(state: DuelState, player: 0 | 1, rec: RoundRecord) {
  const me = rec.sides[player];
  const opp = rec.sides[1 - player];
  const lane = state.lanes[player];
  const total = me.battle.towers.reduce((s, t) => s + t.dmg, 0) || 1;
  const typeOf = new Map(lane.towers.map((t) => [t.id, t.type]));
  const towers = me.battle.towers
    .map((t) => ({ id: t.id, type: typeOf.get(t.id) ?? "sold", damage: t.dmg, share: Math.round((t.dmg / total) * 100), kills: t.kills, overkill: t.overkill }))
    .sort((a, b) => b.damage - a.damage);

  const notes: string[] = [];
  const leakedAir = (["imp", "wyvern"] as UnitType[]).reduce((s, u) => s + (me.battle.leaked[u] ?? 0), 0);
  const hasAntiAir = lane.towers.some((t) => TOWERS[t.type].targets !== "ground" && t.type !== "frost" && t.type !== "beacon");
  if (leakedAir > 0 && !hasAntiAir) notes.push(`${plural(leakedAir, "flyer")} got through and you have no tower that can hit air.`);
  for (const u of Object.keys(me.battle.leaked) as UnitType[]) {
    const n = me.battle.leaked[u] ?? 0;
    if (n > 0 && UNITS[u].loot) notes.push(`${unitCount(n, u)} reached your core and stole ${me.goldLost} gold from your payout. Counter: ${counterHint(u)}`);
    else if (n > 0) notes.push(`${unitCount(n, u)} leaked (${plural(n * UNITS[u].lives, "life")}). Counter: ${counterHint(u)}`);
  }
  for (const u of Object.keys(me.battle.killDepth) as UnitType[]) {
    const depth = me.battle.killDepth[u] ?? 0;
    if (depth >= 0.85 && !(me.battle.leaked[u] ?? 0)) notes.push(`${many(UNITS[u].name)} died ${Math.round(depth * 100)}% of the way to your core on average. That is a narrow margin.`);
  }
  const idle = towers.filter((t) => t.damage === 0 && t.type !== "beacon" && t.type !== "frost" && t.type !== "sold");
  if (idle.length) notes.push(`Dealt no damage this round: ${idle.map((t) => `${TOWERS[t.type as TowerType].name} #${t.id}`).join(", ")}.`);
  for (const t of towers) {
    if (t.type !== "sold" && t.damage > 0 && t.overkill > t.damage * 0.6) notes.push(`${TOWERS[t.type as TowerType].name} #${t.id} wasted ${t.overkill} damage as overkill. A different targeting mode may fit it better.`);
  }
  const mySent = sentCount(me.sent);
  if (mySent > 0) {
    notes.push(
      opp.battle.leakedLives.send > 0
        ? `Your sends took ${plural(opp.battle.leakedLives.send, "life")} from the opponent.`
        : `None of the ${mySent} units you sent got through.`,
    );
  }
  if (lane.intel.newlySeen.length) notes.push(`Your raiders revealed ${plural(lane.intel.newlySeen.length, "enemy tower")}. scout_opponent lists everything you know about their base.`);
  else if (mySent === 0 && !Object.keys(lane.intel.towers).length) notes.push("You know nothing about their base yet. Raiders you send reveal the towers that shoot them; a Scanner reveals everything.");
  if (opp.drums) notes.push(`The opponent beat War Drums: everything in your lane moved ${Math.round((DRUMS.haste - 1) * 100)}% faster this round. Frost Vents and spare damage early on the road blunt them.`);
  if (me.drums) notes.push(`Your War Drums drove their lane ${Math.round((DRUMS.haste - 1) * 100)}% faster. They lost ${plural(opp.battle.livesLost, "life")} this round.`);
  if (me.goldStolen > 0) notes.push(`Your goblins stole ${me.goldStolen} gold from the opponent.`);
  else if (me.sent.some((o) => UNITS[o.unit].loot)) notes.push("Every goblin you sent was caught before it reached the core.");
  if (me.battle.livesLost === 0 && me.goldAfter > 250 && state.status === "planning") notes.push(`You are holding ${me.goldAfter} gold. Unspent gold earns nothing.`);

  return {
    round: rec.round,
    theme: waveArchetype(state.seed, rec.round),
    you: {
      livesLost: me.battle.livesLost, livesNow: me.livesAfter,
      livesLostTo: { neutralWave: me.battle.leakedLives.base, opponentSends: me.battle.leakedLives.send },
      faced: me.battle.spawned, leaked: me.battle.leaked,
      killDepth: me.battle.killDepth,
      bountyEarned: me.battle.bounty, incomePaid: me.incomeAfter, goldStolenFromYou: me.goldLost, goldYourGoblinsStole: me.goldStolen, goldNow: me.goldAfter,
      towers,
    },
    opponentSentYou: opp.sent.map((o) => ({ unit: o.unit, units: o.orders * UNITS[o.unit].send.count })),
    opponentBeatDrums: opp.drums,
    opponentSaid: opp.said ?? null,
    yourSends: { sent: me.sent.map((o) => ({ unit: o.unit, units: o.orders * UNITS[o.unit].send.count })), drums: me.drums, goldSpent: me.sendSpent, livesTaken: opp.battle.leakedLives.send },
    // Only what is public. Their leaks, gold and income are not.
    opponent: { livesLost: opp.battle.livesLost, livesNow: opp.livesAfter },
    // Towers that struck your raiders this round are now on your map of their base.
    revealedThisRound: lane.intel.newlySeen.map((id) => { const t = lane.intel.towers[id]; return { id, type: t.type, x: t.x, y: t.y, level: t.level, targeting: t.targeting }; }),
    notes,
  };
}

function counterHint(u: UnitType): string {
  switch (u) {
    case "kobold": return "splash (Cannon) or chaining (Tesla Coil).";
    case "hellhound": return "more damage early on the path, or a Frost Vent to hold them in range.";
    case "goblin": return "a Laser Sentry, which always shoots the weakest enemy, or any tower set to target weak. Goblins hide behind tougher raiders.";
    case "orc": return "Tesla Coil breaks shields at double damage.";
    case "imp": return "Flak on the flight line.";
    case "wyvern": return "Flak (Seeker) or Ballista; gatlings barely scratch its armour.";
    case "ogre": return "Ballista ignores armour.";
    default: return "stacked Ballistas with 'strong' targeting, and slows to keep it in range.";
  }
}
