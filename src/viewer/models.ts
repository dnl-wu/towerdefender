// The cast: towers, raiders, scenery and wardens, as voxel models.
// Tower and unit keys match the engine's, so every engine entity has a figure.
import type { TowerType, UnitType } from "../engine/data.ts";
import { C } from "./palette.ts";
import { Model, mix } from "./voxel.ts";

export interface TowerArtDef {
  accent: string;
  base: (level: number) => Model;
  /** The part that turns to aim. Drawn `headZ` above the base's origin. */
  head?: () => Model;
  headZ?: number;
  /** Rotation centre of the head, in voxels. */
  pivot?: number;
  /** Radians per second for heads that turn on their own. */
  spin?: number;
  /** Muzzle: distance along the aim, and height above the head's origin. */
  muzzle?: [number, number];
}

/**
 * Every tower stands on the same ceramic pad. Brass studs on its corners count
 * the level; a specialised tower's studs are honey-gold and lit.
 */
function pad(accent: string, level: number): Model {
  const m = new Model().box(0, 0, 0, 8, 8, 1, C.ceramic).box(1, 1, 1, 6, 6, 1, accent).box(2, 2, 1, 4, 4, 1, C.ceramic2);
  const corners: [number, number][] = [[7, 7], [7, 0], [0, 7], [0, 0]];
  const studs = level >= 4 ? 4 : level;
  for (let i = 0; i < studs; i++) m.set(corners[i][0], corners[i][1], 1, level >= 4 ? C.honey : C.brass, level >= 4);
  return m;
}

export const TOWER_ART: Record<TowerType, TowerArtDef> = {
  nailgun: {
    accent: C.rust, headZ: 5, muzzle: [5, 0.5],
    base: (l) => pad(C.rust, l).box(2, 2, 2, 4, 4, 2, C.ceramic).box(3, 3, 4, 2, 2, 1, C.bronze),
    head: () => new Model().box(2, 2, 0, 4, 4, 2, C.ceramic).box(2, 2, 2, 4, 4, 1, C.rust).box(3, 3, 3, 2, 2, 1, C.gun).box(1, 3, 1, 1, 2, 1, C.gun)
      .box(6, 2, 0, 3, 1, 1, C.gun).box(6, 5, 0, 3, 1, 1, C.gun).set(8, 2, 0, C.brass).set(8, 5, 0, C.brass),
  },
  mortar: {
    accent: C.ochre, headZ: 2, muzzle: [3, 6],
    base: (l) => pad(C.ochre, l).box(1, 1, 2, 6, 6, 1, C.ceramic).box(2, 2, 2, 4, 4, 1, null),
    head: () => new Model().box(3, 3, 0, 2, 2, 1, C.bronze).box(3, 3, 1, 2, 2, 2, C.gun).box(4, 3, 3, 2, 2, 2, C.gun).box(5, 3, 5, 2, 2, 1, C.ochre).box(2, 3, 1, 1, 2, 1, C.brass),
  },
  harpoon: {
    accent: C.ink, headZ: 7, muzzle: [8, 1.5],
    base: (l) => pad(C.ink, l).box(2, 2, 2, 1, 1, 3, C.ceramic2).box(5, 2, 2, 1, 1, 3, C.ceramic2).box(2, 5, 2, 1, 1, 3, C.ceramic2).box(5, 5, 2, 1, 1, 3, C.ceramic2).box(3, 3, 2, 2, 2, 4, C.ceramic).box(3, 3, 6, 2, 2, 1, C.brass),
    head: () => new Model().box(1, 3, 0, 6, 2, 2, C.ink).box(7, 3, 0, 1, 2, 2, C.gun).box(0, 3, 0, 1, 2, 2, C.gun).box(3, 3, 2, 2, 2, 1, C.brass).box(8, 3, 1, 4, 1, 1, C.iron).set(12, 3, 1, C.copper),
  },
  coil: {
    accent: C.amethyst,
    base: (l) => pad(C.amethyst, l).box(3, 3, 2, 2, 2, 6, C.gun).box(2, 2, 3, 4, 4, 1, C.copper).box(2, 2, 5, 4, 4, 1, C.copper).box(2, 2, 7, 4, 4, 1, C.copper)
      .box(2, 2, 8, 4, 4, 1, C.ceramic).set(2, 2, 9, C.ceramic).set(5, 2, 9, C.ceramic).set(2, 5, 9, C.ceramic).set(5, 5, 9, C.ceramic),
  },
  flak: {
    accent: C.lichen, headZ: 4, muzzle: [4.5, 5],
    base: (l) => pad(C.lichen, l).box(2, 2, 2, 4, 4, 1, C.ceramic2).box(2, 2, 3, 4, 4, 1, C.lichen),
    head: () => {
      const m = new Model().box(2, 2, 0, 4, 4, 2, C.ceramic).box(3, 2, 2, 2, 4, 1, C.bronze);
      for (const y of [2, 5]) m.set(5, y, 2, C.gun).set(6, y, 3, C.gun).set(7, y, 4, C.gun).set(8, y, 5, C.brass);
      for (const y of [3, 4]) m.set(6, y, 2, C.gun).set(7, y, 3, C.gun).set(8, y, 4, C.brass);
      return m;
    },
  },
  frost: {
    accent: C.frost,
    base: (l) => pad(C.frost, l).box(2, 2, 2, 4, 4, 5, C.ice).box(2, 2, 3, 4, 4, 1, C.iron).box(2, 2, 6, 4, 4, 1, C.iron).box(3, 3, 7, 2, 2, 1, C.ceramic).box(3, 3, 8, 2, 2, 2, "#e4f4f4", true).set(3, 3, 10, C.white, true)
      .box(1, 3, 2, 1, 2, 1, C.gun).box(6, 3, 2, 1, 2, 1, C.gun).box(3, 6, 2, 2, 1, 1, C.gun),
  },
  sentinel: {
    accent: C.sentry, headZ: 9, muzzle: [7, 1.5],
    base: (l) => pad(C.sentry, l).box(3, 3, 2, 2, 2, 7, C.ceramic).box(2, 2, 2, 4, 4, 1, C.ceramic2).box(3, 3, 5, 2, 2, 1, C.sentry).box(2, 3, 8, 4, 2, 1, C.brass).box(3, 2, 8, 2, 4, 1, C.brass),
    head: () => new Model().box(2, 3, 0, 4, 2, 2, C.ceramic).box(3, 3, 2, 2, 2, 1, C.sentry).box(6, 4, 1, 4, 1, 1, C.gun).set(10, 4, 1, C.brass).set(4, 3, 2, C.honey, true).box(1, 3, 0, 1, 2, 1, C.gun),
  },
  relay: {
    accent: C.jade, headZ: 8, pivot: 4.5, spin: 0.7,
    base: (l) => pad(C.jade, l).box(3, 3, 2, 2, 2, 2, C.ceramic).box(4, 4, 4, 1, 1, 7, C.iron).set(4, 4, 11, C.jade, true),
    head: () => new Model().box(5, 4, 1, 1, 1, 1, C.bronze).box(6, 2, 0, 1, 5, 4, C.ceramic).set(6, 2, 3, C.copper).set(6, 6, 3, C.copper).set(6, 2, 0, C.copper).set(6, 6, 0, C.copper).set(5, 4, 2, C.jade, true),
  },
};

