// All tunable game numbers live here. The rules handbook served to agents is
// generated from this file, so the docs can never drift from the simulation.

export type TowerType = "nailgun" | "mortar" | "harpoon" | "coil" | "flak" | "frost" | "relay";
export type UnitType = "scuttler" | "runner" | "shellback" | "drone" | "hulk" | "gunship" | "colossus";
export type Targeting = "first" | "last" | "strong" | "weak" | "close";
export type DamageType = "kinetic" | "explosive" | "energy" | "pierce" | "none";
export type Spec = "a" | "b";

export const TOWER_TYPES: TowerType[] = ["nailgun", "mortar", "harpoon", "coil", "flak", "frost", "relay"];
export const UNIT_TYPES: UnitType[] = ["scuttler", "runner", "shellback", "drone", "hulk", "gunship", "colossus"];
export const TARGETINGS: Targeting[] = ["first", "last", "strong", "weak", "close"];

export interface TowerStats {
  /** Gold to reach this level (build cost for level 1, upgrade cost otherwise). */
  cost: number;
  dmg: number;
  /** Shots per second. */
  rate: number;
  range: number;
  minRange?: number;
  /** Splash radius in cells. */
  splash?: number;
  /** Number of extra targets the shot jumps to. */
  chain?: number;
  /** Fraction of speed removed, 0..1. */
  slow?: number;
  slowDur?: number;
  /** Relay: damage bonus given to the 8 neighbouring towers. */
  buffDmg?: number;
  /** Relay: range bonus given to the 8 neighbouring towers. */
  buffRange?: number;
  /** Damage per second applied for 3s after a hit. */
  burn?: number;
  /** Extra damage multiplier against targets under half health. */
  execute?: number;
  /** Slowed targets take this much extra damage from every source. */
  brittle?: number;
  /** Multiplier against shields, replacing the damage type default. */
  shieldMult?: number;
}

export interface TowerDef {
  name: string;
  role: string;
  targets: "ground" | "air" | "both";
  dmgType: DamageType;
  levels: [TowerStats, TowerStats, TowerStats];
  specs: Record<Spec, TowerStats & { name: string; desc: string }>;
}

