import {
  RULES, TARGETINGS, TOWERS, TOWER_TYPES, UNITS, UNIT_TYPES, defenceResale, scannerPrice, sendCap,
  type Spec, type Targeting, type TowerType, type UnitType,
} from "./data.ts";
import { canonicalAction, CURRENT_RULES } from "./match-log.ts";
import { runBattle, type BattleResult, type Tower } from "./battle.ts";
import { generateMap, isBuildable, type GameMap } from "./map.ts";
import { baseWave, sendGroups } from "./waves.ts";

export type Action =
  | { type: "scan" }
  | { type: "build"; tower: TowerType; x: number; y: number; targeting?: Targeting }
  | { type: "upgrade"; id: number; spec?: Spec }
  | { type: "sell"; id: number; pricing?: "whole-percent" }
  | { type: "target"; id: number; mode: Targeting }
  | { type: "send"; unit: UnitType; orders?: number };

export interface Lane {
  gold: number;
  income: number;
  lives: number;
  towers: Tower[];
  nextTowerId: number;
  /** Orders bought this round, aimed at the opponent. */
  sends: { unit: UnitType; orders: number }[];
  sendSpent: number;
  committed: boolean;
  /** What this player knows about the opponent's towers. Fog of war: only what contact or a Scanner revealed. */
  intel: Intel;
  /** Round of this player's last Scanner, 0 if none. */
  lastScanRound: number;
  totals: { towerGold: number; sendGold: number; scannerGold: number; bounty: number; livesTaken: number; refunds: number; goldStolen: number; goldLost: number };
}

/** One opponent tower as last seen. It may since have been upgraded, retargeted or sold. */
export interface SeenTower extends Tower {
  seenRound: number;
  /** "contact": it struck one of your raiders in that round's battle. "scan": a Scanner saw it as that round opened. */
  via: "contact" | "scan";
}

export interface Intel {
  /** Known opponent towers, by tower id. */
  towers: Record<number, SeenTower>;
  /** Towers first revealed in the most recent round, for the round report. */
  newlySeen: number[];
}

export interface RoundRecord {
  round: number;
  /** Indexed by player. `sent` is what that player sent at the opponent. */
  sides: {
    battle: BattleResult;
    sent: { unit: UnitType; orders: number }[];
    sendSpent: number;
    /** Gold thieves took from this side, and gold this side's thieves brought home. */
    goldLost: number;
    goldStolen: number;
    goldAfter: number;
    incomeAfter: number;
    livesAfter: number;
    towerValue: number;
  }[];
}

export type Winner = 0 | 1 | "draw";

/** A lane as it stood when the round opened. What a Scanner sees; never shown to the opponent directly. */
export interface OpenLane {
  towers: Tower[];
  lives: number;
  income: number;
  gold: number;
}

export interface DuelState {
  seed: number;
  map: GameMap;
  /** Round currently being planned, 1-based. */
  round: number;
  status: "planning" | "finished";
  lanes: [Lane, Lane];
  /** Each lane as the round opened. Private: only a Scanner reads the opponent's. */
  open: [OpenLane, OpenLane];
  history: RoundRecord[];
  winner: Winner | null;
  endReason: string | null;
  /** Accepted actions per round per player: everything needed to replay the match. */
  log: [Action[], Action[]][];
}

function newLane(): Lane {
  return {
    gold: RULES.startGold, income: RULES.baseIncome, lives: RULES.startLives, towers: [], nextTowerId: 1,
    sends: [], sendSpent: 0, committed: false, intel: { towers: {}, newlySeen: [] }, lastScanRound: 0,
    totals: { towerGold: 0, sendGold: 0, scannerGold: 0, bounty: 0, livesTaken: 0, refunds: 0, goldStolen: 0, goldLost: 0 },
  };
}

function openLane(lane: Lane): OpenLane {
  return { towers: lane.towers.map((t) => ({ ...t })), lives: lane.lives, income: lane.income, gold: lane.gold };
}

export function createDuel(seed: number, rulesVersion = CURRENT_RULES): DuelState {
  const lanes: [Lane, Lane] = [newLane(), newLane()];
  return {
    seed, map: generateMap(seed, rulesVersion), round: 1, status: "planning", lanes, open: [openLane(lanes[0]), openLane(lanes[1])],
    history: [], winner: null, endReason: null, log: [[[], []]],
  };
}