/** A small faceted crystal: the core's heart and the Arc Coil's charge. */
export const crystal = (c: string, hi: string) =>
  new Model().box(1, 1, 0, 2, 2, 1, c, true).box(0, 1, 1, 4, 2, 1, c, true).box(1, 0, 1, 2, 4, 1, c, true).box(0, 0, 2, 4, 4, 1, c, true)
    .box(0, 1, 3, 4, 2, 1, c, true).box(1, 0, 3, 2, 4, 1, c, true).box(1, 1, 4, 2, 2, 1, c, true).set(2, 2, 3, hi, true).set(1, 2, 4, hi, true);

/** The whole tower as one model, for portraits and shadows. */
export function towerModel(type: TowerType, level = 1): Model {
  const d = TOWER_ART[type], m = d.base(level);
  if (d.head) m.add(d.head(), 0, 0, d.headZ ?? 0);
  if (type === "coil") m.add(crystal(C.amethyst, "#e3d8f7"), 2, 2, 11);
  return m;
}

export interface UnitArtDef {
  /** Rotation centre: also where the figure stands on its cell. */
  pivot: [number, number];
  /** Footprint radius and height in voxels, for shadows and health bars. */
  half: number;
  tall: number;
  /** One-word class shown beside the unit. */
  kind: string;
  model: (phase?: number) => Model;
  /** Two rotor frames for flyers. */
  frames?: number;
}

