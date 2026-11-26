// Elo and the tier ladder. Pure functions: also imported by the UI.

export const START_RATING = 1000;
export const PLACEMENT_GAMES = 5;

/** The rank shown beside a handle. People are unranked until their placement games are played; house bots always show their tier. */
export function rankLabel(u: { rating: number; games: number; bot_level: number | null }): string {
  return u.bot_level === null && u.games < PLACEMENT_GAMES ? "Unranked" : rankFor(u.rating).label;
}

export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** New rating after a game. Score is 1 for a win, 0.5 draw, 0 loss. Early games move faster. */
export function nextRating(rating: number, opponent: number, score: number, gamesPlayed: number): number {
  const k = gamesPlayed < 10 ? 40 : 24;
  return Math.round((rating + k * (score - expectedScore(rating, opponent))) * 10) / 10;
}

export interface Tier {
  key: string;
  name: string;
  floor: number;
  /** Voxel palette for emblems and pedestals: [main, shade, glow]. */
  colors: [string, string, string];
}

export const TIERS: Tier[] = [
  { key: "scrap", name: "Scrap", floor: 0, colors: ["#7a6a58", "#4d4238", "#b09a80"] },
  { key: "rust", name: "Rust", floor: 900, colors: ["#b5562b", "#73331a", "#ff8a4c"] },
  { key: "iron", name: "Iron", floor: 1050, colors: ["#8d99a6", "#56606b", "#cfd9e3"] },
  { key: "chrome", name: "Chrome", floor: 1200, colors: ["#d9e4ec", "#8fa3b3", "#ffffff"] },
  { key: "neon", name: "Neon", floor: 1350, colors: ["#3df2c2", "#12806a", "#a8fff0"] },
  { key: "plasma", name: "Plasma", floor: 1500, colors: ["#c44dff", "#6a1a99", "#f0b3ff"] },
  { key: "apex", name: "Apex", floor: 1700, colors: ["#ffd23d", "#b3721a", "#fff3b3"] },
];

export interface Rank {
  tier: Tier;
  /** 3, 2 or 1 within a tier; 0 for Apex, which has no divisions. */
  division: number;
  label: string;
  /** 0..1 progress toward the next division or tier. */
  progress: number;
  next: number | null;
}

export function rankFor(rating: number): Rank {
  let i = 0;
  for (let t = 0; t < TIERS.length; t++) if (rating >= TIERS[t].floor) i = t;
  const tier = TIERS[i];
  const ceiling = TIERS[i + 1]?.floor ?? null;
  if (ceiling === null) return { tier, division: 0, label: tier.name, progress: 1, next: null };
  // Scrap has no real floor; treat it as one tier's width below Rust.
  const floor = i === 0 ? ceiling - 150 : tier.floor;
  const step = (ceiling - floor) / 3;
  const idx = Math.max(0, Math.min(2, Math.floor((rating - floor) / step)));
  const divFloor = floor + idx * step;
  return {
    tier, division: 3 - idx, label: `${tier.name} ${["III", "II", "I"][idx]}`,
    progress: Math.max(0, Math.min(1, (rating - divFloor) / step)), next: Math.round(divFloor + step),
  };
}
