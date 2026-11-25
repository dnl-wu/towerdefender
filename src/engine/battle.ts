import {
  RULES, TOWERS, UNITS, armorAgainst, hpScale, shieldMultiplier,
  type DamageType, type Spec, type Targeting, type TowerStats, type TowerType, type UnitType,
} from "./data.ts";
import { flightLength, type GameMap } from "./map.ts";
import type { SpawnGroup } from "./waves.ts";

export interface Tower {
  id: number;
  type: TowerType;
  x: number;
  y: number;
  /** 1..3, or 4 once a specialisation is chosen. */
  level: number;
  spec: Spec | null;
  targeting: Targeting;
  /** Total gold spent on this tower. */
  invested: number;
  /** Lifetime totals, for profiles and debriefs. */
  dmg: number;
  kills: number;
}

export interface EffectiveStats extends TowerStats {
  dmgType: DamageType;
  targets: "ground" | "air" | "both";
}

export function baseStats(t: { type: TowerType; level: number; spec: Spec | null }): TowerStats {
  const def = TOWERS[t.type];
  return t.spec ? def.specs[t.spec] : def.levels[Math.min(t.level, 3) - 1];
}

/** Stats after terrain and relay bonuses. */
export function effectiveStats(t: Tower, map: GameMap, towers: Tower[]): EffectiveStats {
  const def = TOWERS[t.type];
  const s = baseStats(t);
  let dmg = s.dmg;
  let range = s.range;
  if (t.type !== "relay") {
    const tile = map.tiles[t.y][t.x];
    if (tile === "^") range += RULES.highGroundRange;
    if (tile === "*") dmg *= 1 + RULES.powerTileDmg;
    let buffDmg = 0;
    let buffRange = 0;
    for (const o of towers) {
      if (o.type !== "relay" || Math.abs(o.x - t.x) > 1 || Math.abs(o.y - t.y) > 1) continue;
      const rs = baseStats(o);
      buffDmg = Math.max(buffDmg, rs.buffDmg ?? 0);
      buffRange = Math.max(buffRange, rs.buffRange ?? 0);
    }
    dmg *= 1 + buffDmg;
    range *= 1 + buffRange;
  }
  return { ...s, dmg, range, dmgType: def.dmgType, targets: def.targets };
}

export interface Enemy {
  id: number;
  unit: UnitType;
  source: "base" | "send";
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  /** Distance travelled along its route, in cells. */
  dist: number;
  x: number;
  y: number;
  slow: number;
  slowUntil: number;
  brittle: number;
  burn: number;
  burnUntil: number;
  burnBy: number;
  alive: boolean;
}

export type BattleEvent =
  | { e: "spawn"; id: number }
  | { e: "shot"; tower: number; x: number; y: number; hits: number[]; splash?: number }
  | { e: "pulse"; tower: number }
  | { e: "die"; id: number; x: number; y: number }
  | { e: "leak"; id: number; lives: number };

interface TowerRuntime {
  tower: Tower;
  stats: EffectiveStats;
  cooldown: number;
  dmg: number;
  kills: number;
  shots: number;
  overkill: number;
}

export interface Battle {
  map: GameMap;
  round: number;
  t: number;
  tick: number;
  enemies: Enemy[];
  towers: TowerRuntime[];
  queue: { at: number; unit: UnitType; source: "base" | "send" }[];
  queueIdx: number;
  nextId: number;
  done: boolean;
  livesLost: number;
  bounty: number;
  routeLen: { ground: number; air: number };
  spawned: Partial<Record<UnitType, number>>;
  killed: Partial<Record<UnitType, number>>;
  leaked: Partial<Record<UnitType, number>>;
  leakedLives: { base: number; send: number };
  /** Sum of progress (0..1) at death, per unit, to report how deep kills happened. */
  deathProgress: Partial<Record<UnitType, number>>;
}

