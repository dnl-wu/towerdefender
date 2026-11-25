import {
  RULES, TARGETINGS, TOWERS, TOWER_TYPES, UNITS, UNIT_TYPES, sendCap,
  type Spec, type Targeting, type TowerType, type UnitType,
} from "./data.ts";
import { runBattle, type BattleResult, type Tower } from "./battle.ts";
import { generateMap, isBuildable, type GameMap } from "./map.ts";
import { baseWave, sendGroups } from "./waves.ts";

export type Action =
  | { type: "build"; tower: TowerType; x: number; y: number; targeting?: Targeting }
  | { type: "upgrade"; id: number; spec?: Spec }
  | { type: "sell"; id: number }
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
  totals: { towerGold: number; sendGold: number; bounty: number; livesTaken: number; refunds: number };
}

export interface RoundRecord {
  round: number;
  /** Indexed by player. `sent` is what that player sent at the opponent. */
  sides: {
    battle: BattleResult;
    sent: { unit: UnitType; orders: number }[];
    sendSpent: number;
    goldAfter: number;
    incomeAfter: number;
    livesAfter: number;
    towerValue: number;
  }[];
}

export type Winner = 0 | 1 | "draw";

/** A lane as its opponent may see it: frozen when the round opened, so hidden moves stay hidden. */
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
  /** Public snapshot of each lane, refreshed when a round opens. */
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
    sends: [], sendSpent: 0, committed: false,
    totals: { towerGold: 0, sendGold: 0, bounty: 0, livesTaken: 0, refunds: 0 },
  };
}

function openLane(lane: Lane): OpenLane {
  return { towers: lane.towers.map((t) => ({ ...t })), lives: lane.lives, income: lane.income, gold: lane.gold };
}

export function createDuel(seed: number): DuelState {
  const lanes: [Lane, Lane] = [newLane(), newLane()];
  return {
    seed, map: generateMap(seed), round: 1, status: "planning", lanes, open: [openLane(lanes[0]), openLane(lanes[1])],
    history: [], winner: null, endReason: null, log: [[[], []]],
  };
}

export type ActionResult = { ok: true; note: string; towerId?: number } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

/** Validate and apply one action for a player. Rejected actions change nothing. */
export function applyAction(state: DuelState, player: 0 | 1, action: Action): ActionResult {
  if (state.status !== "planning") return fail("The match is over.");
  const lane = state.lanes[player];
  if (lane.committed) return fail("You already ended your turn this round.");
  const res = apply(state, lane, action);
  if (res.ok) state.log[state.round - 1][player].push(action);
  return res;
}

function apply(state: DuelState, lane: Lane, a: Action): ActionResult {
  switch (a?.type) {
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
      lane.towers.push({ id, type: a.tower, x: a.x, y: a.y, level: 1, spec: null, targeting: a.targeting ?? "first", invested: cost, dmg: 0, kills: 0 });
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
      const refund = Math.floor(lane.towers[idx].invested * RULES.sellRefund);
      lane.towers.splice(idx, 1);
      lane.gold += refund;
      lane.totals.refunds += refund;
      return { ok: true, note: `Sold tower #${a.id} for ${refund} gold.` };
    }
    case "target": {
      const t = lane.towers.find((t) => t.id === a.id);
      if (!t) return fail(`You have no tower #${a.id}.`);
      if (!TARGETINGS.includes(a.mode)) return fail(`Unknown targeting "${a.mode}". Options: ${TARGETINGS.join(", ")}.`);
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
      return fail(`Unknown action type. Options: build, upgrade, sell, target, send.`);
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
  for (const p of [0, 1] as const) {
    const lane = state.lanes[p];
    const r = results[p];
    lane.lives -= r.livesLost;
    lane.gold += r.bounty + lane.income;
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
      battle: results[p], sent: lane.sends, sendSpent: lane.sendSpent,
      goldAfter: lane.gold, incomeAfter: lane.income, livesAfter: lane.lives,
      towerValue: lane.towers.reduce((s, t) => s + t.invested, 0),
    });
    lane.sends = [];
    lane.sendSpent = 0;
    lane.committed = false;
  }
  state.history.push(record);
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
export function replayDuel(seed: number, log: [Action[], Action[]][], resolvedRounds: number): DuelState {
  const state = createDuel(seed);
  for (let r = 0; r < log.length && state.status === "planning"; r++) {
    for (const p of [0, 1] as const) for (const a of log[r][p]) applyAction(state, p, a);
    if (r < resolvedRounds) resolveRound(state);
  }
  return state;
}
