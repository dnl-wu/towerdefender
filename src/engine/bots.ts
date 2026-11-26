import { DRUMS, RULES, TOWERS, UNITS, UNIT_TYPES, drumsPrice, lootFor, scannerPrice, sendCap, type TowerType, type UnitType } from "./data.ts";
import { runBattle, type BattleMods, type Tower } from "./battle.ts";
import { applyAction, type DuelState, type Lane } from "./duel.ts";
import { knownTowers } from "./view.ts";
import { airCoverage, isBuildable, pathCoverage, type GameMap } from "./map.ts";
import { Rng, hashSeed } from "./rng.ts";
import { baseWave, sendGroups, summarizeWave, type SpawnGroup } from "./waves.ts";

export interface BotDef {
  level: number;
  handle: string;
  name: string;
  rating: number;
  tagline: string;
}

/** House bots that keep the ladder populated. Ratings are calibrated by scripts/balance.ts. */
export const BOTS: BotDef[] = [
  { level: 1, handle: "rustbucket", name: "Rustbucket", rating: 700, tagline: "Builds wherever the bolts fall." },
  { level: 2, handle: "patchwork", name: "Patchwork", rating: 900, tagline: "Follows the manual. Mostly." },
  { level: 3, handle: "foreman", name: "Foreman", rating: 1100, tagline: "Reads the forecast, builds to match." },
  { level: 4, handle: "overseer", name: "Overseer", rating: 1300, tagline: "Runs the numbers before every round." },
  { level: 5, handle: "tyrant", name: "Tyrant", rating: 1500, tagline: "Finds the gap in your wall and sends through it." },
];

/** What a player may know about the opponent while planning: the same fog-of-war intel an agent gets. */
export interface OpponentSnapshot {
  /** Towers it has seen, as last seen. */
  towers: Tower[];
  lives: number;
  lastSent: { unit: UnitType; orders: number }[];
  /** They beat War Drums last round. */
  lastDrums: boolean;
}

export function snapshotOpponent(state: DuelState, player: 0 | 1): OpponentSnapshot {
  const last = state.history[state.history.length - 1];
  return {
    towers: knownTowers(state, player).map(({ seenRound: _r, via: _v, ...t }) => t),
    lives: state.open[1 - player].lives,
    lastSent: last ? last.sides[1 - player].sent : [],
    lastDrums: last ? last.sides[1 - player].drums : false,
  };
}

function tileScore(map: GameMap, x: number, y: number, type: TowerType): number {
  const s = TOWERS[type].levels[0];
  const range = s.range + (map.tiles[y][x] === "^" ? 0.75 : 0);
  const ground = pathCoverage(map, x, y, range) - (s.minRange ? pathCoverage(map, x, y, s.minRange) : 0);
  const air = airCoverage(map, x, y, range);
  const targets = TOWERS[type].targets;
  const cover = targets === "air" ? air * 2 : targets === "ground" ? ground : ground + air * 0.4;
  return cover * (map.tiles[y][x] === "*" ? 1.25 : 1);
}

function rankedTiles(map: GameMap, lane: Lane, type: TowerType): { x: number; y: number; score: number }[] {
  const out: { x: number; y: number; score: number }[] = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!isBuildable(map, x, y) || lane.towers.some((t) => t.x === x && t.y === y)) continue;
      const score = tileScore(map, x, y, type);
      if (score > 0) out.push({ x, y, score });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
}

/** How the bots price stolen gold against lost lives when weighing a defence or an attack. */
const GOLD_PER_LIFE = 12;
/** What a leak costs the defender: lives, plus any gold thieves carried off. */
const pain = (r: { livesLost: number; stolen: number }) => r.livesLost + r.stolen / GOLD_PER_LIFE;

const COUNTER: Record<UnitType, TowerType> = {
  kobold: "cannon", hellhound: "gatling", goblin: "laser", orc: "tesla", imp: "flak", ogre: "ballista", wyvern: "flak", minotaur: "ballista",
};

/**
 * How one bot plays one match: small leanings drawn from a secret salt the
 * arena keeps until the match ends. The engine is open, so without them a
 * player could run a copy of the bot and know its every move in advance.
 */
interface Temperament {
  /** Share of the purse held back from attacks. */
  reserve: number;
  /** How much better a drummed attack must look before the bot pays for drums. */
  drumsBar: number;
  /** Chance of going with the second-best attack when it is nearly as good. */
  vary: number;
  /** Scanner bought once the purse is this many times its price. */
  scanAt: number;
  /** Extra orders assumed on top of the opponent's last send. */
  escalate: number;
}

function temperament(state: DuelState, player: 0 | 1, level: number, salt: number): Temperament {
  const r = new Rng(hashSeed("temper", state.seed, player, level, salt));
  const span = (lo: number, hi: number) => lo + (hi - lo) * r.next();
  return {
    reserve: level >= 5 ? span(0.06, 0.14) : span(0.2, 0.3),
    drumsBar: span(1.05, 1.35),
    vary: span(0.2, 0.45),
    scanAt: span(8, 12),
    escalate: r.chance(0.7) ? 1 : 0,
  };
}

