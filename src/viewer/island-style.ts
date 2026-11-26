// How a player's island looks. Purely cosmetic: the map a match is played on,
// and everything that carries meaning on it (the road, high ground, power
// tiles, water), always comes from the match and looks the same for everyone.
// A style only recolours the turf, the cut stone, the plinth and the core's
// crystal. Some choices unlock as a player's peak rating climbs the ladder.
import { TIERS } from "../server/rating.ts";
import { C } from "./palette.ts";
import type { Lighting } from "./voxel.ts";

export interface IslandStyle {
  /** The map seed of the player's home island. Matches always use their own map. */
  shape: number;
  turf: TurfKey;
  stone: StoneKey;
  plinth: PlinthKey;
  crystal: CrystalKey;
  /** Time of day on the home island. Match views keep the viewer's own choice. */
  light: Lighting["key"];
}

interface Choice { name: string; /** Tier key whose floor the player's peak rating must reach. */ unlock?: string; swatch: string }

type Swaps = Partial<Record<keyof typeof C, string>>;

export const TURFS = {
  meadow: { name: "Meadow", swatch: C.moss, swaps: {} },
  autumn: {
    name: "Autumn", swatch: "#a8823f",
    swaps: { moss: "#9a7440", moss2: "#a8823f", moss3: "#8a6236", olive: "#c49a4a", earth: "#7a5a3e", earth2: "#6a4c34", forest: "#9c4a2c", forest2: "#b8642e" },
  },
  heather: {
    name: "Heather", unlock: "iron", swatch: "#7c6680",
    swaps: { moss: "#6f5a72", moss2: "#7c6680", moss3: "#5f4d63", olive: "#a184a6", earth: "#6e5a4a", earth2: "#5f4d40", forest: "#4a3a52", forest2: "#5d4866" },
  },
  frost: {
    name: "Frost", unlock: "neon", swatch: "#dde6ea",
    swaps: { moss: "#cfdadf", moss2: "#dde6ea", moss3: "#bccbd2", olive: "#eef3f5", earth: "#9aa7ad", earth2: "#8a979e", forest: "#3f5a5a", forest2: "#4d6b69" },
  },
} satisfies Record<string, Choice & { swaps: Swaps }>;

export const STONES = {
  slate: { name: "Slate", swatch: C.slate, swaps: {} },
  sandstone: {
    name: "Sandstone", swatch: "#b08a5e",
    swaps: { stone: "#b08a5e", stone2: "#9c774f", slate: "#8c6a48", slate2: "#7b5c3f", deep: "#5e4630", clayBand: "#c0784a" },
  },
  basalt: {
    name: "Basalt", unlock: "chrome", swatch: "#3f3c3a",
    swaps: { stone: "#4a4744", stone2: "#3f3c3a", slate: "#33312f", slate2: "#2b2928", deep: "#1f1d1c", clayBand: "#8a4430" },
  },
  marble: {
    name: "Marble", unlock: "plasma", swatch: "#d9d4ca",
    swaps: { stone: "#d9d4ca", stone2: "#c9c2b5", slate: "#bdb4a6", slate2: "#aaa092", deep: "#8f8678", clayBand: "#b9a27a" },
  },
} satisfies Record<string, Choice & { swaps: Swaps }>;

export const PLINTHS = {
  walnut: { name: "Walnut", swatch: C.walnut, swaps: {} },
  oak: { name: "Oak", swatch: "#9c7a52", swaps: { walnut: "#9c7a52", walnut2: "#7f6242" } },
  ebony: { name: "Ebony", swatch: "#3a2d27", swaps: { walnut: "#3a2d27", walnut2: "#2a201c" } },
} satisfies Record<string, Choice & { swaps: Swaps }>;

