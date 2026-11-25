// Drives the spectator view from the real engine. It rebuilds the match from
// its seed and action log, one round at a time, and steps the same battle
// simulation the server ran, so everything on screen is actual game state.
import { battleResult, createBattle, stepBattle, type Battle, type Enemy, type Tower } from "../engine/battle.ts";
import { RULES, TOWERS, UNITS, type TowerType, type UnitType } from "../engine/data.ts";
import { applyRecordedAction, commit, createDuel, resolveRound, type Action, type DuelState, type RoundRecord } from "../engine/duel.ts";
import { baseWave, sendGroups, waveArchetype, type SpawnGroup } from "../engine/waves.ts";
import type { Feed } from "./feed.ts";

export type Phase = "build" | "battle" | "result" | "waiting" | "final";

export interface Txn { round: number; text: string; delta: number; payload: Action }
export interface TowerNote { round: number; text: string }

/** Something for the renderer to show. Positions are in map cells. */
export type Fx =
  | { kind: "shot"; tower: Tower; x: number; y: number; hits: { x: number; y: number; flying: boolean }[] }
  | { kind: "pulse"; tower: Tower }
  | { kind: "die"; x: number; y: number; unit: UnitType }
  | { kind: "leak"; unit: UnitType; lives: number; loot: number }
  | { kind: "built"; id: number }
  | { kind: "upgraded"; id: number }
  | { kind: "sold"; x: number; y: number }
  | { kind: "cleared"; perfect: boolean };

export interface WaveEntry { unit: UnitType; count: number; sent: number }

export interface Hud {
  round: number;
  maxRounds: number;
  phase: Phase;
  replay: boolean;
  theme: string;
  /** Indexed by player, not by viewed side. */
  lives: [number, number];
  gold: [number, number];
  income: [number, number];
  wave: { round: number; theme: string; forecast: boolean; entries: WaveEntry[] };
  note: { text: string; good: boolean } | null;
  result: { text: string; reason: string } | null;
  mood: ["neutral" | "focus" | "joy" | "sad", "neutral" | "focus" | "joy" | "sad"];
}

const TICK = 1 / RULES.tps;
/** Battles play faster than real time; a live match that falls behind speeds up further to catch up. */
const PLAYBACK = 1.6;

export class Playback {
  feed: Feed;
  side: 0 | 1;
  duel!: DuelState;
  phase: Phase = "waiting";
  phaseT = 0;
  clock = 0;
  /** The round on screen. */
  round = 1;
  battles: [Battle, Battle] | null = null;
  /** 0..1 between the previous simulation tick and the current one, for smooth motion. */
  alpha = 0;
  prev = new Map<number, [number, number]>();
  txns: [Txn[], Txn[]] = [[], []];
  towerNotes: [Map<number, TowerNote[]>, Map<number, TowerNote[]>] = [new Map(), new Map()];
  /** When each newly built tower appears, on the playback clock. */
  reveal = new Map<number, number>();
  lastRecord: RoundRecord | null = null;
  lastLeakAt: [number, number] = [-99, -99];
  private fx: Fx[] = [];
  private known = new Map<number, Enemy>();
  private acc = 0;
  private buildFor = 0;
  private groups: [SpawnGroup[], SpawnGroup[]] = [[], []];

  constructor(feed: Feed, side: 0 | 1) {
    this.feed = feed;
    this.side = side;
    this.restart();
  }

  /** Begin again from round one. A live match skips silently to its latest resolved round. */
  restart(): void {
    this.duel = createDuel(this.feed.seed, this.feed.rulesVersion);
    this.txns = [[], []];
    this.towerNotes = [new Map(), new Map()];
    this.reveal.clear();
    this.battles = null;
    this.lastRecord = null;
    this.round = 1;
    if (this.feed.status === "active") while (this.round < this.feed.resolvedRounds && this.duel.status === "planning") this.skipRound();
    this.enterRound();
  }

  setFeed(feed: Feed): void {
    this.feed = feed;
    if (this.phase === "waiting") this.enterRound();
  }

  setSide(side: 0 | 1): void {
    this.side = side;
    this.prev.clear();
    this.reveal.clear();
  }

  /**
   * A live match seen by one of its players. The feed holds only your moves and
   * the raiders sent at you, so only your lane is rebuilt exactly. Values that
   * depend on the hidden lane (their lives, gold your goblins stole) are taken
   * from the server after each round.
   */
  get laneMode(): boolean { return this.feed.view === "lane"; }
  private get opp(): 0 | 1 { return (1 - this.side) as 0 | 1; }