export function createBattle(map: GameMap, towers: Tower[], groups: SpawnGroup[], round: number): Battle {
  const queue: Battle["queue"] = [];
  for (const g of groups) for (let i = 0; i < g.count; i++) queue.push({ at: g.start + i * g.gap, unit: g.unit, source: g.source });
  // Stable order: by time, ties broken by original position.
  const indexed = queue.map((q, i) => ({ q, i }));
  indexed.sort((a, b) => a.q.at - b.q.at || a.i - b.i);
  return {
    map, round, t: 0, tick: 0, enemies: [],
    towers: towers.map((tower) => ({ tower, stats: effectiveStats(tower, map, towers), cooldown: 0, dmg: 0, kills: 0, shots: 0, overkill: 0 })),
    queue: indexed.map((x) => x.q), queueIdx: 0, nextId: 1, done: false, livesLost: 0, bounty: 0,
    routeLen: { ground: map.path.length - 1, air: flightLength(map) },
    spawned: {}, killed: {}, leaked: {}, leakedLives: { base: 0, send: 0 }, deathProgress: {},
  };
}

function place(b: Battle, en: Enemy) {
  const path = b.map.path;
  if (UNITS[en.unit].flying) {
    const [sx, sy] = path[0];
    const [ex, ey] = path[path.length - 1];
    const f = Math.min(1, en.dist / b.routeLen.air);
    en.x = sx + (ex - sx) * f;
    en.y = sy + (ey - sy) * f;
  } else {
    const i = Math.min(path.length - 2, Math.floor(en.dist));
    const f = Math.min(1, en.dist - i);
    en.x = path[i][0] + (path[i + 1][0] - path[i][0]) * f;
    en.y = path[i][1] + (path[i + 1][1] - path[i][1]) * f;
  }
}

function progress(b: Battle, en: Enemy): number {
  return en.dist / (UNITS[en.unit].flying ? b.routeLen.air : b.routeLen.ground);
}

function damage(b: Battle, tr: TowerRuntime, en: Enemy, amount: number, type: DamageType, events: BattleEvent[]) {
  if (!en.alive || amount <= 0) return;
  const s = tr.stats;
  let dmg = amount;
  if (en.brittle > 0 && en.slowUntil > b.t) dmg *= 1 + en.brittle;
  if (s.execute && en.hp < en.maxHp / 2) dmg *= s.execute;
  let dealt = 0;
  if (en.shield > 0) {
    const mult = s.shieldMult ?? shieldMultiplier(type);
    const absorbed = Math.min(en.shield, dmg * mult);
    en.shield -= absorbed;
    dealt += absorbed;
    dmg -= absorbed / mult;
    if (dmg <= 0.0001) {
      tr.dmg += dealt;
      return;
    }
  }
  dmg = Math.max(1, dmg - armorAgainst(type, UNITS[en.unit].armor));
  const applied = Math.min(en.hp, dmg);
  tr.overkill += dmg - applied;
  en.hp -= applied;
  tr.dmg += dealt + applied;
  if (en.hp <= 0.0001) {
    en.alive = false;
    tr.kills++;
    b.bounty += UNITS[en.unit].bounty;
    b.killed[en.unit] = (b.killed[en.unit] ?? 0) + 1;
    b.deathProgress[en.unit] = (b.deathProgress[en.unit] ?? 0) + progress(b, en);
    events.push({ e: "die", id: en.id, x: en.x, y: en.y });
  }
}

function pickTarget(b: Battle, tr: TowerRuntime): Enemy | null {
  const { tower, stats } = tr;
  const r2 = stats.range * stats.range;
  const min2 = (stats.minRange ?? 0) * (stats.minRange ?? 0);
  let best: Enemy | null = null;
  let bestScore = 0;
  for (const en of b.enemies) {
    if (!en.alive) continue;
    const flying = UNITS[en.unit].flying;
    if (stats.targets === "ground" && flying) continue;
    if (stats.targets === "air" && !flying) continue;
    const dx = en.x - tower.x;
    const dy = en.y - tower.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 < min2) continue;
    let score: number;
    switch (tower.targeting) {
      case "first": score = progress(b, en); break;
      case "last": score = -progress(b, en); break;
      case "strong": score = en.hp + en.shield; break;
      case "weak": score = -(en.hp + en.shield); break;
      default: score = -d2;
    }
    if (best === null || score > bestScore) {
      best = en;
      bestScore = score;
    }
  }
  return best;
}