export type ActionResult = { ok: true; note: string; towerId?: number } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

/** Validate and apply one action for a player. Rejected actions change nothing. */
export function applyAction(state: DuelState, player: 0 | 1, action: Action): ActionResult {
  const order: Action = action?.type === "sell" ? { ...action, pricing: "whole-percent" } : canonicalAction(action);
  return applyRecordedAction(state, player, order);
}

/** Old sales used floating-point multiplication. Keep their exact payout during replay. */
export function applyRecordedAction(state: DuelState, player: 0 | 1, action: Action): ActionResult {
  if (state.status !== "planning") return fail("The match is over.");
  const lane = state.lanes[player];
  if (lane.committed) return fail("You already ended your turn this round.");
  const res = apply(state, player, lane, action);
  if (res.ok) state.log[state.round - 1][player].push(action);
  return res;
}

function apply(state: DuelState, player: 0 | 1, lane: Lane, a: Action): ActionResult {
  switch (a?.type) {
    case "scan": {
      const cost = scannerPrice(state.round);
      if (lane.lastScanRound === state.round) return fail("You already have this round's Scanner report. Read it again with scout_opponent.");
      if (lane.gold < cost) return fail(`A Scanner costs ${cost} gold this round; you have ${lane.gold}.`);
      lane.gold -= cost;
      lane.totals.scannerGold += cost;
      lane.lastScanRound = state.round;
      // A Scanner sees the whole base as it opened this round, and anything not there is gone.
      const seen: Record<number, SeenTower> = {};
      for (const t of state.open[1 - player].towers) seen[t.id] = { ...t, seenRound: state.round, via: "scan" };
      lane.intel = { towers: seen, newlySeen: lane.intel.newlySeen };
      return { ok: true, note: `Scanner deployed for ${cost} gold: ${Object.keys(seen).length} enemy towers seen as round ${state.round} opened.` };
    }
    case "build": {
      if (!TOWER_TYPES.includes(a.tower)) return fail(`Unknown tower "${a.tower}". Options: ${TOWER_TYPES.join(", ")}.`);
      if (a.targeting && !TARGETINGS.includes(a.targeting)) return fail(`Unknown targeting "${a.targeting}".`);
      if (!isBuildable(state.map, a.x, a.y)) return fail(`(${a.x},${a.y}) is not buildable: it is path, rubble or off the map.`);
      if (lane.towers.some((t) => t.x === a.x && t.y === a.y)) return fail(`(${a.x},${a.y}) already has a tower.`);
      const cost = TOWERS[a.tower].levels[0].cost;
      if (lane.gold < cost) return fail(`${TOWERS[a.tower].name} costs ${cost} gold; you have ${lane.gold}.`);
      lane.gold -= cost;
      lane.totals.towerGold += cost;
      const id = lane.nextTowerId++;
      // A tower with fixed targeting ignores whatever was asked for.
      const targeting = TOWERS[a.tower].fixedTargeting ?? a.targeting ?? "first";
      lane.towers.push({ id, type: a.tower, x: a.x, y: a.y, level: 1, spec: null, targeting, invested: cost, dmg: 0, kills: 0 });
      return { ok: true, note: `Built ${TOWERS[a.tower].name} #${id} at (${a.x},${a.y}) for ${cost}.`, towerId: id };
    }
    case "upgrade": {
      const t = lane.towers.find((t) => t.id === a.id);
      if (!t) return fail(`You have no tower #${a.id}.`);
      const def = TOWERS[t.type];
      if (t.spec) return fail(`Tower #${t.id} is already specialised.`);
      if (t.level < 3) {
        if (a.spec) return fail(`Tower #${t.id} is level ${t.level}; specialisations unlock at level 3.`);
        const cost = def.levels[t.level].cost;
        if (lane.gold < cost) return fail(`Upgrade costs ${cost} gold; you have ${lane.gold}.`);
        lane.gold -= cost;
        lane.totals.towerGold += cost;
        t.level++;
        t.invested += cost;
        return { ok: true, note: `${def.name} #${t.id} is now level ${t.level} (${cost} gold).` };
      }
      if (a.spec !== "a" && a.spec !== "b") {
        return fail(`Tower #${t.id} is level 3. Pick a specialisation: spec "a" (${def.specs.a.name}) or "b" (${def.specs.b.name}).`);
      }
      const cost = def.specs[a.spec].cost;
      if (lane.gold < cost) return fail(`${def.specs[a.spec].name} costs ${cost} gold; you have ${lane.gold}.`);
      lane.gold -= cost;
      lane.totals.towerGold += cost;
      t.level = 4;
      t.spec = a.spec;
      t.invested += cost;
      return { ok: true, note: `${def.name} #${t.id} specialised into ${def.specs[a.spec].name} (${cost} gold).` };
    }
    case "sell": {
      const idx = lane.towers.findIndex((t) => t.id === a.id);
      if (idx < 0) return fail(`You have no tower #${a.id}.`);
      const invested = lane.towers[idx].invested;
      const refund = a.pricing === "whole-percent" ? defenceResale(invested) : Math.floor(invested * 0.7);
      lane.towers.splice(idx, 1);
      lane.gold += refund;
      lane.totals.refunds += refund;
      return { ok: true, note: `Sold tower #${a.id} for ${refund} gold.` };
    }
    case "target": {
      const t = lane.towers.find((t) => t.id === a.id);
      if (!t) return fail(`You have no tower #${a.id}.`);
      if (!TARGETINGS.includes(a.mode)) return fail(`Unknown targeting "${a.mode}". Options: ${TARGETINGS.join(", ")}.`);
      const fixed = TOWERS[t.type].fixedTargeting;
      if (fixed) return fail(`A ${TOWERS[t.type].name} always targets ${fixed}; that cannot be changed.`);
      t.targeting = a.mode;
      return { ok: true, note: `Tower #${t.id} now targets ${a.mode}.` };
    }
    case "send": {
      if (!UNIT_TYPES.includes(a.unit)) return fail(`Unknown unit "${a.unit}". Options: ${UNIT_TYPES.join(", ")}.`);
      const orders = a.orders ?? 1;
      if (!Number.isInteger(orders) || orders < 1 || orders > 50) return fail("orders must be a whole number from 1 to 50.");
      const s = UNITS[a.unit].send;
      if (state.round < s.unlock) return fail(`${UNITS[a.unit].name} sends unlock in round ${s.unlock}.`);
      const cost = s.cost * orders;
      const cap = sendCap(state.round);
      if (lane.sendSpent + cost > cap) return fail(`Send cap this round is ${cap} gold; you have used ${lane.sendSpent} and this costs ${cost}.`);
      if (lane.gold < cost) return fail(`That costs ${cost} gold; you have ${lane.gold}.`);
      lane.gold -= cost;
      lane.sendSpent += cost;
      lane.totals.sendGold += cost;
      lane.income += s.income * orders;
      const existing = lane.sends.find((o) => o.unit === a.unit);
      if (existing) existing.orders += orders;
      else lane.sends.push({ unit: a.unit, orders });
      return { ok: true, note: `Sending ${s.count * orders} ${UNITS[a.unit].name}${s.count * orders > 1 ? "s" : ""} for ${cost} gold (+${s.income * orders} income).` };
    }
    default:
      return fail(`Unknown action type. Options: build, upgrade, sell, target, send, scan.`);
  }
}

