// Draws the miniature. Reads towers, enemies and events from Playback; owns
// only presentation state (aim angles, sparks, glows), never game state.
import { effectiveStats, type Enemy, type Tower } from "../engine/battle.ts";
import { UNITS } from "../engine/data.ts";
import { TOWER_ART, UNIT_ART, type FeatureKind } from "./models.ts";
import { C, UI } from "./palette.ts";
import type { Fx, Playback } from "./playback.ts";
import { blank, lit, project, rgba, LIGHTING, type Lighting, type Sprite, type Vec2 } from "./voxel.ts";
import { DEPTH, HEAD_FRAMES, T, buildArt, cellHeight, featureAt, type Art } from "./world.ts";

/** Logical pixels per voxel, and how high flyers travel. */
const S = 5;
const ALT = 22;

export type Hit = { kind: "tower"; id: number } | { kind: "gate" } | { kind: "core" };

interface TowerView { ang: number; aim: number; aimedAt: number; kick: number; glowAt: number }
interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; c: string; life: number; size: number; glow: boolean }
interface Ring { x: number; y: number; z: number; r: number; c: string; life: number; max: number; puff?: boolean }
interface Shot { pts: [number, number, number][]; c: string; life: number; max: number; jagged: boolean; wide: number; core?: string }
/** Something you can watch fly: a Cannon's cannonball on its arc, or a Ballista's bolt. */
interface Missile { kind: "ball" | "bolt"; from: [number, number, number]; to: [number, number, number]; t: number; dur: number; splash: number }

export class Scene {
  readonly width: number;
  readonly height: number;
  selected: number | null = null;
  hover: Hit | null = null;
  reduced = false;
  lighting: Lighting;
  private g: CanvasRenderingContext2D;
  private art!: Art;
  private backdrop!: HTMLCanvasElement;
  private dpr: number;
  private s: number;
  private origin: Vec2;
  private views = new Map<number, TowerView>();
  private bits: Bit[] = [];
  private rings: Ring[] = [];
  private shots: Shot[] = [];
  private missiles: Missile[] = [];
  private hp = new Map<number, number>();
  private flash = new Map<number, number>();
  private facing = new Map<number, number>();
  private coreFlash = 0;
  private coreJoy = 0;
  private sweep = -1;
  private features: { tx: number; ty: number; kind: FeatureKind }[] = [];
  private motes: { x: number; y: number; z: number; d: number }[];
  private artFor: unknown = null;

  constructor(private canvas: HTMLCanvasElement, private pb: Playback, lighting: Lighting["key"] = "golden") {
    const map = pb.map;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.s = S * this.dpr;
    this.width = (map.w * T + map.h * T) * S + 80;
    this.height = 104 + ((map.w * T + map.h * T) * S) / 2 + (DEPTH + 4) * S + 60;
    canvas.width = this.width * this.dpr;
    canvas.height = this.height * this.dpr;
    this.g = canvas.getContext("2d")!;
    this.origin = [(map.h * T * S + 40) * this.dpr, 104 * this.dpr];
    this.lighting = LIGHTING[lighting];
    this.motes = Array.from({ length: 14 }, (_, i) => ({ x: ((i * 37) % (map.w * T - 8)) + 4, y: ((i * 53) % (map.h * T - 8)) + 4, z: 5 + ((i * 7) % 12), d: i * 1.7 }));
    this.rebuild();
  }

  /** Change the time of day. Re-renders every sprite, so it takes a moment. */
  setLighting(key: Lighting["key"]): void {
    this.lighting = LIGHTING[key];
    this.rebuild();
  }