class BotTurn {
  rng: Rng;
  lane: Lane;
  state: DuelState;
  player: 0 | 1;
  level: number;
  /** 0 for the reproducible bots of scripts and tests; the arena passes each match's secret. */
  salt: number;
  constructor(state: DuelState, player: 0 | 1, level: number, salt = 0) {
    this.state = state;
    this.player = player;
    this.level = level;
    this.salt = salt;
    this.rng = new Rng(hashSeed("bot", state.seed, state.round, player, level, salt));
    this.lane = state.lanes[player];
  }

  build(type: TowerType): boolean {
    const tiles = rankedTiles(this.state.map, this.lane, type);
    if (!tiles.length) return false;
    // Weaker bots place sloppily. Stronger ones take the best tile, or now and then one nearly as good,
    // so their board cannot be worked out from the map alone.
    const close = tiles.filter((t) => t.score >= tiles[0].score * 0.9).length;
    const spread = this.level === 1 ? Math.ceil(tiles.length * 0.6) : this.level === 2 ? 5 : this.salt && this.rng.chance(0.4) ? Math.min(3, close) : 1;
    const pick = tiles[this.rng.int(0, Math.min(spread, tiles.length) - 1)];
    const targeting = this.level >= 4 && (type === "ballista") ? "strong" : "first";
    return applyAction(this.state, this.player, { type: "build", tower: type, x: pick.x, y: pick.y, targeting }).ok;
  }

  upgrade(type?: TowerType): boolean {
    const candidates = this.lane.towers
      .filter((t) => !t.spec && (!type || t.type === type) && (t.level < 3 || this.level >= 4))
      .sort((a, b) => b.dmg - a.dmg || a.id - b.id);
    for (const t of candidates) {
      const spec = t.level === 3 ? this.pickSpec(t) : undefined;
      if (applyAction(this.state, this.player, { type: "upgrade", id: t.id, spec }).ok) return true;
    }
    return false;
  }

  pickSpec(t: Tower): "a" | "b" {
    // A sensible default per tower; top bots are not trying to be clever here.
    const pref: Record<TowerType, "a" | "b"> = { gatling: "a", cannon: "a", ballista: "b", tesla: "a", flak: "a", frost: "b", beacon: "a", laser: "a" };
    return this.level >= 5 ? pref[t.type] : this.rng.chance(0.5) ? "a" : "b";
  }

  /** Strengthen the defence against one unit type. */
  improve(unit: UnitType): boolean {
    const want = COUNTER[unit];
    const have = this.lane.towers.filter((t) => t.type === want);
    const upgradable = have.filter((t) => !t.spec).length > 0;
    if (upgradable && have.length >= 2 && this.upgrade(want)) return true;
    if (this.build(want)) return true;
    if (this.upgrade(want)) return true;
    if (this.upgrade()) return true;
    return this.build("gatling");
  }

  simulate(extra: SpawnGroup[] = [], mods: BattleMods = {}) {
    const groups = [...baseWave(this.state.seed, this.state.round), ...extra];
    return runBattle(this.state.map, this.lane.towers, groups, this.state.round, mods);
  }

  /** Keep adding defence until a simulated round holds, or the gold runs out. */
  defendBySimulation(extra: SpawnGroup[], tolerance: number, mods: BattleMods = {}) {
    for (let i = 0; i < 14; i++) {
      const res = this.simulate(extra, mods);
      if (pain(res) <= tolerance) return;
      let worst: UnitType | null = null;
      let worstLives = 0;
      for (const u of Object.keys(res.leaked) as UnitType[]) {
        const lives = (res.leaked[u] ?? 0) * (UNITS[u].lives + lootFor(u, this.state.round) / GOLD_PER_LIFE);
        if (lives > worstLives) {
          worst = u;
          worstLives = lives;
        }
      }
      if (!worst || !this.improve(worst)) return;
    }
  }

  send(unit: UnitType, gold: number) {
    const s = UNITS[unit].send;
    if (this.state.round < s.unlock) return;
    const room = Math.min(gold, this.lane.gold, sendCap(this.state.round) - this.lane.sendSpent);
    const orders = Math.floor(room / s.cost);
    if (orders > 0) applyAction(this.state, this.player, { type: "send", unit, orders });
  }
}

interface Attack { unit: UnitType; drums: boolean; score: number }

/**
 * Try each affordable attack against what the bot knows of the opponent's board,
 * with and without War Drums, and pick the one that hurts most. Drums must beat
 * the best plain attack by the temperament's margin to be worth their price.
 */