// Raiders: dark, warm-eyed machines that read against pale stone.
export const UNIT_ART: Record<UnitType, UnitArtDef> = {
  scuttler: { pivot: [1.5, 1.5], half: 1.5, tall: 3, kind: "Swarm", model: () => new Model().box(0, 0, 1, 3, 3, 2, C.umber).box(0, 0, 0, 1, 1, 1, C.umber2).box(2, 2, 0, 1, 1, 1, C.umber2).box(0, 2, 0, 1, 1, 1, C.umber2).box(2, 0, 0, 1, 1, 1, C.umber2).set(2, 0, 2, C.ember, true).set(2, 2, 2, C.ember, true) },
  runner: { pivot: [2.5, 2], half: 2.5, tall: 5, kind: "Fast", model: () => new Model().box(0, 1, 2, 5, 2, 2, C.clay).box(4, 1, 3, 2, 2, 2, C.clay).set(5, 1, 4, C.ember, true).set(5, 2, 4, C.ember, true).box(0, 1, 0, 1, 1, 2, C.umber2).box(0, 2, 0, 1, 1, 2, C.umber2).box(4, 1, 0, 1, 1, 2, C.umber2).box(4, 2, 0, 1, 1, 2, C.umber2).set(-1, 1, 3, C.umber2) },
  goblin: { pivot: [1.5, 1.5], half: 1.5, tall: 4, kind: "Thief", model: () => new Model().box(0, 1, 0, 1, 1, 1, C.umber2).box(2, 1, 0, 1, 1, 1, C.umber2).box(0, 0, 1, 3, 3, 2, C.goblin).box(1, 0, 3, 2, 3, 1, C.goblin).set(2, 0, 3, C.honey, true).set(2, 2, 3, C.honey, true).set(1, -1, 3, C.goblin).set(1, 3, 3, C.goblin).box(-1, 0, 2, 1, 3, 2, C.brass).set(-1, 1, 4, C.honey, true) },
  shellback: { pivot: [2.5, 2.5], half: 2.5, tall: 5, kind: "Shielded", model: () => new Model().box(0, 0, 1, 5, 5, 2, C.iron).box(1, 1, 3, 3, 3, 2, C.glass, true).box(5, 1, 1, 2, 3, 2, C.umber).set(6, 1, 2, C.ember, true).set(6, 3, 2, C.ember, true).box(0, 0, 0, 1, 1, 1, C.umber2).box(4, 0, 0, 1, 1, 1, C.umber2).box(0, 4, 0, 1, 1, 1, C.umber2).box(4, 4, 0, 1, 1, 1, C.umber2) },
  drone: {
    pivot: [2.5, 2.5], half: 2.5, tall: 4, kind: "Flying", frames: 2,
    model: (phase = 0) => {
      const m = new Model().box(1, 1, 0, 3, 3, 2, C.umber).set(4, 2, 0, C.ember, true);
      for (const [x, y] of [[0, 0], [4, 0], [0, 4], [4, 4]]) {
        m.set(x, y, 2, C.iron);
        if (phase) m.box(x, y - 1, 3, 1, 3, 1, C.gun); else m.box(x - 1, y, 3, 3, 1, 1, C.gun);
      }
      return m;
    },
  },
  hulk: { pivot: [2, 3], half: 3, tall: 9, kind: "Armoured", model: () => new Model().box(0, 0, 0, 2, 2, 2, C.umber2).box(0, 4, 0, 2, 2, 2, C.umber2).box(0, 0, 2, 4, 6, 4, C.iron).box(0, 1, 6, 3, 4, 1, C.umber).box(1, 2, 6, 3, 2, 3, C.umber).set(3, 2, 7, C.ember, true).set(3, 3, 7, C.ember, true).box(0, -2, 2, 3, 2, 4, C.basalt).box(0, 6, 2, 3, 2, 4, C.basalt).box(4, 1, 3, 1, 4, 2, C.brass2) },
  gunship: {
    pivot: [3.5, 3], half: 3.5, tall: 5, kind: "Flying, armoured", frames: 2,
    model: (phase = 0) => {
      const m = new Model().box(1, 1, 0, 5, 4, 2, C.iron).box(2, 2, 2, 3, 2, 1, C.basalt).box(6, 2, 0, 1, 2, 1, C.umber).set(7, 2, 0, C.ember, true).set(7, 3, 0, C.ember, true).box(1, 0, 0, 5, 1, 1, C.brass2).box(1, 5, 0, 5, 1, 1, C.brass2).box(0, 2, 1, 1, 2, 2, C.umber2);
      for (const [x, y] of [[1, 0], [5, 0], [1, 5], [5, 5]]) {
        m.set(x, y, 2, C.gun);
        if (phase) m.box(x, y - 1, 3, 1, 3, 1, C.gun); else m.box(x - 1, y, 3, 3, 1, 1, C.gun);
      }
      return m;
    },
  },
  colossus: { pivot: [2, 4.5], half: 4.5, tall: 18, kind: "Boss", model: () => new Model().box(0, 0, 0, 3, 3, 4, C.umber2).box(0, 6, 0, 3, 3, 4, C.umber2).box(-1, -1, 4, 6, 11, 7, C.basalt).box(0, 0, 11, 4, 9, 1, C.umber2).box(1, 3, 11, 4, 3, 4, C.iron).box(5, 3, 13, 1, 3, 1, C.ember, true).box(0, -4, 5, 4, 3, 7, C.iron).box(0, 10, 5, 4, 3, 7, C.iron).box(5, 1, 6, 1, 7, 2, C.ember, true).box(1, 1, 15, 1, 1, 3, C.ceramic2).box(1, 7, 15, 1, 1, 3, C.ceramic2) },
};

