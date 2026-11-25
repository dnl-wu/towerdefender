// All tunable game numbers live here. The rules handbook served to agents is
// generated from this file, so the docs can never drift from the simulation.

export type TowerType = "gatling" | "cannon" | "ballista" | "tesla" | "flak" | "frost" | "beacon" | "laser";
export type UnitType = "kobold" | "hellhound" | "goblin" | "orc" | "imp" | "ogre" | "wyvern" | "minotaur";
export type Targeting = "first" | "last" | "strong" | "weak" | "close";
export type DamageType = "kinetic" | "explosive" | "energy" | "pierce" | "none";
export type Spec = "a" | "b";

export const TOWER_TYPES: TowerType[] = ["gatling", "cannon", "ballista", "tesla", "flak", "frost", "beacon", "laser"];
export const UNIT_TYPES: UnitType[] = ["kobold", "hellhound", "goblin", "orc", "imp", "ogre", "wyvern", "minotaur"];
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
  /** Beacon: damage bonus given to the 8 neighbouring towers. */
  buffDmg?: number;
  /** Beacon: range bonus given to the 8 neighbouring towers. */
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
  /** How it attacks, at a glance: what it fires, what it hits, how far. Shown to agents and spectators. */
  tags: string[];
  role: string;
  targets: "ground" | "air" | "both";
  dmgType: DamageType;
  levels: [TowerStats, TowerStats, TowerStats];
  specs: Record<Spec, TowerStats & { name: string; desc: string }>;
  /** Targeting the tower is built with and can never change. */
  fixedTargeting?: Targeting;
}