export const TOWERS: Record<TowerType, TowerDef> = {
  nailgun: {
    name: "Nailgun",
    role: "Cheap rapid fire. Strong against unarmoured targets, poor against armour because armour is subtracted from every hit.",
    targets: "both",
    dmgType: "kinetic",
    levels: [
      { cost: 40, dmg: 6, rate: 3, range: 2.6 },
      { cost: 35, dmg: 10, rate: 3, range: 2.6 },
      { cost: 60, dmg: 15, rate: 3.2, range: 2.9 },
    ],
    specs: {
      a: { name: "Shredder", desc: "Doubles fire rate.", cost: 110, dmg: 15, rate: 6.4, range: 2.9 },
      b: { name: "Marksman", desc: "Long range heavy shots that cope with armour.", cost: 110, dmg: 75, rate: 1.1, range: 4.6 },
    },
  },
  mortar: {
    name: "Mortar",
    role: "Splash damage for packs. Ground only, and cannot fire at anything closer than its minimum range.",
    targets: "ground",
    dmgType: "explosive",
    levels: [
      { cost: 70, dmg: 26, rate: 0.5, range: 4.2, minRange: 1.5, splash: 1.2 },
      { cost: 60, dmg: 45, rate: 0.5, range: 4.2, minRange: 1.5, splash: 1.2 },
      { cost: 100, dmg: 70, rate: 0.55, range: 4.5, minRange: 1.5, splash: 1.4 },
    ],
    specs: {
      a: { name: "Cluster", desc: "Much wider blast.", cost: 170, dmg: 80, rate: 0.55, range: 4.5, minRange: 1.5, splash: 2.1 },
      b: { name: "Napalm", desc: "Hits leave targets burning for 3 seconds.", cost: 170, dmg: 70, rate: 0.55, range: 4.5, minRange: 1.5, splash: 1.4, burn: 28 },
    },
  },
  harpoon: {
    name: "Harpoon",
    role: "Slow, heavy single shots that ignore armour entirely. The answer to hulks and bosses; wasted on swarms.",
    targets: "both",
    dmgType: "pierce",
    levels: [
      { cost: 80, dmg: 70, rate: 0.45, range: 3.6 },
      { cost: 70, dmg: 125, rate: 0.45, range: 3.6 },
      { cost: 120, dmg: 200, rate: 0.5, range: 4 },
    ],
    specs: {
      a: { name: "Railspike", desc: "Enormous single hits.", cost: 200, dmg: 560, rate: 0.4, range: 4.4 },
      b: { name: "Executioner", desc: "Faster, and deals double damage to targets under half health.", cost: 200, dmg: 210, rate: 0.8, range: 4, execute: 2 },
    },
  },
  coil: {
    name: "Arc Coil",
    role: "Energy shots that jump between nearby targets and deal double damage to shields. Short range.",
    targets: "both",
    dmgType: "energy",
    levels: [
      { cost: 65, dmg: 11, rate: 1.4, range: 2.3, chain: 2 },
      { cost: 55, dmg: 18, rate: 1.4, range: 2.3, chain: 2 },
      { cost: 90, dmg: 27, rate: 1.5, range: 2.5, chain: 3 },
    ],
    specs: {
      a: { name: "Storm", desc: "Jumps to six extra targets.", cost: 150, dmg: 30, rate: 1.5, range: 2.5, chain: 6 },
      b: { name: "Overload", desc: "One focused arc that triples damage to shields.", cost: 150, dmg: 95, rate: 1.5, range: 2.8, chain: 0, shieldMult: 3 },
    },
  },
  flak: {
    name: "Flak",
    role: "Dedicated anti-air with a small blast. Cannot hit ground units at all.",
    targets: "air",
    dmgType: "explosive",
    levels: [
      { cost: 50, dmg: 22, rate: 1.2, range: 3.6, splash: 0.9 },
      { cost: 45, dmg: 38, rate: 1.2, range: 3.6, splash: 0.9 },
      { cost: 80, dmg: 60, rate: 1.3, range: 4, splash: 1 },
    ],
    specs: {
      a: { name: "Skyburst", desc: "Wide blast for drone clouds.", cost: 130, dmg: 62, rate: 1.3, range: 4, splash: 1.9 },
      b: { name: "Seeker", desc: "Long range armour-piercing shots for gunships.", cost: 130, dmg: 190, rate: 1, range: 5.2 },
    },
  },
  frost: {
    name: "Frost Vent",
    role: "Pulses once a second, slowing everything in range. Almost no damage; it buys time for other towers.",
    targets: "both",
    dmgType: "none",
    levels: [
      { cost: 60, dmg: 0, rate: 1, range: 2.2, slow: 0.3, slowDur: 1.5 },
      { cost: 50, dmg: 0, rate: 1, range: 2.2, slow: 0.4, slowDur: 1.5 },
      { cost: 80, dmg: 0, rate: 1, range: 2.5, slow: 0.5, slowDur: 1.5 },
    ],
    specs: {
      a: { name: "Whiteout", desc: "Much larger area and a stronger slow.", cost: 140, dmg: 0, rate: 1, range: 3.5, slow: 0.55, slowDur: 1.5 },
      b: { name: "Brittle", desc: "Slowed targets take 30% more damage from every tower.", cost: 140, dmg: 0, rate: 1, range: 2.5, slow: 0.5, slowDur: 1.5, brittle: 0.3 },
    },
  },
  relay: {
    name: "Relay",
    role: "Does not attack. Boosts the damage of towers in the 8 surrounding cells. Bonuses from several relays do not stack.",
    targets: "both",
    dmgType: "none",
    levels: [
      { cost: 70, dmg: 0, rate: 0, range: 0, buffDmg: 0.15 },
      { cost: 60, dmg: 0, rate: 0, range: 0, buffDmg: 0.25 },
      { cost: 100, dmg: 0, rate: 0, range: 0, buffDmg: 0.25, buffRange: 0.15 },
    ],
    specs: {
      a: { name: "Overclock", desc: "Damage bonus rises to 45%.", cost: 150, dmg: 0, rate: 0, range: 0, buffDmg: 0.45, buffRange: 0.15 },
      b: { name: "Uplink", desc: "Range bonus rises to 35%.", cost: 150, dmg: 0, rate: 0, range: 0, buffDmg: 0.25, buffRange: 0.35 },
    },
  },
};