function chooseAttack(state: DuelState, opp: OpponentSnapshot, budget: number, temper: Temperament | null, rng: Rng): Attack {
  const neutral = baseWave(state.seed, state.round);
  // A point of permanent income matters less as the round limit approaches.
  const incomeWeight = Math.min(4, RULES.maxRounds - state.round) / 40;
  const options: Attack[] = [];
  const drumsCost = drumsPrice(state.round);
  for (const drums of temper && state.round >= DRUMS.unlock && budget >= drumsCost ? [false, true] : [false]) {
    const room = budget - (drums ? drumsCost : 0);
    for (const unit of UNIT_TYPES) {
      const { cost, income, unlock } = UNITS[unit].send;
      const orders = Math.floor(room / cost);
      if (state.round < unlock || (!orders && !drums)) continue;
      const groups = [...neutral, ...(orders ? sendGroups([{ unit, orders }]) : [])];
      const battle = runBattle(state.map, opp.towers, groups, state.round, drums ? { haste: DRUMS.haste } : {});
      // Stolen gold counts twice: it comes off their payout and onto ours.
      const score = battle.livesLost + (2 * battle.stolen) / GOLD_PER_LIFE + incomeWeight * orders * income;
      options.push({ unit, drums, score: drums ? score / (temper?.drumsBar ?? 1) : score });
    }
  }
  if (!options.length) return { unit: "kobold", drums: false, score: 0 };
  options.sort((a, b) => b.score - a.score);
  const [first, second] = options;
  // Now and then a close second is chosen instead, so the bot is not a fixed function of the board.
  if (temper && second && second.score >= first.score * 0.92 && rng.chance(temper.vary)) return second;
  return first;
}

/**
 * Play one planning phase for a house bot. `opp` must be captured when the
 * round opened so the bot never sees the opponent's hidden moves. `salt` is
 * the match's secret: the arena keeps it hidden until the match is over.
 */
export function playBotTurn(state: DuelState, player: 0 | 1, level: number, opp: OpponentSnapshot, salt = 0): void {
  const turn = new BotTurn(state, player, level, salt);
  const { lane, rng } = turn;
  const round = state.round;
  const wave = summarizeWave(baseWave(state.seed, round));

  if (level <= 1) {
    // Spends everything on a coin flip between two towers. Never sends.
    for (let i = 0; i < 8 && lane.gold >= 40; i++) if (!turn.build(rng.chance(0.7) ? "gatling" : "cannon")) break;
    return;
  }

  if (level === 2) {
    const rotation: TowerType[] = ["gatling", "cannon", "gatling", "flak", "ballista", "tesla"];
    if (round > 3) turn.send("kobold", lane.gold * 0.2);
    for (let i = 0; i < 8 && lane.gold >= 40; i++) {
      if (rng.chance(0.3) && turn.upgrade()) continue;
      if (!turn.build(rotation[(lane.towers.length + i) % rotation.length])) break;
    }
    return;
  }

  if (level === 3) {
    // Builds for the forecast, without checking whether it is enough.
    if (round > 2) turn.send("kobold", lane.gold * 0.25);
    const main = (Object.keys(wave) as UnitType[]).sort((a, b) => (wave[b] ?? 0) * UNITS[b].threat - (wave[a] ?? 0) * UNITS[a].threat);
    for (let i = 0; i < 8 && lane.gold >= 40; i++) if (!turn.improve(main[i % Math.max(1, Math.min(2, main.length))])) break;
    return;
  }

  // Levels 4 and 5 simulate the round and buy only the defence they need.
  const temper = temperament(state, player, level, salt);
  let expected: SpawnGroup[] = sendGroups([{ unit: "kobold", orders: 1 + Math.floor(round / 4) }]);
  let threat: BattleMods = {};
  if (level >= 5) {
    // Assume the opponent repeats, and maybe escalates, their last send, and beats drums again if they just did.
    const guess = opp.lastSent.length ? opp.lastSent : round >= 2 ? [{ unit: "kobold" as UnitType, orders: 1 }] : [];
    expected = sendGroups(guess.map((o) => ({ unit: o.unit, orders: o.orders + (round > 4 ? temper.escalate : 0) })));
    if (opp.lastDrums) threat = { haste: DRUMS.haste };
  }
  turn.defendBySimulation(expected, level >= 5 ? 0 : 1, threat);
  // Tyrant buys a Scanner once it is cheap next to its purse, then plans its attack on what it saw.
  if (level >= 5 && round >= 3 && lane.gold >= Math.max(90, temper.scanAt * scannerPrice(round)) && applyAction(state, player, { type: "scan" }).ok) {
    opp = snapshotOpponent(state, player);
  }
  const attackBudget = Math.min(lane.gold * (1 - temper.reserve), sendCap(round));
  const attack = chooseAttack(state, opp, attackBudget, temper, turn.rng);
  if (attack.drums) applyAction(state, player, { type: "drums" });
  const unit = attack.unit;
  turn.send(unit, attackBudget - (attack.drums ? drumsPrice(round) : 0));
  if (level >= 5) turn.send("kobold", lane.gold * 0.8);
  // Leftover gold goes into upgrades rather than sitting idle.
  if (lane.gold > 150) turn.upgrade();
}

/** Defence-only play at the top bot's standard: buys what the simulation says is needed and never sends. */
export function playTurtleTurn(state: DuelState, player: 0 | 1): void {
  const turn = new BotTurn(state, player, 5);
  turn.defendBySimulation([], 0);
}