export const TOWERS: Record<TowerType, TowerDef> = {
  gatling: {
    name: "Gatling",
    tags: ["Bullets", "Single target", "Short range", "Rapid fire"],
    role: "Spins up a stream of bullets. Cheap and fast-firing at short range; armour blunts every round.",
    targets: "both",
    dmgType: "kinetic",
    levels: [
      { cost: 40, dmg: 6, rate: 3, range: 2.4 },
      { cost: 35, dmg: 10, rate: 3, range: 2.4 },
      { cost: 60, dmg: 15, rate: 3.2, range: 2.7 },
    ],
    specs: {
      a: { name: "Shredder", desc: "Doubles fire rate.", cost: 110, dmg: 15, rate: 6.4, range: 2.7 },
      b: { name: "Marksman", desc: "Long range heavy shots that cope with armour.", cost: 110, dmg: 75, rate: 1.1, range: 4.6 },
    },
  },
  cannon: {
    name: "Cannon",
    tags: ["Cannonballs", "Splash", "Medium range", "Ground only"],
    role: "Lobs cannonballs that burst on the road and hit a whole pack. Ground only, slow to reload, and it can't hit anything right beside it.",
    targets: "ground",
    dmgType: "explosive",
    levels: [
      { cost: 70, dmg: 26, rate: 0.5, range: 3.8, minRange: 1.5, splash: 1.2 },
      { cost: 60, dmg: 45, rate: 0.5, range: 3.8, minRange: 1.5, splash: 1.2 },
      { cost: 100, dmg: 70, rate: 0.55, range: 4.1, minRange: 1.5, splash: 1.4 },
    ],
    specs: {
      a: { name: "Cluster", desc: "Much wider blast.", cost: 170, dmg: 80, rate: 0.55, range: 4.1, minRange: 1.5, splash: 2.1 },
      b: { name: "Napalm", desc: "Hits leave targets burning for 3 seconds.", cost: 170, dmg: 70, rate: 0.55, range: 4.1, minRange: 1.5, splash: 1.4, burn: 28 },
    },
  },
  ballista: {
    name: "Ballista",
    tags: ["Heavy bolts", "Single target", "Long range", "Pierces armour"],
    role: "Fires heavy bolts that pierce armour completely, from very long range. Slow to reload: the answer to ogres and bosses, wasted on swarms.",
    targets: "both",
    dmgType: "pierce",
    levels: [
      { cost: 80, dmg: 70, rate: 0.45, range: 5 },
      { cost: 70, dmg: 125, rate: 0.45, range: 5 },
      { cost: 120, dmg: 200, rate: 0.5, range: 5.4 },
    ],
    specs: {
      a: { name: "Railspike", desc: "Enormous single hits.", cost: 200, dmg: 560, rate: 0.4, range: 5.8 },
      b: { name: "Executioner", desc: "Faster, and deals double damage to targets under half health.", cost: 200, dmg: 210, rate: 0.8, range: 5.4, execute: 2 },
    },
  },
  tesla: {
    name: "Tesla Coil",
    tags: ["Lightning", "Chains between enemies", "Short range", "Breaks shields"],
    role: "Throws lightning that jumps between nearby enemies and does double damage to shields. Short range.",
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
    tags: ["Flak bursts", "Air only", "Medium range"],
    role: "Anti-air guns that burst among flyers. Cannot hit ground units at all.",
    targets: "air",
    dmgType: "explosive",
    levels: [
      { cost: 50, dmg: 22, rate: 1.2, range: 3.6, splash: 0.9 },
      { cost: 45, dmg: 38, rate: 1.2, range: 3.6, splash: 0.9 },
      { cost: 80, dmg: 60, rate: 1.3, range: 4, splash: 1 },
    ],
    specs: {
      a: { name: "Skyburst", desc: "Wide blast for imp clouds.", cost: 130, dmg: 62, rate: 1.3, range: 4, splash: 1.9 },
      b: { name: "Seeker", desc: "Long-range heavy shots for armoured wyverns.", cost: 130, dmg: 190, rate: 1, range: 5.2 },
    },
  },
  frost: {
    name: "Frost Vent",
    tags: ["Frost pulse", "Slows everything", "Short range", "No damage"],
    role: "Pulses once a second, slowing everything in range. No damage of its own; it buys time for other towers.",
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
  beacon: {
    name: "Beacon",
    tags: ["Support", "Boosts neighbours"],
    role: "Does not attack. Boosts the damage of towers in the 8 surrounding cells. Bonuses from several beacons do not stack.",
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
  laser: {
    name: "Laser Sentry",
    tags: ["Laser", "Weakest target", "Medium range", "Counters goblins"],
    role: "A laser that always burns the enemy with the least health left, so it picks goblins out of a crowd and finishes off the wounded. Hits ground and air. Armour blunts it, and its targeting cannot be changed.",
    targets: "both",
    dmgType: "kinetic",
    fixedTargeting: "weak",
    levels: [
      { cost: 45, dmg: 7, rate: 2.5, range: 3.6 },
      { cost: 40, dmg: 11, rate: 2.6, range: 3.6 },
      { cost: 70, dmg: 16, rate: 2.8, range: 4 },
    ],
    specs: {
      a: { name: "Picket", desc: "Fires twice as fast.", cost: 120, dmg: 16, rate: 5.6, range: 4 },
      b: { name: "Longwatch", desc: "A stronger beam with much longer reach.", cost: 120, dmg: 24, rate: 2.8, range: 5.4 },
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
  /** Towers ignore it while any other enemy is in range, unless they target the weakest. */
  sneaky?: boolean;
  /** Thieves: gold taken from the defender's payout for each one that reaches the core. */
  loot?: { base: number; perRound: number };
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

// Dungeon monsters pouring out of the gate. Health here is round one; every round scales it (hpScale).
export const UNITS: Record<UnitType, UnitDef> = {
  kobold: {
    name: "Kobold",
    desc: "Small dog-faced raiders with crude spears. Weak alone, dangerous in packs: punishes a defence with no splash.",
    hp: 29, shield: 0, armor: 0, speed: 1.6, flying: false, lives: 1, bounty: 2, threat: 1, slowResist: 0,
    send: { count: 5, cost: 20, income: 5, unlock: 1 },
  },
  hellhound: {
    name: "Hellhound",
    desc: "A fast, burning hound. Slips past slow-firing towers and short kill zones.",
    hp: 55, shield: 0, armor: 0, speed: 2.8, flying: false, lives: 1, bounty: 3, threat: 2, slowResist: 0,
    send: { count: 3, cost: 25, income: 5, unlock: 1 },
  },
  goblin: {
    name: "Goblin",
    desc: "A sneaky thief with almost no health. Towers ignore it while anything else is in range, unless they target the weakest. It costs no lives, but every goblin that reaches the core steals gold from the defender's payout and hands it to the sender.",
    hp: 12, shield: 0, armor: 0, speed: 3.2, flying: false, lives: 0, bounty: 1, threat: 1, slowResist: 0,
    sneaky: true,
    loot: { base: 6, perRound: 1 },
    send: { count: 6, cost: 30, income: 2, unlock: 2 },
  },
  orc: {
    name: "Orc Shieldbearer",
    desc: "An orc behind a glowing barrier shield that halves non-energy damage until it breaks. Lightning breaks it fastest.",
    hp: 90, shield: 115, armor: 0, speed: 1.3, flying: false, lives: 1, bounty: 7, threat: 5, slowResist: 0,
    send: { count: 2, cost: 40, income: 8, unlock: 2 },
  },
  imp: {
    name: "Imp",
    desc: "A winged demon that flies straight from the gate to the core, ignoring the road.",
    hp: 70, shield: 0, armor: 0, speed: 1.9, flying: true, lives: 1, bounty: 5, threat: 3, slowResist: 0,
    send: { count: 3, cost: 40, income: 7, unlock: 3 },
  },
  ogre: {
    name: "Armoured Ogre",
    desc: "Slow, huge and plated in iron. Armour shrugs off small hits; piercing bolts go straight through.",
    hp: 340, shield: 0, armor: 4, speed: 0.9, flying: false, lives: 2, bounty: 9, threat: 6, slowResist: 0,
    send: { count: 1, cost: 50, income: 8, unlock: 4 },
  },
  wyvern: {
    name: "Wyvern",
    desc: "An armoured dragon on the wing. Needs dedicated anti-air or piercing bolts.",
    hp: 390, shield: 0, armor: 3, speed: 1.1, flying: true, lives: 2, bounty: 12, threat: 8, slowResist: 0,
    send: { count: 1, cost: 90, income: 12, unlock: 7 },
  },
  minotaur: {
    name: "Minotaur",
    desc: "Boss. Huge health, heavy armour, and it ignores half of every slow.",
    hp: 1100, shield: 0, armor: 5, speed: 0.7, flying: false, lives: 6, bounty: 45, threat: 30, slowResist: 0.5,
    send: { count: 1, cost: 250, income: 25, unlock: 9 },
  },
};

export const RULES = {
  startGold: 300,
  startLives: 20,
  baseIncome: 60,
  maxRounds: 24,
  sellRefundPercent: 70,
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
  // Gentle while players find their feet, then steep: a defence that stopped improving falls behind fast.
  let m = 1;
  for (let i = 1; i < round; i++) m *= i < SCALE.kneeRound ? SCALE.early : SCALE.late;
  return Math.round(m * 1000) / 1000;
}

/** Enemy health growth per round, before and after the knee. Tuned with `pnpm solo` and `pnpm balance`. */
export const SCALE = { early: 1.12, late: 1.13, kneeRound: 8 };

/** One Scanner flight: dear early, when there is little to see, and nearly free from round 11. */
export function scannerPrice(round: number): number {
  return Math.max(5, 45 - 4 * (round - 1));
}

/** Gold one thief takes from the defender's payout if it reaches the core. Sent units scale with the round, and so does their haul. */
export function lootFor(unit: UnitType, round: number): number {
  const l = UNITS[unit].loot;
  return l ? l.base + l.perRound * round : 0;
}

/** What selling a tower returns: 70% of everything spent on it, rounded down. */
export function defenceResale(invested: number): number {
  return Math.floor(invested * RULES.sellRefundPercent / 100);
}

/** Most gold a player may spend on sends in one round. */
export function sendCap(round: number): number {
  return 50 + 20 * round;
}

/** Threat budget of the neutral wave both players face in a round. */
export function waveBudget(round: number): number {
  return Math.round(14 + 6 * (round - 1) + 0.3 * (round - 1) * (round - 1));
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