export function commit(state: DuelState, player: 0 | 1): void {
  if (state.status === "planning") state.lanes[player].committed = true;
}

export function bothCommitted(state: DuelState): boolean {
  return state.lanes[0].committed && state.lanes[1].committed;
}

/** Fight the round on both lanes, pay out, and advance or finish the match. */
export function resolveRound(state: DuelState): RoundRecord {
  const round = state.round;
  const base = baseWave(state.seed, round);
  const results = [0, 1].map((p) => {
    const incoming = sendGroups(state.lanes[1 - p].sends);
    return runBattle(state.map, state.lanes[p].towers, [...base, ...incoming], round);
  });

  const record: RoundRecord = { round, sides: [] };
  // Thieves are paid from the defender's purse after its own payout, never pushing it below zero.
  const theft = ([0, 1] as const).map((p) => Math.min(results[p].stolen, state.lanes[p].gold + results[p].bounty + state.lanes[p].income));
  for (const p of [0, 1] as const) {
    const lane = state.lanes[p];
    const r = results[p];
    lane.lives -= r.livesLost;
    lane.gold += r.bounty + lane.income - theft[p] + theft[1 - p];
    lane.totals.goldLost += theft[p];
    lane.totals.goldStolen += theft[1 - p];
    lane.totals.bounty += r.bounty;
    state.lanes[1 - p].totals.livesTaken += r.leakedLives.send;
    for (const ts of r.towers) {
      const t = lane.towers.find((t) => t.id === ts.id);
      if (t) {
        t.dmg += ts.dmg;
        t.kills += ts.kills;
      }
    }
  }
  for (const p of [0, 1] as const) {
    const lane = state.lanes[p];
    record.sides.push({
      battle: results[p], sent: lane.sends, sendSpent: lane.sendSpent, goldLost: theft[p], goldStolen: theft[1 - p],
      goldAfter: lane.gold, incomeAfter: lane.income, livesAfter: lane.lives,
      towerValue: lane.towers.reduce((s, t) => s + t.invested, 0),
    });
    lane.sends = [];
    lane.sendSpent = 0;
    lane.committed = false;
  }
  state.history.push(record);
  // Fog of war: each player learns the towers that struck the raiders it sent.
  for (const p of [0, 1] as const) {
    const intel = state.lanes[p].intel, theirs = state.lanes[1 - p].towers;
    intel.newlySeen = [];
    for (const id of results[1 - p].contacts) {
      const t = theirs.find((x) => x.id === id);
      if (!t) continue;
      if (!intel.towers[id]) intel.newlySeen.push(id);
      intel.towers[id] = { ...t, seenRound: round, via: "contact" };
    }
  }
  state.open = [openLane(state.lanes[0]), openLane(state.lanes[1])];

  const [a, b] = state.lanes;
  if (a.lives <= 0 || b.lives <= 0) {
    if (a.lives <= 0 && b.lives <= 0) {
      state.winner = a.lives === b.lives ? "draw" : a.lives > b.lives ? 0 : 1;
      state.endReason = state.winner === "draw" ? "Both cores fell in the same round with equal damage." : "Both cores fell in the same round; the one that took less damage wins.";
    } else {
      state.winner = a.lives > 0 ? 0 : 1;
      state.endReason = `Core destroyed in round ${round}.`;
    }
    state.status = "finished";
  } else if (round >= RULES.maxRounds) {
    state.winner = a.lives === b.lives ? "draw" : a.lives > b.lives ? 0 : 1;
    state.endReason = `Round limit reached; ${state.winner === "draw" ? "lives were level" : "more lives remaining wins"}.`;
    state.status = "finished";
  } else {
    state.round++;
    state.log.push([[], []]);
  }
  return record;
}

