// What an agent is allowed to see. Everything here reads the opponent through
// `state.open`, never the live lane, so a view can never leak hidden moves.
import { RULES, TOWERS, UNITS, UNIT_TYPES, hpScale, sendCap, type TowerType, type UnitType } from "./data.ts";
import { effectiveStats, type Tower } from "./battle.ts";
import type { DuelState } from "./duel.ts";
import { pathCoverage, renderAscii, type GameMap } from "./map.ts";
import { baseWave, summarizeWave, waveArchetype } from "./waves.ts";

function towerView(t: Tower, map: GameMap, all: Tower[]) {
  const s = effectiveStats(t, map, all);
  const def = TOWERS[t.type];
  return {
    id: t.id, type: t.type, x: t.x, y: t.y,
    level: t.spec ? `spec ${t.spec} (${def.specs[t.spec].name})` : t.level,
    targeting: t.targeting,
    range: Math.round(s.range * 100) / 100,
    dps: Math.round(s.dmg * s.rate * 10) / 10,
    invested: t.invested, lifetimeDamage: t.dmg, kills: t.kills,
  };
}

export function forecast(state: DuelState, rounds = 3) {
  const out = [];
  for (let r = state.round; r < state.round + rounds && r <= RULES.maxRounds; r++) {
    out.push({ round: r, theme: waveArchetype(state.seed, r), units: summarizeWave(baseWave(state.seed, r)), hpMultiplier: hpScale(r) });
  }
  return out;
}

export function mapView(map: GameMap) {
  const special = (tile: string) => {
    const cells: [number, number][] = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.tiles[y][x] === tile) cells.push([x, y]);
    return cells;
  };
  // One digit per buildable cell: path cells within nailgun range. A quick read on where the road bunches up.
  const cover = map.tiles.map((row, y) =>
    row.map((t, x) => (t === "." || t === "^" || t === "*" ? Math.min(9, pathCoverage(map, x, y, 2.6)).toString() : "-")).join(" "),
  );
  return {
    size: { width: map.w, height: map.h },
    legend: ". open  # path  S spawn  C core  x rubble (unbuildable)  ^ high ground (+0.75 range)  * power tile (+25% damage)",
    grid: renderAscii(map),
    path: map.path,
    flightLine: { from: map.path[0], to: map.path[map.path.length - 1], note: "Flying units travel this straight line, ignoring the path." },
    highGround: special("^"),
    powerTiles: special("*"),
    pathCellsWithin2_6: ["    " + Array.from({ length: map.w }, (_, i) => i % 10).join(" "), ...cover.map((r, y) => `y${y.toString().padStart(2, " ")} ${r}`)].join("\n"),
  };
}

export function stateView(state: DuelState, player: 0 | 1) {
  const me = state.lanes[player];
  const opp = state.open[1 - player];
  const last = state.history[state.history.length - 1];
  return {
    round: state.round,
    maxRounds: RULES.maxRounds,
    status: state.status,
    you: {
      gold: me.gold, income: me.income, lives: me.lives, turnEnded: me.committed,
      sendBudget: { cap: sendCap(state.round), used: me.sendSpent },
      queuedSends: me.sends,
      towers: me.towers.map((t) => towerView(t, state.map, me.towers)),
    },
    opponent: {
      note: "As of the start of this round. Call scout_opponent for their full board.",
      lives: opp.lives, income: opp.income, gold: opp.gold, towers: opp.towers.length,
      sentAtYouLastRound: last ? last.sides[1 - player].sent : [],
    },
    incomingWaves: forecast(state),
    sendShop: UNIT_TYPES.map((u: UnitType) => ({
      unit: u, unitsPerOrder: UNITS[u].send.count, cost: UNITS[u].send.cost, incomePerOrder: UNITS[u].send.income,
      available: state.round >= UNITS[u].send.unlock, unlocksRound: UNITS[u].send.unlock,
    })),
    board: renderAscii(state.map, me.towers),
  };
}

export function scoutView(state: DuelState, player: 0 | 1) {
  const opp = state.open[1 - player];
  const byType: Partial<Record<TowerType, number>> = {};
  for (const t of opp.towers) byType[t.type] = (byType[t.type] ?? 0) + 1;
  const canHit = (kind: "air" | "ground") =>
    opp.towers
      .filter((t) => t.type !== "relay" && t.type !== "frost" && (TOWERS[t.type].targets === "both" || TOWERS[t.type].targets === kind))
      .reduce((sum, t) => {
        const s = effectiveStats(t, state.map, opp.towers);
        return sum + s.dmg * s.rate;
      }, 0);
  return {
    note: "Their board as it stood when this round opened. Anything they do this round is hidden until it resolves.",
    lives: opp.lives, income: opp.income, gold: opp.gold,
    towersByType: byType,
    dpsAgainstGround: Math.round(canHit("ground")),
    dpsAgainstAir: Math.round(canHit("air")),
    towers: opp.towers.map((t) => towerView(t, state.map, opp.towers)),
    board: renderAscii(state.map, opp.towers),
  };
}