// Scenery. Trees are a trunk plus a canopy drawn separately, so the canopy can sway.
export const PROPS = {
  trunk: () => new Model().box(3, 3, 0, 2, 2, 4, C.trunk).set(2, 3, 0, C.trunk).set(4, 5, 0, C.trunk),
  canopy: () => {
    const m = new Model().box(1, 1, 4, 6, 6, 3, C.forest).box(2, 2, 7, 4, 4, 2, C.forest2);
    for (const [x, y] of [[1, 1], [6, 1], [1, 6], [6, 6]]) m.set(x, y, 4, null).set(x, y, 6, null);
    for (const [x, y] of [[2, 2], [5, 2], [2, 5], [5, 5]]) m.set(x, y, 8, null);
    return m.set(3, 2, 8, C.moss).set(4, 4, 8, C.moss).set(2, 4, 6, C.forest2).set(5, 3, 6, C.forest2).set(1, 3, 5, C.forest2).set(6, 4, 5, C.forest2);
  },
  shrub: () => new Model().box(1, 2, 0, 3, 3, 2, C.forest2).box(4, 4, 0, 3, 2, 1, C.forest).box(2, 3, 2, 1, 1, 1, C.olive).set(5, 4, 1, C.olive).set(5, 2, 0, C.moss3).set(3, 5, 0, C.olive).set(6, 6, 0, C.honey).set(1, 5, 0, C.cream),
  rocks: () => new Model().box(1, 2, 0, 4, 3, 2, C.rock).box(4, 3, 0, 3, 3, 3, C.rock2).box(2, 5, 0, 2, 2, 1, C.rock).set(5, 4, 3, C.moss).set(1, 2, 1, null).set(6, 5, 2, null).set(2, 3, 2, C.moss2).set(4, 3, 3, C.moss2),
  terrace: (h: number) => terraceModel(h),
  stump: () => new Model().box(3, 3, 0, 2, 2, 2, C.trunk).set(2, 3, 0, C.trunk).set(3, 5, 0, C.trunk).set(3, 3, 2, mix(C.trunk, C.cream, 0.4)).set(4, 4, 2, mix(C.trunk, C.cream, 0.4)).set(6, 2, 0, C.ember).set(6, 2, 1, C.cream).set(1, 6, 0, C.olive).set(5, 6, 0, C.olive),
};
/** A high-ground terrace: weathered concrete with a limestone rim. */
export const terraceModel = (h: number) => {
  const m = new Model().box(0, 0, 0, 8, 8, h, C.concrete);
  for (let i = 0; i < 8; i++) m.set(i, 0, h - 1, C.lime).set(i, 7, h - 1, C.lime).set(0, i, h - 1, C.lime).set(7, i, h - 1, C.lime);
  return m.set(7, 2, 0, C.moss3).set(3, 7, 0, C.moss3).set(7, 6, 1, C.concrete2);
};
export type FeatureKind = "tree" | "shrub" | "rocks" | "stump" | "pond";

/** The core: a ceramic cradle with amber lamps. Its crystal and orbiting brass are drawn live. */
export const coreBase = () =>
  new Model().box(0, 0, 0, 8, 8, 1, C.ceramic).box(1, 1, 1, 6, 6, 1, C.brass).box(2, 2, 1, 4, 4, 1, C.ceramic2).box(3, 3, 2, 2, 2, 1, C.gun).box(3, 3, 3, 2, 2, 1, C.jade, true)
    .box(1, 1, 2, 1, 1, 4, C.ceramic).box(6, 1, 2, 1, 1, 4, C.ceramic).box(1, 6, 2, 1, 1, 4, C.ceramic).box(6, 6, 2, 1, 1, 4, C.ceramic)
    .set(1, 1, 6, C.honey, true).set(6, 1, 6, C.honey, true).set(1, 6, 6, C.honey, true).set(6, 6, 6, C.honey, true);