/** Why a match ended, read back from its stored reason. Lives decide every ending except a resignation or a forfeit. */
export type EndKind = "core" | "both-fell" | "round-limit" | "resigned" | "forfeit";

export function endKind(reason: string | null): EndKind | null {
  if (!reason) return null;
  if (reason.startsWith("Resigned")) return "resigned";
  if (reason.startsWith("Forfeit")) return "forfeit";
  if (reason.startsWith("Both cores")) return "both-fell";
  return reason.startsWith("Round limit") ? "round-limit" : "core";
}

export function forfeit(state: DuelState, loser: 0 | 1, reason: string): void {
  if (state.status === "finished") return;
  state.winner = loser === 0 ? 1 : 0;
  state.endReason = reason;
  state.status = "finished";
}

/**
 * Rebuild a match from its seed and action log. `resolvedRounds` is how many
 * rounds had been fought; a trailing log entry beyond that is a planning phase
 * still in progress. Used by replays and to verify determinism.
 */
export function replayDuel(seed: number, log: [Action[], Action[]][], resolvedRounds: number, rulesVersion = CURRENT_RULES): DuelState {
  const state = createDuel(seed, rulesVersion);
  for (let r = 0; r < log.length && state.status === "planning"; r++) {
    for (const p of [0, 1] as const) for (const a of log[r][p]) applyRecordedAction(state, p, a);
    if (r < resolvedRounds) resolveRound(state);
  }
  return state;
}
