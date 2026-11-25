// Builds the miniature for a real map: the terrain slab on its walnut plinth,
// and every sprite the scene needs, lit for one time of day.
import { TOWER_TYPES, UNIT_TYPES, type TowerType, type UnitType } from "../engine/data.ts";
import type { GameMap } from "../engine/map.ts";
import { PROPS, TOWER_ART, UNIT_ART, coreBase, crystal, gateModel, towerModel, type FeatureKind } from "./models.ts";
import { C } from "./palette.ts";
import { Model, hash3, mix, outlined, renderSprite, rotated, shadowSprite, silhouette, type Lighting, type Sprite } from "./voxel.ts";

/** Voxels per map cell, and how deep the slab is cut. */
export const T = 8;
export const DEPTH = 12;
export const HEAD_FRAMES = 16;
/** Height of a high-ground terrace, in voxels. */
export const TERRACE = 3;

const road = (map: GameMap, tx: number, ty: number) => {
  const t = map.tiles[ty]?.[tx];
  return t === "#" || t === "S" || t === "C";
};

/** What grows or sits on each unbuildable cell. Chosen from the cell's position, so a map always looks the same. */
export function featureAt(map: GameMap, tx: number, ty: number): FeatureKind | null {
  if (map.tiles[ty]?.[tx] !== "x") return null;
  const h = hash3(tx * 7 + 3, ty * 13 + 5, map.w);
  return h < 0.36 ? "tree" : h < 0.56 ? "rocks" : h < 0.76 ? "shrub" : h < 0.88 ? "stump" : "pond";
}

/** Height of the walkable surface of a cell, in voxels above the meadow. */
export function cellHeight(map: GameMap, tx: number, ty: number): number {
  return map.tiles[ty]?.[tx] === "^" ? TERRACE : 0;
}