export const CRYSTALS = {
  jade: { name: "Jade", swatch: C.jade, colour: C.jade, light: "#dff5ee" },
  amethyst: { name: "Amethyst", swatch: "#9b7fd0", colour: "#9b7fd0", light: "#ebe0fb" },
  ember: { name: "Ember", unlock: "iron", swatch: "#e0704f", colour: "#e0704f", light: "#ffe0cf" },
  sapphire: { name: "Sapphire", unlock: "chrome", swatch: "#4f86d9", colour: "#4f86d9", light: "#dbe8ff" },
  gold: { name: "Gold", unlock: "apex", swatch: "#e8b86d", colour: "#e8b86d", light: "#fff3d1" },
} satisfies Record<string, Choice & { colour: string; light: string }>;

export type TurfKey = keyof typeof TURFS;
export type StoneKey = keyof typeof STONES;
export type PlinthKey = keyof typeof PLINTHS;
export type CrystalKey = keyof typeof CRYSTALS;

export const LIGHTS: Lighting["key"][] = ["morning", "golden", "night"];

/** Every option group, in the order the editor shows them. */
export const OPTION_GROUPS = [
  { key: "turf", label: "Turf", options: TURFS },
  { key: "stone", label: "Stone", options: STONES },
  { key: "plinth", label: "Plinth", options: PLINTHS },
  { key: "crystal", label: "Core crystal", options: CRYSTALS },
] as const;

export const DEFAULT_STYLE: Omit<IslandStyle, "shape"> = { turf: "meadow", stone: "slate", plinth: "walnut", crystal: "jade", light: "golden" };

/** The rating a tier starts at, for an unlock. Undefined means free. */
export function unlockRating(unlock: string | undefined): number | null {
  return unlock ? TIERS.find((t) => t.key === unlock)?.floor ?? null : null;
}

export function tierName(unlock: string): string {
  return TIERS.find((t) => t.key === unlock)?.name ?? unlock;
}

const pick = <T extends Record<string, unknown>>(options: T, value: unknown, fallback: keyof T): keyof T =>
  typeof value === "string" && Object.hasOwn(options, value) ? value : fallback;

/** Read a stored or submitted style, keeping only known values. `fallbackShape` gives an account its first island. */
export function readStyle(raw: unknown, fallbackShape: number): IslandStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const shape = Number(r.shape);
  return {
    shape: Number.isInteger(shape) && shape > 0 && shape < 2 ** 31 ? shape : fallbackShape,
    turf: pick(TURFS, r.turf, DEFAULT_STYLE.turf),
    stone: pick(STONES, r.stone, DEFAULT_STYLE.stone),
    plinth: pick(PLINTHS, r.plinth, DEFAULT_STYLE.plinth),
    crystal: pick(CRYSTALS, r.crystal, DEFAULT_STYLE.crystal),
    light: LIGHTS.includes(r.light as Lighting["key"]) ? (r.light as Lighting["key"]) : DEFAULT_STYLE.light,
  };
}

/** The first choice in a style that a player's peak rating has not unlocked, if any. */
export function lockedChoice(style: IslandStyle, peak: number): { group: string; name: string; tier: string } | null {
  for (const g of OPTION_GROUPS) {
    const choice = (g.options as Record<string, Choice>)[style[g.key]];
    const floor = unlockRating(choice.unlock);
    if (floor !== null && peak < floor) return { group: g.label, name: choice.name, tier: tierName(choice.unlock!) };
  }
  return null;
}

/** Colour replacements for the island's turf, stone and plinth. Road, terraces, water and power tiles are never in here. */
export function styleSwaps(style: IslandStyle | undefined): Map<string, string> {
  const s = style ?? { ...DEFAULT_STYLE, shape: 1 };
  const out = new Map<string, string>();
  for (const swaps of [TURFS[s.turf].swaps, STONES[s.stone].swaps, PLINTHS[s.plinth].swaps] as Swaps[])
    for (const [k, v] of Object.entries(swaps)) out.set(C[k as keyof typeof C], v);
  return out;
}

export function crystalOf(style: IslandStyle | undefined): { colour: string; light: string } {
  return CRYSTALS[style?.crystal ?? DEFAULT_STYLE.crystal];
}

/** Identifies what the art was built from, so the scene redraws only when the look actually changes. */
export function styleKey(style: IslandStyle | undefined): string {
  return style ? `${style.turf}/${style.stone}/${style.plinth}/${style.crystal}` : "default";
}