/** Advance one tick. Returns what happened, for the replay renderer. */
export function stepBattle(b: Battle): BattleEvent[] {
  const events: BattleEvent[] = [];
  if (b.done) return events;
  const dt = 1 / RULES.tps;
  b.tick++;
  b.t = b.tick * dt;
  const scale = hpScale(b.round);

  while (b.queueIdx < b.queue.length && b.queue[b.queueIdx].at <= b.t) {
    const q = b.queue[b.queueIdx++];
    const def = UNITS[q.unit];
    const en: Enemy = {
      id: b.nextId++, unit: q.unit, source: q.source,
      hp: Math.round(def.hp * scale), maxHp: Math.round(def.hp * scale),
      shield: Math.round(def.shield * scale), maxShield: Math.round(def.shield * scale),
      dist: 0, x: 0, y: 0, slow: 0, slowUntil: 0, brittle: 0, burn: 0, burnUntil: 0, burnBy: -1, alive: true,
    };
    place(b, en);
    b.enemies.push(en);
    b.spawned[q.unit] = (b.spawned[q.unit] ?? 0) + 1;
    events.push({ e: "spawn", id: en.id });
  }

  for (const en of b.enemies) {
    if (!en.alive) continue;
    const def = UNITS[en.unit];
    if (en.burnUntil > b.t && en.burnBy >= 0) {
      damage(b, b.towers[en.burnBy], en, en.burn * dt, "none", events);
      if (!en.alive) continue;
    }
    const slow = en.slowUntil > b.t ? en.slow * (1 - def.slowResist) : 0;
    en.dist += def.speed * (1 - slow) * dt;
    const len = def.flying ? b.routeLen.air : b.routeLen.ground;
    if (en.dist >= len) {
      en.alive = false;
      b.livesLost += def.lives;
      b.leaked[en.unit] = (b.leaked[en.unit] ?? 0) + 1;
      b.leakedLives[en.source] += def.lives;
      events.push({ e: "leak", id: en.id, lives: def.lives });
      continue;
    }
    place(b, en);
  }

  for (let ti = 0; ti < b.towers.length; ti++) {
    const tr = b.towers[ti];
    const s = tr.stats;
    if (tr.tower.type === "relay") continue;
    tr.cooldown -= dt;
    if (tr.cooldown > 0) continue;

    if (tr.tower.type === "frost") {
      const r2 = s.range * s.range;
      let any = false;
      for (const en of b.enemies) {
        if (!en.alive) continue;
        const dx = en.x - tr.tower.x;
        const dy = en.y - tr.tower.y;
        if (dx * dx + dy * dy > r2) continue;
        any = true;
        if ((s.slow ?? 0) >= en.slow || en.slowUntil <= b.t) en.slow = s.slow ?? 0;
        en.slowUntil = b.t + (s.slowDur ?? 1);
        en.brittle = Math.max(en.brittle, s.brittle ?? 0);
      }
      if (any) {
        tr.cooldown = 1 / s.rate;
        tr.shots++;
        events.push({ e: "pulse", tower: tr.tower.id });
      } else tr.cooldown = 0;
      continue;
    }

    const target = pickTarget(b, tr);
    if (!target) {
      tr.cooldown = 0;
      continue;
    }
    tr.cooldown += 1 / s.rate;
    tr.shots++;
    const hits: number[] = [];
    const tx = target.x;
    const ty = target.y;

    if (s.splash) {
      const r2 = s.splash * s.splash;
      for (const en of b.enemies) {
        if (!en.alive) continue;
        const flying = UNITS[en.unit].flying;
        if ((s.targets === "ground" && flying) || (s.targets === "air" && !flying)) continue;
        const dx = en.x - tx;
        const dy = en.y - ty;
        if (dx * dx + dy * dy > r2) continue;
        hits.push(en.id);
        damage(b, tr, en, s.dmg, s.dmgType, events);
        if (s.burn && en.alive) {
          en.burn = s.burn;
          en.burnUntil = b.t + RULES.burnDuration;
          en.burnBy = ti;
        }
      }
    } else {
      hits.push(target.id);
      damage(b, tr, target, s.dmg, s.dmgType, events);
      let from = target;
      let dmg = s.dmg;
      const jumped = new Set<number>([target.id]);
      for (let j = 0; j < (s.chain ?? 0); j++) {
        dmg *= 1 - RULES.chainFalloff;
        let next: Enemy | null = null;
        let nd = RULES.chainJumpRange * RULES.chainJumpRange;
        for (const en of b.enemies) {
          if (!en.alive || jumped.has(en.id)) continue;
          const dx = en.x - from.x;
          const dy = en.y - from.y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= nd) {
            nd = d2;
            next = en;
          }
        }
        if (!next) break;
        jumped.add(next.id);
        hits.push(next.id);
        damage(b, tr, next, dmg, s.dmgType, events);
        from = next;
      }
    }
    events.push({ e: "shot", tower: tr.tower.id, x: tx, y: ty, hits, splash: s.splash });
  }

  const pending = b.queueIdx < b.queue.length;
  const alive = b.enemies.some((en) => en.alive);
  if (b.tick % 40 === 0) b.enemies = b.enemies.filter((en) => en.alive);
  if (!pending && !alive) b.done = true;
  else if (b.t >= RULES.maxBattleSeconds) {
    // Stalled battle: whatever is still on the field counts as through.
    for (const en of b.enemies) {
      if (!en.alive) continue;
      en.alive = false;
      b.livesLost += UNITS[en.unit].lives;
      b.leaked[en.unit] = (b.leaked[en.unit] ?? 0) + 1;
      b.leakedLives[en.source] += UNITS[en.unit].lives;
    }
    b.done = true;
  }
  return events;
}

