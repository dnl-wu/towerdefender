// What an agent is allowed to see. The opponent is read only through the
// player's own intel (fog of war), never their lane, so a view cannot leak
// their towers, gold, income or this round's moves.
import { DRUMS, RULES, TOWERS, UNITS, UNIT_TYPES, defenceResale, drumsPrice, hpScale, lootFor, scannerPrice, sendCap, type TowerType, type UnitType } from "./data.ts";
import { effectiveStats, type Tower } from "./battle.ts";
import type { DuelState, SeenTower } from "./duel.ts";
import { TOWER_GLYPHS, pathCoverage, renderAscii, type GameMap } from "./map.ts";
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
    invested: t.invested, resaleGold: defenceResale(t.invested), lifetimeDamage: t.dmg, kills: t.kills,
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
  // One digit per buildable cell: path cells within 2.6 cells. A quick read on where the road bunches up.
  const cover = map.tiles.map((row, y) =>
    row.map((t, x) => (t === "." || t === "^" || t === "*" ? Math.min(9, pathCoverage(map, x, y, 2.6)).toString() : "-")).join(" "),
  );
  return {
    size: { width: map.w, height: map.h },
    legend: ". open  # path  S spawn  C core  x rubble (unbuildable)  ^ high ground (+0.75 range)  * power tile (+25% damage). Towers: " + Object.entries(TOWER_GLYPHS).map(([t, g]) => `${g} ${t}`).join("  "),
    grid: renderAscii(map),
    path: map.path,
    flightLine: { from: map.path[0], to: map.path[map.path.length - 1], note: "Flying units travel this straight line, ignoring the path." },
    highGround: special("^"),
    powerTiles: special("*"),
    pathCellsWithin2_6: ["    " + Array.from({ length: map.w }, (_, i) => i % 10).join(" "), ...cover.map((r, y) => `y${y.toString().padStart(2, " ")} ${r}`)].join("\n"),
  };
}

/** An opponent tower as this player last saw it: no lifetime stats or gold invested, which were never visible. */
function seenView(t: SeenTower, map: GameMap, known: Tower[]) {
  const s = effectiveStats(t, map, known);
  const def = TOWERS[t.type];
  return {
    id: t.id, type: t.type, x: t.x, y: t.y,
    level: t.spec ? `spec ${t.spec} (${def.specs[t.spec].name})` : t.level,
    targeting: t.targeting,
    range: Math.round(s.range * 100) / 100,
    dps: Math.round(s.dmg * s.rate * 10) / 10,
    seenRound: t.seenRound, seenBy: t.via,
  };
}

export function knownTowers(state: DuelState, player: 0 | 1): SeenTower[] {
  return Object.values(state.lanes[player].intel.towers).sort((a, b) => a.id - b.id);
}

export function stateView(state: DuelState, player: 0 | 1) {
  const me = state.lanes[player];
  const last = state.history[state.history.length - 1];
  const known = knownTowers(state, player);
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
      note: "Fog of war. Their lives and what they sent at you are public. Their gold, income and board are private: you know only towers that struck your raiders or that a Scanner saw. Call scout_opponent for what you know.",
      lives: state.open[1 - player].lives,
      knownTowers: known.length,
      sentAtYouLastRound: last ? last.sides[1 - player].sent : [],
      beatDrumsLastRound: last ? last.sides[1 - player].drums : false,
    },
    scanner: { cost: scannerPrice(state.round), boughtThisRound: me.lastScanRound === state.round, lastScanRound: me.lastScanRound || null, tool: "deploy_scanner" },
    warDrums: {
      cost: drumsPrice(state.round), available: state.round >= DRUMS.unlock, unlocksRound: DRUMS.unlock, boughtThisRound: me.drums,
      effect: `Every enemy in their lane, neutral wave included, moves ${Math.round((DRUMS.haste - 1) * 100)}% faster this round. Uses your send cap, gives no income. Action: {"type":"drums"}.`,
    },
    incomingWaves: forecast(state),
    sendShop: UNIT_TYPES.map((u: UnitType) => ({
      unit: u, unitsPerOrder: UNITS[u].send.count, cost: UNITS[u].send.cost, incomePerOrder: UNITS[u].send.income,
      ...(UNITS[u].loot ? { stealsPerUnitThisRound: lootFor(u, state.round) } : {}),
      available: state.round >= UNITS[u].send.unlock, unlocksRound: UNITS[u].send.unlock,
    })),
    board: renderAscii(state.map, me.towers),
  };
}

export function scoutView(state: DuelState, player: 0 | 1) {
  const known = knownTowers(state, player);
  const byType: Partial<Record<TowerType, number>> = {};
  for (const t of known) byType[t.type] = (byType[t.type] ?? 0) + 1;
  const canHit = (kind: "air" | "ground") =>
    known
      .filter((t) => t.type !== "beacon" && t.type !== "frost" && (TOWERS[t.type].targets === "both" || TOWERS[t.type].targets === kind))
      .reduce((sum, t) => {
        const s = effectiveStats(t, state.map, known);
        return sum + s.dmg * s.rate;
      }, 0);
  const me = state.lanes[player];
  return {
    note: me.lastScanRound === state.round
      ? `Your Scanner saw their whole base as round ${state.round} opened. Changes they make this round are hidden.`
      : "Only towers that struck your raiders, or that a Scanner saw, are listed, each with the round it was last seen. Towers that never fired at your raiders stay hidden, and anything here may since have been upgraded or sold. Their gold and income are private.",
    lives: state.open[1 - player].lives,
    lastScanRound: me.lastScanRound || null,
    knownTowersByType: byType,
    knownDpsAgainstGround: Math.round(canHit("ground")),
    knownDpsAgainstAir: Math.round(canHit("air")),
    towers: known.map((t) => seenView(t, state.map, known)),
    board: renderAscii(state.map, known),
  };
}