  private rebuild(): void {
    const map = this.pb.map, L = this.lighting;
    this.art = buildArt(map, L, this.s);
    this.artFor = map;
    this.features = [];
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) { const kind = featureAt(map, tx, ty); if (kind) this.features.push({ tx, ty, kind }); }
    // Backdrop: a warm pool of light on a dark table, falling away to near-black at the edges.
    const cv = blank(this.canvas.width, this.canvas.height), k = cv.getContext("2d")!, w = cv.width, h = cv.height;
    k.fillStyle = L.backdrop.edge; k.fillRect(0, 0, w, h);
    const [cx, cy] = this.at((map.w * T) / 2, (map.h * T) / 2, -DEPTH - 4);
    k.save(); k.translate(cx, cy); k.scale(1, 0.62);
    const gr = k.createRadialGradient(0, 0, 0, 0, 0, w * 0.62);
    gr.addColorStop(0, L.backdrop.pool); gr.addColorStop(0.45, L.backdrop.mid); gr.addColorStop(1, L.backdrop.edge);
    k.fillStyle = gr; k.beginPath(); k.arc(0, 0, w, 0, 7); k.fill(); k.restore();
    this.backdrop = cv;
  }

  // ---- geometry ----
  private at(x: number, y: number, z: number): Vec2 { const [px, py] = project(x, y, z, this.s); return [this.origin[0] + px, this.origin[1] + py]; }
  private mid(tx: number, ty: number): Vec2 { return [tx * T + T / 2, ty * T + T / 2]; }
  private towerZ(t: Tower): number { return cellHeight(this.pb.map, t.x, t.y) + 1; }
  private sprite(sp: Sprite, wx: number, wy: number, wz: number): void { const [px, py] = project(wx, wy, wz, sp.s); this.g.drawImage(sp.cv, Math.round(this.origin[0] + px - sp.ox), Math.round(this.origin[1] + py - sp.oy)); }
  /** Paint the watched player's handle directly onto the right-hand stone face. */
  private drawPlayerTag(): void {
    const g = this.g, { map, feed, side } = this.pb;
    const depth = map.h * T;
    const [x, y] = this.at(map.w * T, depth / 2, -8);
    g.save();
    g.transform(this.s, -0.5 * this.s, 0, this.s, x, y);
    g.font = "600 4.6px ui-monospace, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = C.ceramic;
    g.fillText(`@${feed.players[side].handle}`, 0, 0, depth - 12);
    g.restore();
  }
  private ellipse(wx: number, wy: number, wz: number, r: number, inner = 0): void {
    const [cx, cy] = this.at(wx, wy, wz);
    this.g.beginPath();
    this.g.ellipse(cx, cy, r * this.s * Math.SQRT2, r * this.s * Math.SQRT1_2, 0, 0, Math.PI * 2);
    if (inner > 0) {
      this.g.moveTo(cx + inner * this.s * Math.SQRT2, cy);
      this.g.ellipse(cx, cy, inner * this.s * Math.SQRT2, inner * this.s * Math.SQRT1_2, 0, 0, Math.PI * 2);
    }
  }
  private pool(wx: number, wy: number, wz: number, r: number, colour: string, alpha: number, blend: GlobalCompositeOperation = "source-over"): void {
    const g = this.g, [cx, cy] = this.at(wx, wy, wz), rx = Math.max(0.01, r * this.s * Math.SQRT2);
    g.save(); g.translate(cx, cy); g.scale(1, 0.5); g.globalCompositeOperation = blend;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, rgba(colour, alpha)); gr.addColorStop(0.55, rgba(colour, alpha * 0.5)); gr.addColorStop(1, rgba(colour, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore();
  }
  private tile(tx: number, ty: number, z: number, inset = 0): void {
    const g = this.g, a = this.at(tx * T + inset, ty * T + inset, z), b = this.at((tx + 1) * T - inset, ty * T + inset, z), c = this.at((tx + 1) * T - inset, (ty + 1) * T - inset, z), d = this.at(tx * T + inset, (ty + 1) * T - inset, z);
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.closePath();
  }
  private cube(wx: number, wy: number, wz: number, a: number, c: string, glow: boolean): void {
    const g = this.g, L = this.lighting;
    const f = (pts: Vec2[], face: 0 | 1 | 2) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = lit(c, face, glow, 1, L); g.fill(); };
    f([this.at(wx, wy, wz + a), this.at(wx + a, wy, wz + a), this.at(wx + a, wy + a, wz + a), this.at(wx, wy + a, wz + a)], 0);
    f([this.at(wx, wy + a, wz + a), this.at(wx + a, wy + a, wz + a), this.at(wx + a, wy + a, wz), this.at(wx, wy + a, wz)], 1);
    f([this.at(wx + a, wy, wz + a), this.at(wx + a, wy + a, wz + a), this.at(wx + a, wy + a, wz), this.at(wx + a, wy, wz)], 2);
  }
  /** Clip to the slab's top face, so rings and range discs never spill down the cut. */
  private onSlab(fn: () => void): void {
    const g = this.g, m = this.pb.map;
    g.save(); g.beginPath(); g.moveTo(...this.at(0, 0, 1)); g.lineTo(...this.at(m.w * T, 0, 1)); g.lineTo(...this.at(m.w * T, m.h * T, 1)); g.lineTo(...this.at(0, m.h * T, 1)); g.closePath(); g.clip(); fn(); g.restore();
  }

  private view(t: Tower): TowerView {
    let v = this.views.get(t.id);
    if (!v) { v = { ang: 0.6 + t.id, aim: 0, aimedAt: -99, kick: 0, glowAt: -99 }; this.views.set(t.id, v); }
    return v;
  }
  private burst(wx: number, wy: number, wz: number, colours: string[], n: number, power = 1, glow = false): void {
    if (this.reduced) n = Math.min(n, 2);
    for (let i = 0; i < n; i++) this.bits.push({ x: wx, y: wy, z: wz, vx: (Math.random() - 0.5) * 22 * power, vy: (Math.random() - 0.5) * 22 * power, vz: (10 + Math.random() * 22) * power, c: colours[i % colours.length], life: 0.55 + Math.random() * 0.45, size: 1, glow });
  }

  // ---- events from the simulation ----
  private take(fx: Fx): void {
    const pb = this.pb, clock = pb.clock;
    if (fx.kind === "shot") {
      const t = fx.tower, v = this.view(t), def = TOWER_ART[t.type], [cx, cy] = this.mid(t.x, t.y);
      v.aim = Math.atan2(fx.y - t.y, fx.x - t.x); v.aimedAt = clock; v.kick = 1;
      if (def.head && !def.spin) v.ang += Math.atan2(Math.sin(v.aim - v.ang), Math.cos(v.aim - v.ang)) * 0.7;
      const [len, mz] = def.muzzle ?? [0, 11];
      const from: [number, number, number] = [cx + Math.cos(v.ang) * len, cy + Math.sin(v.ang) * len, this.towerZ(t) + (def.headZ ?? 0) + mz];
      const air = fx.hits[0]?.flying ?? false, tz = air ? ALT + 2 : 2;
      const to: [number, number, number] = [fx.x * T + 4, fx.y * T + 4, tz];
      if (t.type === "cannon") {
        // A cannonball you can follow: it leaves in a puff of smoke and bursts where it lands.
        this.missiles.push({ kind: "ball", from, to: [to[0], to[1], 0], t: 0, dur: 0.55, splash: (effectiveStats(t, pb.map, pb.towers).splash ?? 1.2) * T });
        this.rings.push({ x: from[0], y: from[1], z: from[2], r: 2.5, c: "#d8d0c0", life: 0.35, max: 0.35, puff: true });
      } else if (t.type === "ballista") {
        this.missiles.push({ kind: "bolt", from, to, t: 0, dur: 0.16, splash: 0 });
      } else if (t.type === "laser") {
        // A thin red beam with a hot white core, and a scorch where it lands.
        this.shots.push({ pts: [from, to], c: C.laser, life: 0.14, max: 0.14, jagged: false, wide: 6, core: "#ffe0e4" });
        this.rings.push({ x: to[0], y: to[1], z: tz, r: 2, c: C.laser, life: 0.2, max: 0.2, puff: true });
      } else if (t.type === "tesla") {
        this.shots.push({ pts: [from, ...fx.hits.map((h): [number, number, number] => [h.x * T + 4, h.y * T + 4, h.flying ? ALT + 2 : 2])], c: C.amethyst, life: 0.12, max: 0.12, jagged: true, wide: 5 });
      } else {
        this.shots.push({ pts: [from, to], c: t.type === "flak" ? C.lichen : C.honey, life: 0.08, max: 0.08, jagged: false, wide: t.type === "flak" ? 3 : 2 });
        if (t.type === "flak") this.rings.push({ x: to[0], y: to[1], z: tz, r: 3, c: C.white, life: 0.25, max: 0.25, puff: true });
      }
    } else if (fx.kind === "pulse") {
      const t = fx.tower, [cx, cy] = this.mid(t.x, t.y);
      this.view(t).kick = 1;
      this.rings.push({ x: cx, y: cy, z: this.towerZ(t) - 1, r: effectiveStats(t, pb.map, pb.towers).range * T, c: C.frost, life: 0.6, max: 0.6 });
    } else if (fx.kind === "die") {
      const air = UNITS[fx.unit].flying, z = air ? ALT : 2, big = fx.unit === "ogre" || fx.unit === "minotaur" || fx.unit === "wyvern";
      const [x, y] = [fx.x * T + 4, fx.y * T + 4];
      this.burst(x, y, z, [C.umber, C.iron, C.ember], big ? 20 : 5, big ? 1.3 : 1);
      // The bounty, as a coin.
      this.bits.push({ x, y, z: z + 2, vx: 0, vy: 0, vz: 30, c: C.honey, life: 0.8, size: 1.2, glow: true });
      this.rings.push({ x, y, z: air ? ALT : 0, r: big ? 7 : 3.5, c: C.white, life: 0.3, max: 0.3 });
    } else if (fx.kind === "leak" && fx.loot > 0) {
      // A goblin made it: no damage to the core, but a spray of coins carried off over the edge.
      const [cx, cy] = this.mid(...this.coreCell());
      for (let i = 0; i < (this.reduced ? 2 : 7); i++) this.bits.push({ x: cx, y: cy, z: 6, vx: 14 + Math.random() * 10, vy: (Math.random() - 0.5) * 14, vz: 24 + Math.random() * 16, c: C.honey, life: 0.9, size: 1, glow: true });
    } else if (fx.kind === "leak") {
      this.coreFlash = 1;
      const [cx, cy] = this.mid(...this.coreCell());
      this.burst(cx, cy, 8, [UI.terracotta, C.ceramic, C.umber], 8);
    } else if (fx.kind === "built" || fx.kind === "upgraded") {
      const at = fx.kind === "built" ? pb.reveal.get(fx.id) ?? clock : clock + 0.2;
      const t = pb.towers.find((x) => x.id === fx.id);
      if (t) this.view(t).glowAt = at;
    } else if (fx.kind === "sold") {
      const [cx, cy] = this.mid(fx.x, fx.y);
      this.burst(cx, cy, cellHeight(pb.map, fx.x, fx.y) + 2, [C.ceramic2, C.earth, C.brass], 8, 0.7);
    } else if (fx.kind === "cleared") {
      const [cx, cy] = this.mid(...this.coreCell());
      this.coreJoy = fx.perfect ? 1 : 0.4;
      this.rings.push({ x: cx, y: cy, z: 0, r: fx.perfect ? 34 : 14, c: C.honey, life: 1.2, max: 1.2 });
      if (fx.perfect && !this.reduced) this.sweep = 0;
    }
  }

  private gateCell(): [number, number] { return this.pb.map.path[0] as [number, number]; }
  private coreCell(): [number, number] { const p = this.pb.map.path; return p[p.length - 1] as [number, number]; }

  /** Advance presentation state and draw one frame. */
  frame(dt: number): void {
    const pb = this.pb, g = this.g, L = this.lighting, clock = pb.clock, map = pb.map, dpr = this.dpr, s = this.s;
    if (this.artFor !== map) this.rebuild();
    for (const fx of pb.drain()) this.take(fx);
    this.coreFlash = Math.max(0, this.coreFlash - dt * 2.2);
    this.coreJoy = Math.max(0, this.coreJoy - dt * 0.5);
    if (this.sweep >= 0) { this.sweep += dt * 0.9; if (this.sweep > 1) this.sweep = -1; }
    for (const b of this.bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= 70 * dt; if (b.z < 0) { b.z = 0; b.vz *= -0.35; b.vx *= 0.5; b.vy *= 0.5; } b.life -= dt; }
    this.bits = this.bits.filter((b) => b.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const sh of this.shots) sh.life -= dt;
    this.shots = this.shots.filter((sh) => sh.life > 0);
    for (const m of this.missiles) {
      m.t += dt;
      if (m.t < m.dur) continue;
      const [x, y, z] = m.to;
      if (m.kind === "ball") {
        this.burst(x, y, 1, [C.ochre, C.white, "#3a3532", C.lime], 10, 1);
        this.rings.push({ x, y, z: 0, r: m.splash, c: C.honey, life: 0.4, max: 0.4 });
        this.rings.push({ x, y, z: 2, r: 3.5, c: "#cfc6b6", life: 0.5, max: 0.5, puff: true });
      } else this.burst(x, y, z, [C.iron, C.white], 4, 0.6);
    }
    this.missiles = this.missiles.filter((m) => m.t < m.dur);

    const towers = pb.towers.filter((t) => { const at = pb.reveal.get(t.id); return at === undefined || clock >= at; });
    const live = new Set(pb.towers.map((t) => t.id));
    for (const id of this.views.keys()) if (!live.has(id)) this.views.delete(id);
    for (const t of towers) {
      const v = this.view(t), def = TOWER_ART[t.type];
      v.kick = Math.max(0, v.kick - dt * 7);
      if (def.spin) v.ang += def.spin * dt;
      else if (def.head) {
        // Hold the aim briefly after a shot, then drift in a slow idle sweep.
        if (clock - v.aimedAt < 1.2) v.ang += Math.atan2(Math.sin(v.aim - v.ang), Math.cos(v.aim - v.ang)) * Math.min(1, dt * 14);
        else if (!this.reduced) v.ang += Math.sin(clock * 0.4 + t.id) * 0.22 * dt;
      }
    }
    const breath = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(clock * 1.4);
    const sway = (seed: number) => (this.reduced ? 0 : Math.sin(clock * 0.9 + seed) * 0.22 + Math.sin(clock * 2.3 + seed * 2) * 0.08);
    const [gx, gy] = this.gateCell(), [kx, ky] = this.coreCell(), [ccx, ccy] = this.mid(kx, ky);

    g.drawImage(this.backdrop, 0, 0);
    this.sprite(this.art.reflection, 0, 0, 0);
    // The plinth's contact with the table.
    this.pool((map.w * T) / 2 + 6, (map.h * T) / 2 + 6, -DEPTH - 4, (map.w + map.h) * T * 0.36, L.shadow.colour, 0.7);
    this.sprite(this.art.ground, 0, 0, 0);
    this.drawPlayerTag();

    // Light pooled on the ground by the things that matter: jade from the core and power tiles, amber from its lamps, ember from the portal.
    this.pool(ccx, ccy, 0, 9 + this.coreJoy * 6, C.jade, (0.26 + breath * 0.1 + this.coreJoy * 0.3) * L.glow, "lighter");
    this.pool(ccx, ccy, 0, 13, C.honey, 0.12 * L.glow, "lighter");
    if (this.coreFlash > 0) this.pool(ccx, ccy, 0, 12, UI.terracotta, this.coreFlash * 0.75);
    this.pool(...this.mid(gx, gy), 0, 6, C.ember, (0.14 + breath * 0.06) * L.glow, "lighter");
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) if (map.tiles[ty][tx] === "*") this.pool(...this.mid(tx, ty), 1, 4.6, C.jade, (0.16 + 0.12 * Math.sin(clock * 1.6 + tx)) * L.glow, "lighter");
    if (!this.reduced) for (const f of this.features) if (f.kind === "pond") for (let i = 0; i < 3; i++) { const tw = Math.sin(clock * 1.5 + i * 2.1 + f.tx); if (tw > 0.6) { const [px, py] = this.at(f.tx * T + 2.5 + i * 1.2, f.ty * T + 2.5 + ((i * 5) % 3), 0); g.fillStyle = `rgba(255,246,230,${(tw - 0.6) * 1.8})`; g.fillRect(px, py, 2 * dpr, dpr); } }

    // Reach of the selected or hovered tower: the disc, then the road cells it actually covers.
    const focus = pb.towers.find((t) => t.id === (this.selected ?? (this.hover?.kind === "tower" ? this.hover.id : -1)));
    if (focus) this.onSlab(() => {
      const [cx, cy] = this.mid(focus.x, focus.y), st = effectiveStats(focus, map, pb.towers), strong = focus.id === this.selected;
      if (focus.type === "beacon") {
        for (const o of pb.towers) if (o.type !== "beacon" && Math.abs(o.x - focus.x) <= 1 && Math.abs(o.y - focus.y) <= 1) { this.tile(o.x, o.y, this.towerZ(o), 0); g.fillStyle = rgba(C.jade, 0.3); g.fill(); }
        return;
      }
      const R = st.range * T, minRange = st.minRange ?? 0;
      this.ellipse(cx, cy, 1, R, minRange * T); g.fillStyle = rgba(C.jade, strong ? 0.1 : 0.06); g.fill("evenodd");
      // Road cells in reach, except for towers that only fire at flyers, which never use the road.
      if (st.targets !== "air") for (const [px, py] of map.path) {
        const distance = Math.hypot(px - focus.x, py - focus.y);
        if (distance < minRange || distance > st.range) continue;
        this.tile(px, py, 0, 0.5); g.fillStyle = rgba(C.jade, strong ? 0.26 : 0.15); g.fill();
      }
      if (st.targets !== "ground") { const a = this.at(...this.mid(gx, gy), 1), b = this.at(...this.mid(kx, ky), 1); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.setLineDash([2 * dpr, 6 * dpr]); g.lineWidth = 2 * dpr; g.strokeStyle = rgba(C.jade, strong ? 0.55 : 0.3); g.stroke(); g.setLineDash([]); }
      this.ellipse(cx, cy, 1, R, minRange * T); g.setLineDash([6 * dpr, 5 * dpr]); g.lineDashOffset = this.reduced ? 0 : -clock * 8 * dpr; g.lineWidth = 1.5 * dpr; g.strokeStyle = rgba(C.jade, strong ? 0.9 : 0.5); g.stroke(); g.setLineDash([]);
    });
    if (this.hover && this.hover.kind !== "tower") { const [hx, hy] = this.hover.kind === "gate" ? [gx, gy] : [kx, ky]; this.tile(hx, hy, 0, 0.5); g.fillStyle = rgba(this.hover.kind === "gate" ? UI.terracotta : C.jade, 0.22); g.fill(); }

    // A beacon feeds its neighbours: light travelling along the ground between them.
    for (const t of towers) if (t.type === "beacon") for (const o of towers) if (o.type !== "beacon" && Math.abs(o.x - t.x) <= 1 && Math.abs(o.y - t.y) <= 1) {
      const a = this.at(...this.mid(t.x, t.y), this.towerZ(t)), b = this.at(...this.mid(o.x, o.y), this.towerZ(o));
      g.save(); g.lineCap = "round"; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.strokeStyle = rgba(C.jade, 0.28); g.lineWidth = 2 * dpr; g.stroke();
      g.setLineDash([5 * dpr, 22 * dpr]); g.lineDashOffset = this.reduced ? 0 : -clock * 22 * dpr; g.strokeStyle = "rgba(230,250,244,.9)"; g.stroke(); g.restore();
    }

    // Shadows first, so none ever lands on top of a sprite: sun-cast shapes, then soft contact under each piece.
    g.globalAlpha = L.shadow.alpha;
    for (const f of this.features) if (f.kind !== "pond") this.sprite(this.art.propShadows[f.kind], f.tx * T, f.ty * T, 1);
    this.sprite(this.art.core.shadow, kx * T, ky * T, 0); this.sprite(this.art.gate.shadow, gx * T, gy * T, 0);
    for (const t of towers) this.sprite(this.art.towers[t.type].shadow, t.x * T, t.y * T, this.towerZ(t));
    g.globalAlpha = 1;
    for (const t of towers) this.pool(...this.mid(t.x, t.y), this.towerZ(t), 5.4, L.shadow.colour, 0.42);
    const foes = pb.enemies();
    for (const { e, x, y } of foes) { const u = UNIT_ART[e.unit], air = UNITS[e.unit].flying; this.pool(x * T + 4 + (air ? ALT * L.sun[0] * 0.5 : 0.8), y * T + 4 + (air ? ALT * L.sun[1] * 0.5 : -0.4), 0, u.half * (air ? 1.4 : 1.8), L.shadow.colour, air ? 0.3 : 0.6); }

    const items: { k: number; f: () => void }[] = [];
    for (const f of this.features) {
      const kind = f.kind;
      if (kind === "pond") continue;
      items.push({ k: f.tx + f.ty, f: () => {
        if (kind === "tree") { this.sprite(this.art.props.trunk, f.tx * T, f.ty * T, 1); this.sprite(this.art.props.canopy, f.tx * T + sway(f.tx * 3 + f.ty), f.ty * T, 1); }
        else this.sprite(this.art.props[kind], f.tx * T + (kind === "shrub" ? sway(f.tx + f.ty * 5) * 0.5 : 0), f.ty * T, 1);
      } });
    }
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) if (map.tiles[ty][tx] === "^") items.push({ k: tx + ty - 0.01, f: () => this.sprite(this.art.props.terrace, tx * T, ty * T, 1) });
    items.push({ k: gx + gy - 0.4, f: () => this.sprite(this.art.gate.sprite, gx * T, gy * T, 0) });
    items.push({ k: kx + ky + 0.4, f: () => {
      const lift = 9 + (this.reduced ? 0 : Math.sin(clock * 1.6) * 0.8) + this.coreJoy * 3;
      this.sprite(this.art.core.base, kx * T, ky * T, 0);
      // A ring of brass blocks turning round the crystal.
      const orbit = (front: boolean) => { for (let i = 0; i < 6; i++) { const a = (this.reduced ? 0 : clock * (0.8 + this.coreJoy * 4)) + (i * Math.PI) / 3; if (Math.sin(a) + Math.cos(a) > 0 === front) this.cube(ccx - 0.5 + Math.cos(a) * 4.8, ccy - 0.5 + Math.sin(a) * 4.8, lift + 1.5 + Math.sin(a * 2) * 0.6, 1, C.brass, false); } };
      orbit(false);
      this.sprite(this.art.core.gem[this.reduced ? 0 : Math.floor(clock * 4) % 8], ccx - 2, ccy - 2, lift);
      orbit(true);
    } });
    for (const t of towers) items.push({ k: t.x + t.y, f: () => {
      const art = this.art.towers[t.type], def = TOWER_ART[t.type], v = this.view(t), key = t.id === this.selected ? "pick" : "ink", [cx, cy] = this.mid(t.x, t.y);
      // A newly built tower settles into place; an upgraded one is briefly lit.
      const since = clock - v.glowAt, built = pb.reveal.has(t.id), drop = built && since < 0.45 && !this.reduced ? (1 - since / 0.45) ** 2 * 7 : 0;
      const z = this.towerZ(t) + drop;
      this.sprite(art.base[Math.min(4, t.level) - 1][key], t.x * T, t.y * T, z);
      if (art.head) { const f = (((Math.round((v.ang / (Math.PI * 2)) * HEAD_FRAMES) % HEAD_FRAMES) + HEAD_FRAMES) % HEAD_FRAMES), back = def.spin ? 0 : v.kick * 0.9; this.sprite(art.head[f][key], t.x * T - Math.cos(v.ang) * back, t.y * T - Math.sin(v.ang) * back, z + (def.headZ ?? 0)); }
      if (t.type === "tesla") {
        const lift = z + 10.5 + (this.reduced ? 0 : Math.sin(clock * 2 + t.x) * 0.7);
        this.pool(cx, cy, lift + 1, 3 + v.kick, C.amethyst, (0.3 + v.kick * 0.3) * L.glow, "lighter");
        this.sprite(this.art.coilGem[this.reduced ? 0 : Math.floor(clock * 5) % 8], cx - 1.5, cy - 1.5, lift);
      }
      if (t.type === "beacon" && (this.reduced || Math.sin(clock * 3) > 0)) this.pool(cx, cy, z + 11.5, 1.6, C.jade, 0.7 * L.glow, "lighter");
      if (since >= 0 && since < 1) this.pool(cx, cy, z + 3, 8 * (0.5 + since), C.jade, (1 - since) * 0.75, "lighter");
    } });
    for (const { e, x, y } of foes) {
      const u = UNIT_ART[e.unit], air = UNITS[e.unit].flying, frames = this.art.units[e.unit];
      // Face the way it is travelling.
      const p = pb.prev.get(e.id);
      if (p) { const dx = e.x - p[0], dy = e.y - p[1]; if (Math.abs(dx) + Math.abs(dy) > 1e-4) this.facing.set(e.id, Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3); }
      const total = e.hp + e.shield, was = this.hp.get(e.id);
      if (was !== undefined && total < was) this.flash.set(e.id, 0.09);
      this.hp.set(e.id, total);
      const fl = Math.max(0, (this.flash.get(e.id) ?? 0) - dt); this.flash.set(e.id, fl);
      const sp = frames[frames.length > 1 && !this.reduced ? Math.floor(clock * 6 + e.id) % frames.length : 0][this.facing.get(e.id) ?? 0];
      const heavy = e.unit === "ogre" || e.unit === "minotaur";
      const lift = air ? ALT + (this.reduced ? 0 : Math.sin(clock * 4 + e.id) * 1.2) : this.reduced ? 0 : Math.abs(Math.sin(clock * 9 + e.id * 1.3)) * (heavy ? 0.5 : 1.2);
      items.push({ k: x + y + 0.3, f: () => {
        const wx = x * T + 4 - u.pivot[0], wy = y * T + 4 - u.pivot[1];
        if (air) { const a = this.at(x * T + 4, y * T + 4, 0), b = this.at(x * T + 4, y * T + 4, lift); g.strokeStyle = rgba(L.shadow.colour, 0.35); g.lineWidth = dpr; g.setLineDash([2 * dpr, 3 * dpr]); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); g.setLineDash([]); }
        if (e.slowUntil > (pb.battle?.t ?? 0)) this.pool(x * T + 4, y * T + 4, air ? lift : 0, u.half * 1.6, C.frost, 0.7);
        this.sprite(sp.ink, wx, wy, lift);
        if (fl > 0) { g.globalAlpha = 0.45; this.sprite(sp.flash, wx, wy, lift); g.globalAlpha = 1; }
        const [bx, by] = this.at(x * T + 4, y * T + 4, lift + u.tall + 3);
        const w = (heavy ? 28 : 18) * dpr, h = 3 * dpr;
        if (e.hp < e.maxHp || e.shield < e.maxShield) {
          g.fillStyle = "rgba(27,24,20,.85)"; g.beginPath(); g.roundRect(bx - w / 2 - dpr, by - dpr, w + 2 * dpr, h + 2 * dpr, 2 * dpr); g.fill();
          g.fillStyle = UI.terracotta; g.beginPath(); g.roundRect(bx - w / 2, by, Math.max(h, (w * e.hp) / e.maxHp), h, 1.5 * dpr); g.fill();
          if (e.shield > 0) { g.fillStyle = C.glass; g.fillRect(bx - w / 2, by - 3 * dpr, (w * e.shield) / e.maxShield, 2 * dpr); }
        }
        // Units the opponent sent carry a terracotta pip.
        if (e.source === "send") { g.fillStyle = C.outline; g.beginPath(); g.arc(bx, by - 6 * dpr, 3 * dpr, 0, 7); g.fill(); g.fillStyle = UI.terracotta; g.beginPath(); g.arc(bx, by - 6 * dpr, 2 * dpr, 0, 7); g.fill(); }
        // Anything in the last stretch before the core is flagged.
        const route = pb.battle ? (air ? pb.battle.routeLen.air : pb.battle.routeLen.ground) : 1;
        if (e.dist / route > 0.72) { const yy = by - (e.source === "send" ? 16 : 10) * dpr + (this.reduced ? 0 : Math.sin(clock * 6) * dpr), a = 4 * dpr; g.fillStyle = C.outline; g.beginPath(); g.moveTo(bx - a - dpr, yy - a - dpr); g.lineTo(bx + a + dpr, yy - a - dpr); g.lineTo(bx, yy + 2 * dpr); g.fill(); g.fillStyle = UI.terracotta; g.beginPath(); g.moveTo(bx - a, yy - a); g.lineTo(bx + a, yy - a); g.lineTo(bx, yy); g.fill(); }
      } });
    }
    if (!foes.length && this.hp.size) { this.hp.clear(); this.flash.clear(); this.facing.clear(); }
    items.sort((a, b) => a.k - b.k).forEach((i) => i.f());

    // Combat: tracers, arcs and rings.
    g.lineCap = "round"; g.lineJoin = "round";
    for (const sh of this.shots) {
      const p = sh.life / sh.max, pts = sh.pts.map((q) => this.at(...q));
      const path = () => {
        g.beginPath(); g.moveTo(...pts[0]);
        for (let i = 1; i < pts.length; i++) {
          if (sh.jagged) for (let j = 1; j < 4; j++) g.lineTo(pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * j) / 4 + (Math.random() - 0.5) * 10 * dpr, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * j) / 4 + (Math.random() - 0.5) * 10 * dpr);
          g.lineTo(...pts[i]);
        }
      };
      path(); g.strokeStyle = rgba(sh.c, 0.45 * p); g.lineWidth = sh.wide * dpr; g.stroke();
      g.strokeStyle = sh.core ? rgba(sh.core, 0.95 * p) : `rgba(255,246,230,${0.95 * p})`; g.lineWidth = (sh.wide > 3 ? 2 : 1.2) * dpr; g.stroke();
      g.fillStyle = `rgba(255,246,230,${p})`; g.beginPath(); g.arc(pts[0][0], pts[0][1], 3 * dpr * p + dpr, 0, 7); g.fill();
      const end = pts[pts.length - 1]; g.beginPath(); g.arc(end[0], end[1], 2.5 * dpr, 0, 7); g.fill();
    }
    // Cannonballs: a dark ball on a high arc with its shadow running along the ground. Bolts: a steel dart and its streak.
    for (const m of this.missiles) {
      const p = Math.min(1, m.t / m.dur), x = m.from[0] + (m.to[0] - m.from[0]) * p, y = m.from[1] + (m.to[1] - m.from[1]) * p;
      if (m.kind === "ball") {
        const z = m.from[2] + (m.to[2] - m.from[2]) * p + Math.sin(p * Math.PI) * 18;
        this.pool(x, y, 0, 1.6, this.lighting.shadow.colour, 0.45);
        const [bx, by] = this.at(x, y, z), radius = Math.max(2 * dpr, 1.25 * this.s);
        g.beginPath(); g.arc(bx, by, radius, 0, Math.PI * 2); g.fillStyle = C.umber2; g.fill();
        g.beginPath(); g.arc(bx - radius / 3, by - radius / 3, radius / 3, 0, Math.PI * 2); g.fillStyle = C.lime; g.fill();
      } else {
        const z = m.from[2] + (m.to[2] - m.from[2]) * p, back = Math.max(0, p - 0.35);
        const tail = this.at(m.from[0] + (m.to[0] - m.from[0]) * back, m.from[1] + (m.to[1] - m.from[1]) * back, m.from[2] + (m.to[2] - m.from[2]) * back), head = this.at(x, y, z);
        g.beginPath(); g.moveTo(...tail); g.lineTo(...head); g.strokeStyle = "rgba(255,246,230,.35)"; g.lineWidth = 4 * dpr; g.stroke();
        g.beginPath(); g.moveTo(...tail); g.lineTo(...head); g.strokeStyle = C.iron; g.lineWidth = 2 * dpr; g.stroke();
        g.fillStyle = "#fff6e6"; g.beginPath(); g.arc(head[0], head[1], 1.8 * dpr, 0, 7); g.fill();
      }
    }
    for (const r of this.rings) {
      const p = 1 - r.life / r.max;
      if (r.puff) { this.pool(r.x, r.y, r.z, r.r * (0.5 + p), r.c, 0.6 * (1 - p)); continue; }
      const ring = () => { this.ellipse(r.x, r.y, r.z + 1, r.r * (0.25 + 0.75 * p)); g.strokeStyle = rgba(r.c, 0.8 * (1 - p)); g.lineWidth = (3 - 2 * p) * dpr; g.stroke(); };
      if (r.z < 6) this.onSlab(ring); else ring();
    }
    // A round held without a leak: one pass of warm light across the slab.
    if (this.sweep >= 0) this.onSlab(() => {
      const a = this.at(0, map.h * T, 1), b = this.at(map.w * T, 0, 1), x = a[0] + (b[0] - a[0]) * this.sweep, band = 90 * dpr;
      const gr = g.createLinearGradient(x - band, 0, x + band, 0);
      gr.addColorStop(0, rgba(C.honey, 0)); gr.addColorStop(0.5, rgba(C.honey, 0.22 * Math.sin(this.sweep * Math.PI))); gr.addColorStop(1, rgba(C.honey, 0));
      g.globalCompositeOperation = "lighter"; g.fillStyle = gr; g.fillRect(0, 0, this.canvas.width, this.canvas.height); g.globalCompositeOperation = "source-over";
    });
    for (const b of this.bits) { g.globalAlpha = Math.min(1, b.life * 3); this.cube(b.x, b.y, b.z, b.size, b.c, b.glow); }
    g.globalAlpha = 1;

    // A few motes over the moss: dust in daylight, fireflies after dark.
    if (!this.reduced) for (const m of this.motes) {
      const x = m.x + Math.sin(clock * 0.35 + m.d) * 5, y = m.y + Math.cos(clock * 0.28 + m.d * 1.3) * 5, z = m.z + Math.sin(clock * 0.5 + m.d) * 2, tw = 0.5 + 0.5 * Math.sin(clock * 1.3 + m.d * 3);
      const [px, py] = this.at(x, y, z);
      if (L.key === "night") this.pool(x, y, z, 1.4, C.honey, 0.5 * tw, "lighter");
      g.fillStyle = L.key === "night" ? rgba(C.honey, 0.5 + 0.5 * tw) : `rgba(255,240,210,${0.12 + 0.2 * tw})`;
      g.fillRect(px, py, 1.5 * dpr, 1.5 * dpr);
    }
  }

  // ---- inspection ----
  /** What is under a pointer position, given in client coordinates. */
  hit(clientX: number, clientY: number): Hit | null {
    const r = this.canvas.getBoundingClientRect(), k = this.canvas.width / r.width, X = (clientX - r.left) * k - this.origin[0], Y = (clientY - r.top) * k - this.origin[1], s = this.s, pb = this.pb;
    const cell = (z: number): [number, number] => { const u = X / s, v = ((Y + z * s) * 2) / s; return [Math.floor((u + v) / 2 / T), Math.floor((v - u) / 2 / T)]; };
    // Prefer a tower whose body is under the pointer, then whatever stands on the ground cell.
    for (const z of [13, 9, 5, 1]) { const [tx, ty] = cell(z); const t = pb.towers.find((o) => o.x === tx && o.y === ty && z >= this.towerZ(o) - 1); if (t) return { kind: "tower", id: t.id }; }
    const [gx, gy] = this.gateCell(), [kx, ky] = this.coreCell();
    for (const z of [10, 5, 0]) { const [tx, ty] = cell(z); if (tx === gx && ty === gy) return { kind: "gate" }; if (tx === kx && ty === ky) return { kind: "core" }; }
    return null;
  }

  /** Where to anchor a tooltip or popover for a tower, in CSS pixels relative to the canvas. */
  anchor(towerId: number): { x: number; y: number } | null {
    const t = this.pb.towers.find((o) => o.id === towerId);
    if (!t) return null;
    const [px, py] = this.at(...this.mid(t.x, t.y), this.towerZ(t) + 17), k = this.canvas.clientWidth / this.canvas.width;
    return { x: px * k, y: py * k };
  }
}