function terrain(map: GameMap, L: Lighting): { slab: Model; mirror: Model } {
  const W = map.w * T, D = map.h * T;
  // `top` is the surface that is drawn; `cast` also counts terraces, which are separate pieces but still throw shadows.
  const top: number[][] = [], col: string[][] = [], glow: boolean[][] = [], cast: number[][] = [];
  for (let x = 0; x < W; x++) {
    top.push([]); col.push([]); glow.push([]); cast.push([]);
    for (let y = 0; y < D; y++) {
      const tx = Math.floor(x / T), ty = Math.floor(y / T), tile = map.tiles[ty][tx], lx = x % T, ly = y % T;
      let h = 0, c: string, gl = false;
      const nearRoad = (d: number) => (lx < d && road(map, tx - 1, ty)) || (lx >= T - d && road(map, tx + 1, ty)) || (ly < d && road(map, tx, ty - 1)) || (ly >= T - d && road(map, tx, ty + 1));
      if (road(map, tx, ty)) {
        h = -1;
        // Limestone slabs, four blocks to a slab, with a kerb where the road meets the moss.
        c = lx % 4 === 0 || ly % 4 === 0 ? C.joint : hash3(Math.floor(x / 4), Math.floor(y / 4), 9) > 0.8 ? mix(C.lime, C.earth, 0.12) : C.lime;
        if ((lx === 0 && !road(map, tx - 1, ty)) || (lx === 7 && !road(map, tx + 1, ty)) || (ly === 0 && !road(map, tx, ty - 1)) || (ly === 7 && !road(map, tx, ty + 1))) c = C.kerb;
      } else if (featureAt(map, tx, ty) === "pond") {
        const rim = lx < 1 || lx > 6 || ly < 1 || ly > 6, shore = lx < 2 || lx > 5 || ly < 2 || ly > 5;
        if (rim) c = C.moss; else if (shore) c = C.kerb; else { h = -1; c = hash3(Math.floor(x / 2), Math.floor(y / 2), 4) > 0.5 ? C.water : C.water2; }
      } else {
        // Moss in three close greens drifting in broad patches, with bare earth worn in along the road.
        const n = hash3(Math.floor(x / 7), Math.floor(y / 7), 2) * 0.6 + hash3(Math.floor(x / 3), Math.floor(y / 3), 3) * 0.4;
        c = n > 0.62 ? C.moss2 : n < 0.36 ? C.moss3 : C.moss;
        if (hash3(x, y, 15) > 0.9975) c = C.honey;
        if (nearRoad(1) && hash3(x, y, 6) > 0.55) c = C.earth;
        else if (hash3(Math.floor(x / 6), Math.floor(y / 6), 11) > 0.94 && hash3(x, y, 12) > 0.35) c = C.earth2;
        if (tile === "^") c = C.concrete;
        if (tile === "*") { const d = (lx - 3.5) ** 2 + (ly - 3.5) ** 2; if (d < 5) { c = C.jade; gl = true; } else if (d < 11) c = C.brass; else if (d < 15) c = C.bronze; }
      }
      top[x].push(h); col[x].push(c); glow[x].push(gl); cast[x].push(tile === "^" ? TERRACE : h);
    }
  }
  const slab = new Model();
  // Topsoil, a band of clay, then stone and slate.
  const strata = (z: number) => (z >= -3 ? (z === -1 ? C.earth : z === -3 ? C.clayBand : C.earth2) : z >= -7 ? (z === -6 ? C.stone2 : C.stone) : z >= -11 ? (z === -10 ? C.slate2 : C.slate) : C.deep);
  for (let x = 0; x < W; x++) for (let y = 0; y < D; y++) {
    const h = top[x][y];
    let c = col[x][y];
    // Terraces and kerbs throw their shadow across the ground, away from the sun.
    let shaded = false;
    for (let k = 1; k <= 4 && !shaded; k++) {
      const bx = Math.round(x - L.sun[0] * k), by = Math.round(y - L.sun[1] * k);
      if (bx >= 0 && bx < W && by >= 0 && by < D && cast[bx][by] >= cast[x][y] + k) shaded = true;
    }
    if (shaded && !glow[x][y]) c = mix(c, L.shadow.colour, L.shadow.alpha * 0.75);
    const edge = x === W - 1 || y === D - 1;
    const floor = edge ? -DEPTH : Math.min(h, 0) - 1;
    for (let z = h; z >= floor; z--) slab.set(x, y, z, z === h ? c : z > 0 ? C.concrete : strata(z), z === h && glow[x][y]);
    // Tufts of light olive standing proud of the moss.
    const tile = map.tiles[Math.floor(y / T)][Math.floor(x / T)];
    if (h === 0 && tile === "." && col[x][y] !== C.earth && col[x][y] !== C.earth2 && hash3(x, y, 8) > 0.9955) slab.set(x, y, 1, hash3(x, y, 14) > 0.5 ? C.olive : C.moss2);
  }
  // Infrastructure on the cut faces: a copper main with brass brackets, and a few brass vents.
  const pipeZ = -5;
  for (let x = 12; x < W - 14; x++) slab.set(x, D, pipeZ, x % 14 === 0 ? C.brass : C.copper);
  for (let z = pipeZ; z >= -DEPTH; z--) slab.set(12, D, z, C.copper).set(W - 15, D, z, C.copper);
  slab.set(Math.floor(W / 2), D, pipeZ + 1, C.brass).set(Math.floor(W / 2), D, pipeZ + 2, C.jade, true);
  for (let y = 10; y < D - 8; y += 18) slab.box(W, y, -4, 1, 3, 2, C.brass2).set(W, y + 1, -3, C.jade, true);
  // The plinth: a walnut foot a little wider than the slab, with a brass band.
  const foot = (m: Model, z0: number, flip: boolean) => {
    for (let x = -2; x < W + 2; x++) for (let y = -2; y < D + 2; y++) {
      if (x < W - 1 && y < D - 1) continue;
      const layers = [C.walnut, C.brass, C.walnut2, C.walnut2];
      layers.forEach((c, i) => m.set(x, y, flip ? z0 + i - 3 : z0 - i, c));
    }
  };
  foot(slab, -DEPTH - 1, false);

  // What a polished table would show: the cut faces again, upside down, beneath the plinth.
  const mirror = new Model();
  const zb = -DEPTH - 4;
  foot(mirror, zb - 1, true);
  for (let x = 0; x < W; x++) for (let y = 0; y < D; y++) {
    if (x !== W - 1 && y !== D - 1) continue;
    for (let z = -DEPTH; z <= 0; z++) mirror.set(x, y, 2 * zb - z - 1, z >= 0 ? col[x][y] : strata(z));
  }
  return { slab, mirror };
}

export interface PieceSprite { ink: Sprite; pick: Sprite }
export interface UnitSprite { ink: Sprite; flash: Sprite }