  /** Lane mode: the opponent's half of this replay only carries their sends, so it must never run out of gold for them. */
  private prepareHidden(): void {
    if (this.laneMode) this.duel.lanes[this.opp].gold = 1e9;
  }

  /**
   * Score the round. In lane mode the stand-in lane has no towers, so it would
   * lose every life; it is propped up while the round is scored and then given
   * the real figure, so the stand-in value is never on screen.
   */
  private resolve(): RoundRecord {
    const them = this.duel.lanes[this.opp], lives = them.lives;
    if (this.laneMode) them.lives = 1e9;
    const rec = resolveRound(this.duel);
    if (this.laneMode) them.lives = lives;
    this.settle(rec);
    return rec;
  }

  /** Lane mode: replace what this replay cannot know with the settled values for the round just resolved. */
  private settle(rec: RoundRecord): void {
    const info = this.feed.lane;
    if (!this.laneMode || !info) return;
    const r = info.rounds[rec.round - 1];
    if (!r) return;
    const me = this.duel.lanes[this.side], them = this.duel.lanes[this.opp];
    me.gold = r.goldAfter; me.income = r.incomeAfter; me.lives = r.livesAfter;
    const before = rec.round > 1 ? info.rounds[rec.round - 2]?.opponentLivesAfter ?? RULES.startLives : RULES.startLives;
    them.lives = r.opponentLivesAfter;
    const mine = rec.sides[this.side], theirs = rec.sides[this.opp];
    // The stand-in lane let every raider and goblin through; swap in what really happened.
    me.totals.goldStolen += r.goldStolen - mine.goldStolen;
    me.totals.livesTaken += r.livesTaken - theirs.battle.leakedLives.send;
    mine.goldStolen = r.goldStolen;
    mine.goldAfter = r.goldAfter; mine.incomeAfter = r.incomeAfter; mine.livesAfter = r.livesAfter;
    theirs.livesAfter = r.opponentLivesAfter;
    theirs.battle = { ...theirs.battle, livesLost: before - r.opponentLivesAfter, leakedLives: { base: theirs.battle.leakedLives.base, send: r.livesTaken } };
  }

  get map() { return this.duel.map; }
  get battle(): Battle | null { return this.battles ? this.battles[this.side] : null; }
  get towers(): Tower[] { return this.duel.lanes[this.side].towers; }
  drain(): Fx[] { const out = this.fx; this.fx = []; return out; }

