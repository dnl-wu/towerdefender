import { UNITS, waveBudget, type UnitType } from "./data.ts";
import { Rng, hashSeed } from "./rng.ts";

export interface SpawnGroup {
  unit: UnitType;
  count: number;
  /** Seconds after the battle starts. */
  start: number;
  /** Seconds between spawns in the group. */
  gap: number;
  source: "base" | "send";
}

export type Archetype = "swarm" | "rush" | "shield" | "air" | "armor" | "mixed" | "boss";

const SPAWN_GAP: Record<UnitType, number> = {
  scuttler: 0.35, runner: 0.6, shellback: 1.1, drone: 0.7, hulk: 1.8, gunship: 2.2, colossus: 4,
};

interface Recipe {
  from: number;
  main: UnitType;
  side: UnitType;
}

const RECIPES: Record<Exclude<Archetype, "boss">, Recipe> = {
  swarm: { from: 1, main: "scuttler", side: "runner" },
  rush: { from: 2, main: "runner", side: "scuttler" },
  shield: { from: 3, main: "shellback", side: "scuttler" },
  air: { from: 3, main: "drone", side: "runner" },
  armor: { from: 4, main: "hulk", side: "scuttler" },
  mixed: { from: 5, main: "shellback", side: "drone" },
};

export function waveArchetype(seed: number, round: number): Archetype {
  if (round === 1) return "swarm";
  if (round % 5 === 0) return "boss";
  const rng = new Rng(hashSeed("wave", seed, round));
  const pool = (Object.keys(RECIPES) as Exclude<Archetype, "boss">[]).filter((a) => RECIPES[a].from <= round);
  // Never repeat the previous round's theme, so a defence has to be rounded.
  const prev = round > 1 ? waveArchetype(seed, round - 1) : null;
  const choices = pool.filter((a) => a !== prev);
  return rng.pick(choices.length ? choices : pool);
}

/** The neutral wave both players face in a round. Identical for both lanes. */
export function baseWave(seed: number, round: number): SpawnGroup[] {
  const arch = waveArchetype(seed, round);
  let budget = waveBudget(round);
  const groups: SpawnGroup[] = [];
  const add = (unit: UnitType, points: number, start: number) => {
    const count = Math.max(1, Math.round(points / UNITS[unit].threat));
    groups.push({ unit, count, start, gap: SPAWN_GAP[unit], source: "base" });
    return count * SPAWN_GAP[unit];
  };

  if (arch === "boss") {
    const bosses = 1 + Math.floor(round / 10);
    const bossPoints = Math.min(budget * 0.6, bosses * UNITS.colossus.threat);
    const count = Math.max(1, Math.round(bossPoints / UNITS.colossus.threat));
    groups.push({ unit: "colossus", count, start: 2, gap: SPAWN_GAP.colossus, source: "base" });
    budget = Math.max(6, budget - count * UNITS.colossus.threat);
    add("scuttler", budget * 0.5, 0);
    if (round >= 10) add("gunship", budget * 0.5, 4);
    else add("runner", budget * 0.5, 5);
    return groups;
  }

  const r = RECIPES[arch];
  // Later rounds swap light flyers and armour for their heavy versions.
  const main: UnitType = arch === "air" && round >= 11 ? "gunship" : r.main;
  const used = add(main, budget * 0.65, 0);
  add(r.side, budget * 0.35, Math.min(used * 0.5, 6));
  if (arch === "mixed" && round >= 8) add("hulk", budget * 0.25, 3);
  return groups;
}

export function summarizeWave(groups: SpawnGroup[]): Partial<Record<UnitType, number>> {
  const out: Partial<Record<UnitType, number>> = {};
  for (const g of groups) out[g.unit] = (out[g.unit] ?? 0) + g.count;
  return out;
}

/** Spawn groups for the orders an opponent bought, staggered in purchase order. */
export function sendGroups(orders: { unit: UnitType; orders: number }[]): SpawnGroup[] {
  const groups: SpawnGroup[] = [];
  let start = 1.5;
  for (const o of orders) {
    const count = UNITS[o.unit].send.count * o.orders;
    groups.push({ unit: o.unit, count, start, gap: SPAWN_GAP[o.unit] * 0.8, source: "send" });
    start += 1.2;
  }
  return groups;
}