/** Every sprite the scene draws, for one map and one lighting preset. */
export interface Art {
  lighting: Lighting;
  s: number;
  ground: Sprite;
  reflection: Sprite;
  towers: Record<TowerType, { base: PieceSprite[]; head: PieceSprite[] | null; shadow: Sprite }>;
  units: Record<UnitType, UnitSprite[][]>;
  props: Record<"trunk" | "canopy" | "shrub" | "rocks" | "stump" | "terrace", Sprite>;
  propShadows: Record<"tree" | "shrub" | "rocks" | "stump", Sprite>;
  core: { base: Sprite; shadow: Sprite; gem: Sprite[] };
  coilGem: Sprite[];
  gate: { sprite: Sprite; shadow: Sprite };
}

/**
 * Render everything. `s` is device pixels per voxel. This is the expensive
 * step (a few hundred milliseconds) and runs once per map and lighting change.
 */
export function buildArt(map: GameMap, L: Lighting, s: number): Art {
  const o = Math.max(1, Math.round(s / 5));
  const piece = (m: Model): PieceSprite => { const base = renderSprite(m, s, L); return { ink: outlined(base, C.outline, o), pick: outlined(base, C.jade, o * 2) }; };
  const { slab, mirror } = terrain(map, L);

  // The reflection fades with distance from the plinth.
  const raw = renderSprite(mirror, s, L, { grain: 0.02, bevel: false });
  const rg = raw.cv.getContext("2d")!;
  rg.globalCompositeOperation = "destination-in";
  const fade = rg.createLinearGradient(0, raw.cv.height * 0.45, 0, raw.cv.height);
  fade.addColorStop(0, "rgba(0,0,0,.34)"); fade.addColorStop(0.55, "rgba(0,0,0,.1)"); fade.addColorStop(1, "rgba(0,0,0,0)");
  rg.fillStyle = fade; rg.fillRect(0, 0, raw.cv.width, raw.cv.height);

  const towers = {} as Art["towers"];
  for (const k of TOWER_TYPES) {
    const d = TOWER_ART[k], pv = d.pivot ?? 4;
    towers[k] = {
      base: [1, 2, 3, 4].map((lvl) => piece(d.base(lvl))),
      head: d.head ? Array.from({ length: HEAD_FRAMES }, (_, i) => piece(rotated(d.head!(), (i / HEAD_FRAMES) * Math.PI * 2, pv, pv))) : null,
      shadow: shadowSprite(towerModel(k), s, L),
    };
  }
  const units = {} as Art["units"];
  for (const k of UNIT_TYPES) {
    const d = UNIT_ART[k];
    const faces = (phase: number) => [0, 1, 2, 3].map((q) => { const ink = outlined(renderSprite(rotated(d.model(phase), (q * Math.PI) / 2, d.pivot[0], d.pivot[1]), s, L), C.outline, o); return { ink, flash: silhouette(ink, "#fff6e6") }; });
    units[k] = Array.from({ length: d.frames ?? 1 }, (_, i) => faces(i));
  }
  const scenery = (m: Model) => renderSprite(m, s, L, { grain: 0.07, bevel: false });
  const tree = new Model().add(PROPS.trunk()).add(PROPS.canopy());
  return {
    lighting: L, s,
    ground: renderSprite(slab, s, L, { grain: 0.035, bevel: false }),
    reflection: raw,
    towers, units,
    props: { trunk: scenery(PROPS.trunk()), canopy: scenery(PROPS.canopy()), shrub: scenery(PROPS.shrub()), rocks: scenery(PROPS.rocks()), stump: scenery(PROPS.stump()), terrace: scenery(PROPS.terrace(TERRACE)) },
    propShadows: { tree: shadowSprite(tree, s, L), shrub: shadowSprite(PROPS.shrub(), s, L), rocks: shadowSprite(PROPS.rocks(), s, L), stump: shadowSprite(PROPS.stump(), s, L) },
    core: { base: outlined(renderSprite(coreBase(), s, L), C.outline, o), shadow: shadowSprite(coreBase(), s, L), gem: Array.from({ length: 8 }, (_, i) => outlined(renderSprite(rotated(crystal(C.jade, "#dff5ee"), ((i / 8) * Math.PI) / 2, 2, 2), s, L), C.outline, o)) },
    coilGem: Array.from({ length: 8 }, (_, i) => renderSprite(rotated(crystal(C.amethyst, "#e3d8f7"), ((i / 8) * Math.PI) / 2, 2, 2), s * 0.75, L)),
    gate: { sprite: outlined(renderSprite(gateModel(), s, L), C.outline, o), shadow: shadowSprite(gateModel(), s, L) },
  };
}
