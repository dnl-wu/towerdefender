// Feedback: what an agent hears after every round, and the debrief after a match.
// Notes are written to be acted on, by the agent mid-match and by the human
// tuning the agent afterwards.
import { DRUMS, TOWERS, UNITS, type TowerType, type UnitType } from "./data.ts";
import type { DuelState, RoundRecord, Winner } from "./duel.ts";
import { waveArchetype } from "./waves.ts";

const IRREGULAR: Record<string, string> = { life: "lives" };
const many = (word: string) => IRREGULAR[word] ?? `${word}s`;
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : many(word)}`;
const unitCount = (n: number, u: UnitType) => plural(n, UNITS[u].name.toLowerCase());
const unitList = (m: Partial<Record<UnitType, number>>) =>
  (Object.keys(m) as UnitType[]).filter((u) => (m[u] ?? 0) > 0).map((u) => unitCount(m[u] ?? 0, u)).join(", ") || "nothing";
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

export interface Debrief {
  result: "win" | "loss" | "draw";
  endReason: string;
  rounds: number;
  turningPoint: { round: number; text: string } | null;
  timeline: { round: number; theme: string; lives: [number, number]; income: [number, number]; towerValue: [number, number] }[];
  economy: { you: SideEconomy; opponent: SideEconomy };
  livesLostBy: { unit: UnitType; lives: number; fromSends: boolean }[];
  sends: { unit: UnitType; gold: number; units: number }[];
  towers: { type: TowerType; count: number; gold: number; damage: number; damagePerGold: number }[];
  findings: string[];
}

interface SideEconomy {
  towerGold: number;
  sendGold: number;
  scannerGold?: number;
  drumsGold?: number; // Older persisted debriefs predate War Drums.
  goldStolen?: number; // Older persisted debriefs predate goblins.
  goldLost?: number;
  bounty: number;
  finalIncome: number;
  livesTaken: number;
}

export function debrief(state: DuelState, player: 0 | 1): Debrief {
  const other = (1 - player) as 0 | 1;
  const winner: Winner | null = state.winner;
  const result = winner === "draw" || winner === null ? "draw" : winner === player ? "win" : "loss";
  const me = state.lanes[player];
  const opp = state.lanes[other];

  const timeline = state.history.map((r) => ({
    round: r.round, theme: waveArchetype(state.seed, r.round),
    lives: [r.sides[player].livesAfter, r.sides[other].livesAfter] as [number, number],
    income: [r.sides[player].incomeAfter, r.sides[other].incomeAfter] as [number, number],
    towerValue: [r.sides[player].towerValue, r.sides[other].towerValue] as [number, number],
  }));

  // The round where the gap in lives moved furthest in the eventual direction of the result.
  let turningPoint: Debrief["turningPoint"] = null;
  let bestSwing = 0;
  for (const r of state.history) {
    const mine = r.sides[player].battle.livesLost;
    const theirs = r.sides[other].battle.livesLost;
    const swing = result === "win" ? theirs - mine : mine - theirs;
    if (swing > bestSwing) {
      bestSwing = swing;
      const side = result === "win" ? r.sides[other] : r.sides[player];
      const who = result === "win" ? "The opponent" : "You";
      turningPoint = {
        round: r.round,
        text: `${who} lost ${plural(side.battle.livesLost, "life")} in round ${r.round} (${waveArchetype(state.seed, r.round)}): ${unitList(side.battle.leaked)} leaked, ${side.battle.leakedLives.send} of those lives to sends.`,
      };
    }
  }

  // One entry per unit and origin, so the same unit leaking from the neutral wave and from the opponent's sends reads as two problems.
  const lost = new Map<string, { unit: UnitType; lives: number; fromSends: boolean }>();
  const lostByUnit = new Map<UnitType, number>();
  let lostToSends = 0;
  let lostTotal = 0;
  for (const r of state.history) {
    const b = r.sides[player].battle;
    lostToSends += b.leakedLives.send;
    lostTotal += b.livesLost;
    for (const hit of b.coreHits) {
      const fromSends = hit.source === "send", key = `${hit.unit}:${hit.source}`;
      const e = lost.get(key) ?? { unit: hit.unit, lives: 0, fromSends };
      e.lives += UNITS[hit.unit].lives;
      lost.set(key, e);
      lostByUnit.set(hit.unit, (lostByUnit.get(hit.unit) ?? 0) + UNITS[hit.unit].lives);
    }
  }
  const livesLostBy = [...lost.values()].sort((a, b) => b.lives - a.lives);
  const worst = [...lostByUnit].sort((a, b) => b[1] - a[1])[0];

  const sendTotals = new Map<UnitType, { unit: UnitType; gold: number; units: number }>();
  for (const r of state.history) {
    for (const o of r.sides[player].sent) {
      const e = sendTotals.get(o.unit) ?? { unit: o.unit, gold: 0, units: 0 };
      e.gold += o.orders * UNITS[o.unit].send.cost;
      e.units += o.orders * UNITS[o.unit].send.count;
      sendTotals.set(o.unit, e);
    }
  }

  const byType = new Map<TowerType, { type: TowerType; count: number; gold: number; damage: number; damagePerGold: number }>();
  for (const t of me.towers) {
    const e = byType.get(t.type) ?? { type: t.type, count: 0, gold: 0, damage: 0, damagePerGold: 0 };
    e.count++;
    e.gold += t.invested;
    e.damage += t.dmg;
    byType.set(t.type, e);
  }
  const towers = [...byType.values()].map((e) => ({ ...e, damagePerGold: e.gold ? Math.round((e.damage / e.gold) * 10) / 10 : 0 })).sort((a, b) => b.damage - a.damage);

  const findings: string[] = [];
  if (lostTotal > 0 && worst) {
    findings.push(`${many(UNITS[worst[0]].name)} cost you ${worst[1]} of the ${lostTotal} lives you lost. Counter: ${counterHint(worst[0])}`);
    if (lostToSends > lostTotal * 0.5) findings.push(`${lostToSends} of those lives went to units the opponent sent, not the neutral waves. Scout their send pattern and keep a margin against it.`);
    else if (lostToSends === 0) findings.push("Every life you lost went to the neutral waves, which are forecast three rounds ahead.");
  }
  const firstAir = state.history.find((r) => (r.sides[player].battle.spawned.imp ?? 0) + (r.sides[player].battle.spawned.wyvern ?? 0) > 0);
  const airLeak = state.history.reduce((s, r) => s + (r.sides[player].battle.leaked.imp ?? 0) + (r.sides[player].battle.leaked.wyvern ?? 0) * 2, 0);
  if (firstAir && airLeak >= 4) findings.push(`Flyers took ${airLeak} lives. They first appeared in round ${firstAir.round}.`);
  if (me.totals.sendGold === 0) findings.push("You never sent anything. Sends raise your income permanently; a pure defence falls behind on gold every round.");
  else if (me.totals.livesTaken === 0) findings.push(`You spent ${me.totals.sendGold} gold on sends and took no lives. They still paid for themselves as income if bought early, but none of them tested a weakness.`);
  if (me.totals.goldLost >= 40) findings.push(`Goblins stole ${me.totals.goldLost} gold from you over the match. Counter: ${counterHint("goblin")}`);
  if (me.totals.goldStolen > 0) findings.push(`Your goblins stole ${me.totals.goldStolen} gold.`);
  const drummed = state.history.filter((r) => r.sides[player].drums);
  if (drummed.length) {
    const lost = drummed.reduce((n, r) => n + r.sides[other].battle.livesLost, 0);
    findings.push(`You beat War Drums in ${plural(drummed.length, "round")} (${drummed.map((r) => r.round).join(", ")}) for ${me.totals.drumsGold} gold; the opponent lost ${plural(lost, "life")} in those rounds.`);
  }
  const against = state.history.filter((r) => r.sides[other].drums);
  if (against.length) {
    const lost = against.reduce((n, r) => n + r.sides[player].battle.livesLost, 0);
    findings.push(`The opponent beat War Drums in ${plural(against.length, "round")} (${against.map((r) => r.round).join(", ")}); you lost ${plural(lost, "life")} in those rounds.`);
  }
  if (opp.income > me.income * 1.5 && state.history.length >= 6) findings.push(`The opponent finished with ${opp.income} income against your ${me.income}. They out-earned you for most of the match.`);
  const weak = towers.filter((t) => t.gold >= 150 && t.type !== "beacon" && t.type !== "frost").sort((a, b) => a.damagePerGold - b.damagePerGold)[0];
  const strong = towers[0];
  if (weak && strong && weak.type !== strong.type && weak.damagePerGold < strong.damagePerGold * 0.4) {
    findings.push(`Your ${TOWERS[weak.type].name} towers returned ${weak.damagePerGold} damage per gold against ${strong.damagePerGold} for your ${TOWERS[strong.type].name} towers. Check their placement and whether the waves called for them.`);
  }

  const econ = (l: typeof me): SideEconomy => ({ towerGold: l.totals.towerGold, sendGold: l.totals.sendGold, scannerGold: l.totals.scannerGold, drumsGold: l.totals.drumsGold, goldStolen: l.totals.goldStolen, goldLost: l.totals.goldLost, bounty: l.totals.bounty, finalIncome: l.income, livesTaken: l.totals.livesTaken });
  return {
    result, endReason: state.endReason ?? "", rounds: state.history.length, turningPoint, timeline,
    economy: { you: econ(me), opponent: econ(opp) },
    livesLostBy, sends: [...sendTotals.values()].sort((a, b) => b.gold - a.gold), towers, findings,
  };
}
