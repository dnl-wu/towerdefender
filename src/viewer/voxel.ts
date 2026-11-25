// Voxel sprites: models are maps of "x,y,z" -> colour, lit and drawn to
// isometric canvases once, then composited every frame. Browser only.

export type Vec2 = [number, number];

export function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const HEX = new Map<string, [number, number, number]>();
export function hex(c: string): [number, number, number] {
  let v = HEX.get(c);
  if (!v) {
    const n = parseInt(c.slice(1), 16);
    v = [n >> 16, (n >> 8) & 255, n & 255];
    HEX.set(c, v);
  }
  return v;
}
export function mix(a: string, b: string, t: number): string {
  const A = hex(a), B = hex(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
export function rgba(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}
export function blank(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

export class Model {
  v = new Map<string, string>();
  glow = new Set<string>();
  set(x: number, y: number, z: number, c: string | null, glow = false): this {
    const k = x + "," + y + "," + z;
    if (c === null) {
      this.v.delete(k);
      this.glow.delete(k);
      return this;
    }
    this.v.set(k, c);
    if (glow) this.glow.add(k);
    else this.glow.delete(k);
    return this;
  }
  has(x: number, y: number, z: number): boolean {
    return this.v.has(x + "," + y + "," + z);
  }
  box(x: number, y: number, z: number, w: number, d: number, h: number, c: string | null, glow = false): this {
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) for (let k = 0; k < h; k++) this.set(x + i, y + j, z + k, c, glow);
    return this;
  }
  add(other: Model, dx = 0, dy = 0, dz = 0): this {
    other.each((x, y, z, c, glow) => this.set(x + dx, y + dy, z + dz, c, glow));
    return this;
  }
  each(fn: (x: number, y: number, z: number, c: string, glow: boolean) => void): void {
    for (const [k, c] of this.v) {
      const [x, y, z] = k.split(",").map(Number);
      fn(x, y, z, c, this.glow.has(k));
    }
  }
}

/** The model turned about a vertical axis through (cx, cy). Quarter turns are exact; others resample. */
export function rotated(model: Model, angle: number, cx: number, cy: number): Model {
  const out = new Model(), cs = Math.cos(angle), sn = Math.sin(angle);
  let R = 0, z0 = 1e9, z1 = -1e9;
  model.each((x, y, z) => {
    R = Math.max(R, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  });
  for (let z = z0; z <= z1; z++) {
    for (let X = Math.floor(cx - R - 1); X <= Math.ceil(cx + R); X++) {
      for (let Y = Math.floor(cy - R - 1); Y <= Math.ceil(cy + R); Y++) {
        const dx = X + 0.5 - cx, dy = Y + 0.5 - cy;
        const k = Math.floor(dx * cs + dy * sn + cx + 1e-6) + "," + Math.floor(-dx * sn + dy * cs + cy + 1e-6) + "," + z;
        const c = model.v.get(k);
        if (c) out.set(X, Y, z, c, model.glow.has(k));
      }
    }
  }
  return out;
}

/** Screen basis: x runs right-down, y runs left-down, z runs up. */
export function project(x: number, y: number, z: number, s: number): Vec2 {
  return [(x - y) * s, ((x + y) * s) / 2 - z * s];
}

/** How a time of day lights a block. Purely cosmetic. */
export interface Lighting {
  key: "morning" | "golden" | "night";
  name: string;
  /** Sunlit top: colour mixed in, how much, and overall gain. */
  top: { tint: string; mix: number; gain: number };
  /** The lit side face: per-channel gain. */
  side: [number, number, number];
  /** The side turned away from the sun. */
  shade: { tint: string; mix: number; gain: number };
  /** Ground offset of a shadow per voxel of height. */
  sun: Vec2;
  shadow: { colour: string; alpha: number };
  /** Multiplier on emissive light pooled on the ground. */
  glow: number;
  /** Backdrop: centre of the lit table, and the dark it falls away to. */
  backdrop: { pool: string; mid: string; edge: string };
}

export const LIGHTING: Record<Lighting["key"], Lighting> = {
  morning: {
    key: "morning", name: "Morning",
    top: { tint: "#fff3dc", mix: 0.14, gain: 1.04 }, side: [0.95, 0.94, 0.92],
    shade: { tint: "#3c4152", mix: 0.3, gain: 0.88 }, sun: [0.5, -0.25],
    shadow: { colour: "#1c1d24", alpha: 0.34 }, glow: 0.7,
    backdrop: { pool: "#3a372f", mid: "#24231f", edge: "#191815" },
  },
  golden: {
    key: "golden", name: "Golden hour",
    top: { tint: "#ffc98a", mix: 0.24, gain: 1.05 }, side: [1.0, 0.92, 0.8],
    shade: { tint: "#2a2032", mix: 0.42, gain: 0.8 }, sun: [0.95, -0.42],
    shadow: { colour: "#1b1420", alpha: 0.46 }, glow: 1,
    backdrop: { pool: "#3d352a", mid: "#221f1b", edge: "#171512" },
  },
  night: {
    key: "night", name: "Night",
    top: { tint: "#7e93c8", mix: 0.3, gain: 0.6 }, side: [0.5, 0.55, 0.7],
    shade: { tint: "#0d101a", mix: 0.5, gain: 0.52 }, sun: [0.4, -0.55],
    shadow: { colour: "#07080d", alpha: 0.38 }, glow: 1.9,
    backdrop: { pool: "#262830", mid: "#191a1e", edge: "#111114" },
  },
};

/** Colour of one face of a block: 0 top, 1 lit side, 2 shaded side. Glowing blocks ignore the light. */
export function lit(c: string, face: 0 | 1 | 2, glow: boolean, k: number, L: Lighting): string {
  const [r, g, b] = hex(c);
  let R: number, G: number, B: number;
  if (glow) {
    const f = face === 0 ? 1.1 : face === 1 ? 1.02 : 0.93;
    R = r * f; G = g * f; B = b * f;
  } else if (face === 0) {
    const [tr, tg, tb] = hex(L.top.tint);
    R = (r + (tr - r) * L.top.mix) * L.top.gain; G = (g + (tg - g) * L.top.mix) * L.top.gain; B = (b + (tb - b) * L.top.mix) * L.top.gain;
  } else if (face === 1) {
    R = r * L.side[0]; G = g * L.side[1]; B = b * L.side[2];
  } else {
    const [tr, tg, tb] = hex(L.shade.tint);
    R = (r + (tr - r) * L.shade.mix) * L.shade.gain; G = (g + (tg - g) * L.shade.mix) * L.shade.gain; B = (b + (tb - b) * L.shade.mix) * L.shade.gain;
  }
  return `rgb(${Math.min(255, R * k) | 0},${Math.min(255, G * k) | 0},${Math.min(255, B * k) | 0})`;
}

export interface Sprite {
  cv: HTMLCanvasElement;
  /** Pixel position of the model's origin inside the canvas. */
  ox: number;
  oy: number;
  /** Device pixels per voxel. */
  s: number;
}

export function renderSprite(model: Model, s: number, L: Lighting, opts: { grain?: number; bevel?: boolean } = {}): Sprite {
  const grain = opts.grain ?? 0.05, bevel = opts.bevel ?? true;
  const vox: [number, number, number, string, boolean][] = [];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  model.each((x, y, z, c, glow) => {
    vox.push([x, y, z, c, glow]);
    for (const [px, py] of [project(x, y + 1, z, s), project(x + 1, y, z, s), project(x, y, z + 1, s), project(x + 1, y + 1, z, s)]) {
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
  });
  if (!vox.length) return { cv: blank(1, 1), ox: 0, oy: 0, s };
  const cv = blank(maxX - minX + 2, maxY - minY + 2), g = cv.getContext("2d")!;
  const ox = -minX + 1, oy = -minY + 1;
  vox.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]) || a[2] - b[2]);
  const P = (x: number, y: number, z: number): Vec2 => { const [px, py] = project(x, y, z, s); return [px + ox, py + oy]; };
  const poly = (pts: Vec2[], fill: string) => {
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.closePath();
    g.fillStyle = fill; g.fill();
    g.strokeStyle = fill; g.lineWidth = 0.6; g.stroke();
  };
  const line = (a: Vec2, b: Vec2, style: string) => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.strokeStyle = style; g.lineWidth = Math.max(1, s * 0.1); g.stroke(); };
  const H = (x: number, y: number, z: number) => (model.has(x, y, z) ? 1 : 0);
  const edge = L.key === "night" ? 0.4 : 1;
  for (const [x, y, z, c, glow] of vox) {
    const n = glow ? 1 : 1 - grain / 2 + hash3(x, y, z) * grain;
    const top = !H(x, y, z + 1), left = !H(x, y + 1, z), right = !H(x + 1, y, z);
    // Ambient occlusion: surfaces darken where walls meet floors and where blocks crowd each other.
    if (top) poly([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], lit(c, 0, glow, n * (1 - 0.08 * (H(x + 1, y, z + 1) + H(x - 1, y, z + 1) + H(x, y + 1, z + 1) + H(x, y - 1, z + 1))), L));
    if (left) poly([P(x, y + 1, z + 1), P(x + 1, y + 1, z + 1), P(x + 1, y + 1, z), P(x, y + 1, z)], lit(c, 1, glow, n * (1 - 0.11 * H(x, y + 1, z - 1) - 0.05 * Math.min(1, H(x - 1, y + 1, z) + H(x + 1, y + 1, z))), L));
    if (right) poly([P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x + 1, y + 1, z), P(x + 1, y, z)], lit(c, 2, glow, n * (1 - 0.11 * H(x + 1, y, z - 1) - 0.05 * Math.min(1, H(x + 1, y - 1, z) + H(x + 1, y + 1, z))), L));
    // A fine warm highlight where the lit top turns over an edge.
    if (bevel && top && left) line(P(x, y + 1, z + 1), P(x + 1, y + 1, z + 1), `rgba(255,236,200,${0.3 * edge})`);
    if (bevel && top && right) line(P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), `rgba(255,236,200,${0.1 * edge})`);
  }
  return { cv, ox, oy, s };
}