export interface BattleResult {
  duration: number;
  livesLost: number;
  leakedLives: { base: number; send: number };
  bounty: number;
  spawned: Partial<Record<UnitType, number>>;
  killed: Partial<Record<UnitType, number>>;
  leaked: Partial<Record<UnitType, number>>;
  /** Average share of the route covered before dying, per unit type. */
  killDepth: Partial<Record<UnitType, number>>;
  towers: { id: number; dmg: number; kills: number; shots: number; overkill: number }[];
}

export function battleResult(b: Battle): BattleResult {
  const killDepth: Partial<Record<UnitType, number>> = {};
  for (const u of Object.keys(b.killed) as UnitType[]) {
    killDepth[u] = Math.round(((b.deathProgress[u] ?? 0) / (b.killed[u] ?? 1)) * 100) / 100;
  }
  return {
    duration: Math.round(b.t * 10) / 10,
    livesLost: b.livesLost,
    leakedLives: b.leakedLives,
    bounty: b.bounty,
    spawned: b.spawned, killed: b.killed, leaked: b.leaked, killDepth,
    towers: b.towers.map((tr) => ({
      id: tr.tower.id, dmg: Math.round(tr.dmg), kills: tr.kills, shots: tr.shots, overkill: Math.round(tr.overkill),
    })),
  };
}

export function runBattle(map: GameMap, towers: Tower[], groups: SpawnGroup[], round: number): BattleResult {
  const b = createBattle(map, towers, groups, round);
  while (!b.done) stepBattle(b);
  return battleResult(b);
}