export interface UnitDef {
  name: string;
  desc: string;
  hp: number;
  shield: number;
  armor: number;
  /** Cells per second. */
  speed: number;
  flying: boolean;
  /** Lives removed if it reaches the core. */
  lives: number;
  /** Gold paid to the defender on kill. */
  bounty: number;
  /** Weight used when composing base waves. */
  threat: number;
  /** Fraction of slow effects ignored. */
  slowResist: number;
  send: {
    /** Units delivered per order. */
    count: number;
    cost: number;
    /** Permanent income gained by the sender per order. */
    income: number;
    /** First round the order can be bought. */
    unlock: number;
  };
}

export const UNITS: Record<UnitType, UnitDef> = {
  scuttler: {
    name: "Scuttler",
    desc: "Weak and numerous. Punishes a defence with no splash.",
    hp: 22, shield: 0, armor: 0, speed: 1.6, flying: false, lives: 1, bounty: 1, threat: 1, slowResist: 0,
    send: { count: 5, cost: 20, income: 5, unlock: 1 },
  },
  runner: {
    name: "Runner",
    desc: "Fast. Slips past slow-firing towers and short kill zones.",
    hp: 42, shield: 0, armor: 0, speed: 2.8, flying: false, lives: 1, bounty: 2, threat: 2, slowResist: 0,
    send: { count: 3, cost: 25, income: 5, unlock: 1 },
  },
  shellback: {
    name: "Shellback",
    desc: "Carries a shield that halves non-energy damage until it is broken.",
    hp: 70, shield: 90, armor: 0, speed: 1.3, flying: false, lives: 1, bounty: 5, threat: 5, slowResist: 0,
    send: { count: 2, cost: 40, income: 8, unlock: 2 },
  },
  drone: {
    name: "Drone",
    desc: "Flies in a straight line from spawn to core, ignoring the path.",
    hp: 55, shield: 0, armor: 0, speed: 1.9, flying: true, lives: 1, bounty: 3, threat: 3, slowResist: 0,
    send: { count: 3, cost: 40, income: 7, unlock: 3 },
  },
  hulk: {
    name: "Hulk",
    desc: "Slow and heavily armoured. Shrugs off small hits.",
    hp: 260, shield: 0, armor: 4, speed: 0.9, flying: false, lives: 2, bounty: 6, threat: 6, slowResist: 0,
    send: { count: 1, cost: 50, income: 8, unlock: 4 },
  },
  gunship: {
    name: "Gunship",
    desc: "Armoured flyer. Needs dedicated anti-air or piercing damage.",
    hp: 300, shield: 0, armor: 3, speed: 1.1, flying: true, lives: 2, bounty: 8, threat: 8, slowResist: 0,
    send: { count: 1, cost: 90, income: 12, unlock: 7 },
  },
  colossus: {
    name: "Colossus",
    desc: "Boss. Huge health, heavy armour, and it ignores half of every slow.",
    hp: 850, shield: 0, armor: 5, speed: 0.7, flying: false, lives: 6, bounty: 30, threat: 30, slowResist: 0.5,
    send: { count: 1, cost: 250, income: 25, unlock: 9 },
  },
};

export const RULES = {
  startGold: 200,
  startLives: 20,
  baseIncome: 40,
  maxRounds: 24,
  sellRefund: 0.7,
  highGroundRange: 0.75,
  powerTileDmg: 0.25,
  /** Chained arcs lose this fraction of damage on every jump. */
  chainFalloff: 0.3,
  chainJumpRange: 1.6,
  burnDuration: 3,
  /** Ticks per simulated second. */
  tps: 20,
  /** A battle is cut off here; anything still alive counts as leaked. */
  maxBattleSeconds: 240,
} as const;

/** Enemy health and shield multiplier for a round. Sent units scale the same way. */
export function hpScale(round: number): number {
  let m = 1;
  for (let i = 1; i < round; i++) m *= 1.09;
  return Math.round(m * 1000) / 1000;
}

/** Most gold a player may spend on sends in one round. */
export function sendCap(round: number): number {
  return 40 + 20 * round;
}

/** Threat budget of the neutral wave both players face in a round. */
export function waveBudget(round: number): number {
  return Math.round(10 + 4 * (round - 1) + 0.2 * (round - 1) * (round - 1));
}

/** Multiplier applied to a hit against a shield. */
export function shieldMultiplier(type: DamageType): number {
  return type === "energy" ? 2 : 0.5;
}

/** Armour subtracted from a hit of the given type. */
export function armorAgainst(type: DamageType, armor: number): number {
  if (type === "pierce" || type === "none") return 0;
  if (type === "explosive") return armor / 2;
  return armor;
}