/** A flat-colour copy of a sprite's shape. */
export function silhouette(sp: Sprite, colour: string): Sprite {
  const cv = blank(sp.cv.width, sp.cv.height), k = cv.getContext("2d")!;
  k.drawImage(sp.cv, 0, 0);
  k.globalCompositeOperation = "source-in";
  k.fillStyle = colour;
  k.fillRect(0, 0, cv.width, cv.height);
  return { ...sp, cv };
}

/** The sprite with a crisp outline. Every playing piece gets one; scenery never does. */
export function outlined(sp: Sprite, colour: string, px: number): Sprite {
  const o = Math.max(1, Math.round(px)), sil = silhouette(sp, colour).cv;
  const cv = blank(sp.cv.width + o * 2, sp.cv.height + o * 2), k = cv.getContext("2d")!;
  for (let dx = -o; dx <= o; dx += o) for (let dy = -o; dy <= o; dy += o) if (dx || dy) k.drawImage(sil, o + dx, o + dy);
  k.drawImage(sp.cv, o, o);
  return { cv, ox: sp.ox + o, oy: sp.oy + o, s: sp.s };
}

/** The model's shadow as it falls on flat ground: a soft silhouette stretched away from the sun. */
export function shadowSprite(model: Model, s: number, L: Lighting): Sprite {
  const cells = new Set<string>();
  model.each((x, y, z) => {
    for (const h of [z, z + 1]) cells.add(Math.floor(x + L.sun[0] * h) + "," + Math.floor(y + L.sun[1] * h));
  });
  const pts = [...cells].map((k) => k.split(",").map(Number));
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [x, y] of pts) for (const [px, py] of [project(x, y + 1, 0, s), project(x + 1, y, 0, s), project(x, y, 0, s), project(x + 1, y + 1, 0, s)]) {
    minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  if (!pts.length) return { cv: blank(1, 1), ox: 0, oy: 0, s };
  const m = s * 1.6, hard = blank(maxX - minX + m * 2, maxY - minY + m * 2), g = hard.getContext("2d")!, ox = -minX + m, oy = -minY + m;
  g.fillStyle = L.shadow.colour;
  g.strokeStyle = L.shadow.colour;
  for (const [x, y] of pts) {
    g.beginPath();
    ([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]] as Vec2[]).forEach(([a, b], i) => { const [px, py] = project(a, b, 0, s); if (i) g.lineTo(px + ox, py + oy); else g.moveTo(px + ox, py + oy); });
    g.closePath(); g.fill(); g.lineWidth = 1; g.stroke();
  }
  // Soften by shrinking and enlarging: a blur that works in every browser.
  const small = blank(hard.width / 3, hard.height / 3);
  small.getContext("2d")!.drawImage(hard, 0, 0, small.width, small.height);
  const cv = blank(hard.width, hard.height), k = cv.getContext("2d")!;
  k.imageSmoothingQuality = "high";
  k.drawImage(small, 0, 0, cv.width, cv.height);
  return { cv, ox, oy, s };
}