  private apply(p: 0 | 1, a: Action, show: boolean): void {
    const lane = this.duel.lanes[p], before = lane.gold;
    const sold = a.type === "sell" ? lane.towers.find((t) => t.id === a.id) : undefined;
    const res = applyRecordedAction(this.duel, p, a);
    if (!res.ok) return;
    this.txns[p].push({ round: this.round, text: res.note, delta: lane.gold - before, payload: a });
    const notes = this.towerNotes[p];
    if (a.type === "build" && res.towerId !== undefined) {
      notes.set(res.towerId, [{ round: this.round, text: `Built for ${TOWERS[a.tower].levels[0].cost} gold` }]);
      if (show && p === this.side) { this.reveal.set(res.towerId, this.clock + 0.2 + this.buildFor); this.buildFor += 0.25; this.fx.push({ kind: "built", id: res.towerId }); }
    } else if (a.type === "upgrade" || a.type === "target") {
      notes.get(a.id)?.push({ round: this.round, text: res.note.replace(/^.*#\d+ /, "").replace(/^is now /, "Upgraded to ").replace(/^now targets /, "Retargeted to ").replace(/^specialised into /, "Specialised: ") });
      if (a.type === "upgrade" && show && p === this.side) { this.buildFor += 0.2; this.fx.push({ kind: "upgraded", id: a.id }); }
    } else if (a.type === "sell" && sold && show && p === this.side) this.fx.push({ kind: "sold", x: sold.x, y: sold.y });
  }

  private skipRound(): void {
    const acts = this.feed.log[this.round - 1];
    this.prepareHidden();
    for (const p of [0, 1] as const) for (const a of acts[p]) this.apply(p, a, false);
    commit(this.duel, 0); commit(this.duel, 1);
    this.lastRecord = this.resolve();
    this.round++;
  }

  private enterRound(): void {
    this.phaseT = 0;
    this.battles = null;
    this.known.clear();
    this.prev.clear();
    if (this.duel.status !== "planning" || this.round > this.feed.resolvedRounds) {
      this.phase = this.feed.status === "finished" ? "final" : "waiting";
      return;
    }
    this.buildFor = 0;
    const acts = this.feed.log[this.round - 1];
    this.prepareHidden();
    for (const p of [0, 1] as const) for (const a of acts[p]) this.apply(p, a, true);
    this.phase = "build";
    this.buildFor = Math.max(1, this.buildFor + 0.6);
    const base = baseWave(this.duel.seed, this.round);
    this.groups = [[...base, ...sendGroups(this.duel.lanes[1].sends)], [...base, ...sendGroups(this.duel.lanes[0].sends)]];
  }

  /** Advance by real seconds. */
  update(dt: number): void {
    const behind = this.feed.resolvedRounds - this.round;
    const speed = PLAYBACK * (this.feed.status === "active" ? (behind >= 3 ? 3 : behind >= 1 ? 1.6 : 1) : 1);
    this.clock += dt;
    this.phaseT += dt;

    // Towers are revealed one by one in real time; only catching up shortens that.
    if (this.phase === "build" && this.phaseT >= (this.buildFor * PLAYBACK) / speed) {
      this.battles = [0, 1].map((p) => createBattle(this.duel.map, this.duel.lanes[p].towers, this.groups[p], this.round)) as [Battle, Battle];
      this.phase = "battle"; this.phaseT = 0; this.acc = 0;
    } else if (this.phase === "battle" && this.battles) {
      this.acc += dt * speed;
      while (this.acc >= TICK && !this.battles[this.side].done) {
        this.acc -= TICK;
        this.step();
      }
      this.alpha = Math.min(1, this.acc / TICK);
      if (this.battles[this.side].done) this.finishRound();
    } else if (this.phase === "result" && this.phaseT >= 3.2 / speed) {
      this.round++;
      this.enterRound();
    } else if (this.phase === "final" && this.feed.status === "finished" && this.phaseT >= 16) {
      this.restart();
    }
  }

  private step(): void {
    const [mine, theirs] = [this.battles![this.side], this.battles![1 - this.side]];
    this.prev.clear();
    for (const e of mine.enemies) if (e.alive) this.prev.set(e.id, [e.x, e.y]);
    const events = stepBattle(mine);
    // In lane mode the other battle is a stand-in with no towers; it is never shown.
    if (!theirs.done && !this.laneMode) {
      const before = theirs.livesLost;
      stepBattle(theirs);
      if (theirs.livesLost > before) this.lastLeakAt[1 - this.side] = this.clock;
    }
    for (const ev of events) {
      if (ev.e === "spawn") { const en = mine.enemies.find((x) => x.id === ev.id); if (en) this.known.set(ev.id, en); }
      else if (ev.e === "shot") {
        const tower = this.towers.find((t) => t.id === ev.tower);
        if (!tower) continue;
        const hits = ev.hits.map((id) => this.known.get(id)).filter((e): e is Enemy => !!e).map((e) => ({ x: e.x, y: e.y, flying: UNITS[e.unit].flying }));
        this.fx.push({ kind: "shot", tower, x: ev.x, y: ev.y, hits });
      } else if (ev.e === "pulse") { const tower = this.towers.find((t) => t.id === ev.tower); if (tower) this.fx.push({ kind: "pulse", tower }); }
      else if (ev.e === "die") { const en = this.known.get(ev.id); if (en) this.fx.push({ kind: "die", x: ev.x, y: ev.y, unit: en.unit }); }
      else if (ev.e === "leak") { const en = this.known.get(ev.id); this.lastLeakAt[this.side] = this.clock; if (en) this.fx.push({ kind: "leak", unit: en.unit, lives: ev.lives, loot: ev.loot }); }
    }
  }

  private finishRound(): void {
    const [a, b] = this.battles!;
    for (const other of [a, b]) while (!other.done) stepBattle(other);
    const seen = battleResult(this.battles![this.side]);
    commit(this.duel, 0); commit(this.duel, 1);
    this.lastRecord = this.resolve();
    const official = this.lastRecord.sides[this.side].battle;
    // The battle shown must be the battle that was scored. If this ever fires, the replay has drifted.
    if (official.livesLost !== seen.livesLost || official.bounty !== seen.bounty) console.warn("towerdefender: displayed battle differs from the scored one", { official, seen });
    this.fx.push({ kind: "cleared", perfect: official.livesLost === 0 });
    this.phase = "result"; this.phaseT = 0;
  }

  /** Enemies of the viewed lane with interpolated positions. */
  enemies(): { e: Enemy; x: number; y: number }[] {
    const b = this.battle;
    if (!b) return [];
    const out = [];
    for (const e of b.enemies) {
      if (!e.alive) continue;
      const p = this.prev.get(e.id);
      out.push(p ? { e, x: p[0] + (e.x - p[0]) * this.alpha, y: p[1] + (e.y - p[1]) * this.alpha } : { e, x: e.x, y: e.y });
    }
    return out;
  }

  /** Damage, kills and shots a tower has made in the battle on screen. */
  towerNow(id: number): { dmg: number; kills: number; shots: number } | null {
    const tr = this.battle?.towers.find((t) => t.tower.id === id);
    return tr ? { dmg: Math.round(tr.dmg), kills: tr.kills, shots: tr.shots } : null;
  }

  waveEntries(p: 0 | 1): WaveEntry[] {
    const by = new Map<UnitType, WaveEntry>();
    for (const g of this.groups[p]) {
      const e = by.get(g.unit) ?? { unit: g.unit, count: 0, sent: 0 };
      e.count += g.count;
      if (g.source === "send") e.sent += g.count;
      by.set(g.unit, e);
    }
    return [...by.values()];
  }

  hud(): Hud {
    const d = this.duel, fighting = this.phase === "battle" && this.battles;
    const num = (f: (p: 0 | 1) => number): [number, number] => [f(0), f(1)];
    const shown = this.phase === "build" || this.phase === "battle" || this.phase === "result";
    const waveRound = shown ? this.round : d.round;
    const forecast = !shown && d.status === "planning";
    const entries: WaveEntry[] = shown ? this.waveEntries(this.side)
      : forecast ? baseWave(d.seed, d.round).reduce<WaveEntry[]>((acc, g) => { const e = acc.find((x) => x.unit === g.unit); if (e) e.count += g.count; else acc.push({ unit: g.unit, count: g.count, sent: 0 }); return acc; }, [])
      : [];
    let note: Hud["note"] = null;
    if (this.phase === "result" && this.lastRecord) {
      const b = this.lastRecord.sides[this.side].battle;
      note = b.livesLost === 0 ? { text: `Round ${this.lastRecord.round} held`, good: true } : { text: `Round ${this.lastRecord.round}: ${b.livesLost} ${b.livesLost === 1 ? "life" : "lives"} lost`, good: false };
    }
    let result: Hud["result"] = null;
    if (this.phase === "final") {
      const w = d.status === "finished" ? d.winner : this.feed.winner;
      result = { text: w === "draw" || w === null ? "Draw" : w === this.side ? "Victory" : "Defeat", reason: (d.status === "finished" ? d.endReason : this.feed.endReason) ?? "" };
    }
    const mood = (p: 0 | 1) => {
      if (this.phase === "final") { const w = d.status === "finished" ? d.winner : this.feed.winner; return w === p ? "joy" : w === "draw" || w === null ? "neutral" : "sad"; }
      if (this.clock - this.lastLeakAt[p] < 2.5) return "sad";
      if (this.phase === "result" && this.lastRecord && this.lastRecord.sides[p].battle.livesLost === 0 && this.phaseT < 2.2) return "joy";
      const live = this.feed.live;
      // "Focused" only while that agent is genuinely mid-turn: planning, not yet ended, and heard from recently.
      if (this.phase === "waiting" && live && !live.turnEnded[p] && live.lastCall[p] !== null && live.now - live.lastCall[p]! < 25_000) return "focus";
      return "neutral";
    };
    return {
      round: Math.min(shown ? this.round : d.round, RULES.maxRounds), maxRounds: RULES.maxRounds, phase: this.phase, replay: this.feed.status === "finished",
      theme: waveArchetype(d.seed, waveRound),
      // In lane mode the opponent's lane is hidden: their lives change only when the round settles.
      lives: num((p) => d.lanes[p].lives - (fighting && !(this.laneMode && p === this.opp) ? this.battles![p].livesLost : 0)),
      // While a battle runs, show bounties as they land and gold moving with each goblin, as the payout will settle it.
      // What your own goblins steal is unknown until then in lane mode.
      gold: num((p) => d.lanes[p].gold + (fighting ? this.battles![p].bounty - this.battles![p].stolen + (this.laneMode ? 0 : this.battles![1 - p].stolen) : 0)),
      income: num((p) => d.lanes[p].income),
      wave: { round: waveRound, theme: waveArchetype(d.seed, waveRound), forecast, entries },
      note, result, mood: [mood(0), mood(1)],
    };
  }
}

export function towerLabel(t: { type: TowerType; level: number; spec: "a" | "b" | null }): string {
  return t.spec ? TOWERS[t.type].specs[t.spec].name : `Level ${t.level}`;
}