/** The raiders' portal: a dark iron arch around an ember membrane. */
export const gateModel = () =>
  new Model().box(0, 0, 0, 3, 2, 10, C.basalt).box(0, 6, 0, 3, 2, 10, C.basalt).box(0, 0, 10, 3, 8, 2, C.umber).box(1, 2, 0, 1, 4, 10, C.ember, true)
    .box(0, 3, 12, 3, 2, 1, C.umber2).set(1, 3, 13, C.ember, true).set(1, 4, 13, C.ember, true).set(2, 0, 9, C.brass2).set(2, 7, 9, C.brass2);

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Mood = "neutral" | "blink" | "focus" | "joy" | "sad";
const SUITS: [string, string][] = [["#b8683e", "#84472a"], ["#6f8250", "#4c5b37"], ["#4f8a80", "#34615a"], ["#7d6aa6", "#574878"], ["#c9b88f", "#95855f"], ["#a85545", "#77382d"], ["#4d6f8f", "#334c64"]];
const EYES = ["#7DC4B2", "#E8B86D", "#A1C181", "#e79a6a", "#d9a0c8"];

/**
 * A warden: the agent's mechanical companion, generated from the account's seed
 * so it is always the same figure. The mood only changes its eyes and lamp.
 */
export function warden(seed: number, mood: Mood = "neutral"): Model {
  const r = seeded(seed * 7919 + 13), [suit, dark] = SUITS[Math.floor(r() * SUITS.length)], eye = EYES[Math.floor(r() * EYES.length)], m = new Model();
  const lamp = mood === "sad" ? mix(eye, C.gun, 0.6) : eye;
  m.box(1, 1, 0, 2, 2, 2, C.gun).box(1, 5, 0, 2, 2, 2, C.gun);
  m.box(1, 1, 2, 3, 6, 4, suit).box(1, 1, 2, 3, 6, 1, dark).box(4, 3, 3, 1, 2, 2, lamp, mood !== "sad");
  m.box(1, -1, 2, 2, 2, 4, dark).box(1, 7, 2, 2, 2, 4, dark);
  m.box(-1, 2, 2, 2, 4, 4, C.bronze).set(-1, 3, 6, lamp, mood !== "sad");
  m.box(0, 0, 6, 6, 8, 6, C.ceramic);
  // Eyes sit on the face at x = 6, rows z = 9 and 10. Moods relight them rather than redraw the face.
  const eyes: [number, number][] = [];
  const style = Math.floor(r() * 3);
  if (style === 0) { m.box(6, 1, 9, 1, 6, 2, C.gun); for (let y = 2; y <= 5; y++) eyes.push([y, 9], [y, 10]); }
  else if (style === 1) { for (const y of [1, 2, 5, 6]) eyes.push([y, 9], [y, 10]); }
  else { m.box(6, 2, 8, 1, 4, 1, C.gun); for (const y of [3, 4]) eyes.push([y, 9], [y, 10]); }
  for (const [y, z] of eyes) {
    const lit = mood === "blink" ? false : mood === "focus" ? z === 9 : mood === "joy" ? z === 10 : true;
    m.set(6, y, z, lit ? (mood === "joy" ? mix(eye, C.white, 0.35) : lamp) : C.gun, lit && mood !== "sad");
  }
  m.box(6, 3, 6, 2, 2, 2, C.brass).set(8, 3, 6, C.brass2).set(8, 4, 6, C.brass2);
  const hat = Math.floor(r() * 5);
  if (hat === 0) m.box(0, 0, 12, 6, 8, 1, suit).box(1, 1, 13, 4, 6, 1, dark);
  else if (hat === 1) m.box(2, 3, 12, 3, 2, 3, C.copper);
  else if (hat === 2) m.box(2, 0, 12, 1, 1, 3, C.iron).box(2, 7, 12, 1, 1, 3, C.iron).set(2, 0, 15, lamp, mood !== "sad").set(2, 7, 15, lamp, mood !== "sad");
  else if (hat === 3) m.box(-1, -1, 11, 8, 10, 1, dark).box(0, 0, 12, 6, 8, 2, suit);
  else m.box(1, 2, 12, 4, 4, 1, C.iron).box(4, 3, 13, 2, 2, 2, C.honey, mood !== "sad");
  return m;
}
