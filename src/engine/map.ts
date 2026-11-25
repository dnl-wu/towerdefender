import { Rng, hashSeed } from "./rng.ts";

export const MAP_W = 12;
export const MAP_H = 9;

export type Cell = [number, number];
/** "." open ground, "#" path, "S" spawn, "C" core, "x" rubble, "^" high ground, "*" power tile */
export type Tile = "." | "#" | "S" | "C" | "x" | "^" | "*";

export interface GameMap {
  w: number;
  h: number;
  /** Ordered cells from spawn to core. Consecutive cells are always adjacent. */
  path: Cell[];
  /** Rows top to bottom; tiles[y][x]. */
  tiles: Tile[][];
}

export function generateMap(seed: number): GameMap {
  const rng = new Rng(hashSeed("map", seed));
  const w = MAP_W;
  const h = MAP_H;

  // Serpentine walk: run right, then swing vertically, until the right edge.
  let x = 0;
  let y = rng.int(1, h - 2);
  const path: Cell[] = [[x, y]];
  while (x < w - 1) {
    const run = Math.min(rng.int(2, 3), w - 1 - x);
    for (let i = 0; i < run; i++) path.push([++x, y]);
    // Leave room for a final straight into the core.
    if (x >= w - 2) {
      while (x < w - 1) path.push([++x, y]);
      break;
    }
    const options: number[] = [];
    for (let ny = 0; ny < h; ny++) if (Math.abs(ny - y) >= 2) options.push(ny);
    const ny = rng.pick(options);
    const step = ny > y ? 1 : -1;
    while (y !== ny) path.push([x, (y += step)]);
  }

  const tiles: Tile[][] = [];
  for (let ty = 0; ty < h; ty++) tiles.push(new Array<Tile>(w).fill("."));
  for (const [px, py] of path) tiles[py][px] = "#";
  tiles[path[0][1]][path[0][0]] = "S";
  const end = path[path.length - 1];
  tiles[end[1]][end[0]] = "C";

  const open: Cell[] = [];
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) if (tiles[ty][tx] === ".") open.push([tx, ty]);
  const nearPath = (c: Cell, r: number) => path.some(([px, py]) => Math.abs(px - c[0]) <= r && Math.abs(py - c[1]) <= r);
  const take = (pool: Cell[], count: number, tile: Tile) => {
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = rng.int(0, pool.length - 1);
      const [cx, cy] = pool.splice(idx, 1)[0];
      if (tiles[cy][cx] !== ".") {
        i--;
        continue;
      }
      tiles[cy][cx] = tile;
    }
  };
  // Special tiles sit close to the path so they are always a real choice.
  take(open.filter((c) => nearPath(c, 1)), 4, "^");
  take(open.filter((c) => nearPath(c, 2)), 3, "*");
  take(open.filter((c) => nearPath(c, 1)), 7, "x");
  take(open.filter((c) => !nearPath(c, 1)), 5, "x");

  return { w, h, path, tiles };
}

export function isBuildable(map: GameMap, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const t = map.tiles[y][x];
  return t === "." || t === "^" || t === "*";
}

/** Length of the straight flight line from spawn to core. */
export function flightLength(map: GameMap): number {
  const [sx, sy] = map.path[0];
  const [ex, ey] = map.path[map.path.length - 1];
  return Math.sqrt((ex - sx) * (ex - sx) + (ey - sy) * (ey - sy));
}

/** Path cells within `range` of a cell: how much road a tower placed there covers. */
export function pathCoverage(map: GameMap, x: number, y: number, range: number): number {
  let n = 0;
  for (const [px, py] of map.path) {
    const dx = px - x;
    const dy = py - y;
    if (dx * dx + dy * dy <= range * range) n++;
  }
  return n;
}

/** Length of the flight line inside `range` of a cell, in cells. */
export function airCoverage(map: GameMap, x: number, y: number, range: number): number {
  const [sx, sy] = map.path[0];
  const [ex, ey] = map.path[map.path.length - 1];
  const len = flightLength(map);
  const steps = Math.ceil(len * 4);
  let inside = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const dx = sx + (ex - sx) * t - x;
    const dy = sy + (ey - sy) * t - y;
    if (dx * dx + dy * dy <= range * range) inside++;
  }
  return (inside / (steps + 1)) * len;
}

export function renderAscii(map: GameMap, towers: { x: number; y: number; type: string }[] = []): string {
  const glyph: Record<string, string> = { nailgun: "N", mortar: "M", harpoon: "H", coil: "A", flak: "K", frost: "F", relay: "R" };
  const rows = map.tiles.map((r) => r.slice() as string[]);
  for (const t of towers) rows[t.y][t.x] = glyph[t.type] ?? "T";
  const header = "    " + Array.from({ length: map.w }, (_, i) => (i % 10).toString()).join(" ");
  return [header, ...rows.map((r, y) => `y${y.toString().padStart(2, " ")} ${r.join(" ")}`)].join("\n");
}
