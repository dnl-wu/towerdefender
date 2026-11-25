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

// Seconds between spawns within a group. Tight enough that a round plays out in well under half a minute.
const SPAWN_GAP: Record<UnitType, number> = {
  kobold: 0.26, hellhound: 0.45, goblin: 0.4, orc: 0.8, imp: 0.5, ogre: 1.3, wyvern: 1.6, minotaur: 3,
};

interface Recipe {
  from: number;
  main: UnitType;
  side: UnitType;
}

const RECIPES: Record<Exclude<Archetype, "boss">, Recipe> = {
  swarm: { from: 1, main: "kobold", side: "hellhound" },
  rush: { from: 2, main: "hellhound", side: "kobold" },
  shield: { from: 3, main: "orc", side: "kobold" },
  air: { from: 3, main: "imp", side: "hellhound" },
  armor: { from: 4, main: "ogre", side: "kobold" },
  mixed: { from: 5, main: "orc", side: "imp" },
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
    const bossPoints = Math.min(budget * 0.6, bosses * UNITS.minotaur.threat);
    const count = Math.max(1, Math.round(bossPoints / UNITS.minotaur.threat));
    groups.push({ unit: "minotaur", count, start: 2, gap: SPAWN_GAP.minotaur, source: "base" });
    budget = Math.max(6, budget - count * UNITS.minotaur.threat);
    add("kobold", budget * 0.5, 0);
    if (round >= 10) add("wyvern", budget * 0.5, 4);
    else add("hellhound", budget * 0.5, 5);
    return groups;
  }

  const r = RECIPES[arch];
  // Later rounds swap light flyers and armour for their heavy versions.
  const main: UnitType = arch === "air" && round >= 11 ? "wyvern" : r.main;
  const used = add(main, budget * 0.65, 0);
  add(r.side, budget * 0.35, Math.min(used * 0.5, 6));
  if (arch === "mixed" && round >= 8) add("ogre", budget * 0.25, 3);
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
