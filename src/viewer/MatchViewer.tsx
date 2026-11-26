"use client";
// The spectator view: the miniature on a dark table, five small instruments
// around it, and one popover at a time for anyone curious about the machinery.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { effectiveStats, type EffectiveStats, type Tower } from "../engine/battle.ts";
import { RULES, TOWERS, UNITS, defenceResale, hpScale, lootFor, type TowerType, type UnitType } from "../engine/data.ts";
import { unitVitals, type RulesVersion } from "../engine/match-log.ts";
import { baseWave, summarizeWave, waveArchetype } from "../engine/waves.ts";
import type { Feed, FeedPlayer, LaneInfo, MatchView } from "./feed.ts";
import { UNIT_ART, towerModel, warden, type Mood } from "./models.ts";
import { C } from "./palette.ts";
import { Playback, towerLabel, type ActivityEntry, type Hud } from "./playback.ts";
import { Scene, type Hit } from "./scene.ts";
import { LIGHTING, blank, outlined, project, renderSprite, type Lighting } from "./voxel.ts";


type Open = "me" | "foe" | "round" | "econ" | "wave" | { tower: number } | null;
const THEMES: Record<string, string> = { swarm: "Swarm", rush: "Rush", shield: "Shield wall", air: "Air raid", armor: "Armoured push", mixed: "Mixed assault", boss: "Boss" };
const isTower = (o: Open): o is { tower: number } => typeof o === "object" && o !== null;
const ago = (ms: number) => (ms < 1500 ? "just now" : ms < 60_000 ? `${Math.round(ms / 1000)}s ago` : `${Math.round(ms / 60_000)} min ago`);

// ---------- miniature portraits ----------
const moodStyle = {
  neutral: "motion-safe:animate-idle",
  joy: "motion-safe:animate-joy",
  focus: "ring-jade",
  sad: "translate-y-px saturate-60 brightness-90",
};
const toneStyle = { good: "text-fern", bad: "text-terracotta", gold: "text-honey" };
const iconCache = new Map<string, string>();
function modelIcon(key: string, build: () => ReturnType<typeof towerModel>): string {
  let url = iconCache.get(key);
  if (!url) {
    const sp = outlined(renderSprite(build(), 6, LIGHTING.golden), C.outline, 1), box = 96, cv = blank(box, box), k = cv.getContext("2d")!;
    const f = Math.min((box * 0.84) / sp.cv.width, (box * 0.84) / sp.cv.height);
    k.imageSmoothingQuality = "high";
    k.drawImage(sp.cv, (box - sp.cv.width * f) / 2, (box - sp.cv.height * f) / 2, sp.cv.width * f, sp.cv.height * f);
    url = cv.toDataURL();
    iconCache.set(key, url);
  }
  return url;
}
const UnitIcon = ({ unit }: { unit: UnitType }) => <img className="block size-7 flex-none rounded-md bg-linear-to-b from-[#cfc1a4] to-[#b1a385] ring-1 ring-inset ring-charcoal/55" alt={UNITS[unit].name} src={modelIcon("u:" + unit, () => UNIT_ART[unit].model())} />;
const TowerIcon = ({ type, level }: { type: TowerType; level: number }) => <img className="block size-7 flex-none rounded-md bg-linear-to-b from-[#cfc1a4] to-[#b1a385] ring-1 ring-inset ring-charcoal/55" alt="" src={modelIcon(`t:${type}:${level}`, () => towerModel(type, level))} />;

/** The agent's warden. It blinks on its own; its mood comes from what is actually happening in the match. */
function Portrait({ seed, mood, size = 36 }: { seed: number; mood: Exclude<Mood, "blink">; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => { t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 130); loop(); }, 2600 + Math.random() * 4200); };
    loop();
    return () => clearTimeout(t);
  }, []);
  const shown: Mood = blink && mood !== "joy" ? "blink" : mood;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), s = (size / 12.5) * dpr, sp = renderSprite(warden(seed, shown), s, LIGHTING.golden), k = cv.getContext("2d")!;
    cv.width = cv.height = size * dpr;
    k.clearRect(0, 0, cv.width, cv.height);
    // Framed on the face: the head's centre sits at the centre of the tile and the body runs off the bottom.
    const [hx, hy] = project(4, 4, 9.5, s);
    k.drawImage(sp.cv, Math.round(cv.width / 2 - (sp.ox + hx)), Math.round(cv.height / 2 - (sp.oy + hy)));
  }, [seed, shown, size]);
  return <canvas ref={ref} className={`row-span-1 row-start-1 block rounded-md bg-elevated sm:row-span-2 sm:row-start-1 ring-1 ring-inset ${mood === "focus" ? "" : "ring-bronze"} ${moodStyle[mood]}`} style={{ width: size, height: size }} aria-hidden />;
}

// ---------- popover pieces ----------
const Row = ({ k, v, tone }: { k: string; v: ReactNode; tone?: "good" | "bad" | "gold" }) => <div className="flex justify-between gap-3 py-0.5"><span className="text-sand">{k}</span><b className={`text-right font-medium tabular-nums ${tone ? toneStyle[tone] : ""}`}>{v}</b></div>;
const Section = ({ title, children }: { title: string; children: ReactNode }) => <section><h4>{title}</h4>{children}</section>;

export interface MatchViewerProps {
  initial: Feed;
  /** Where to fetch fresh feeds while the match is live. Omit for a recorded match. */
  pollUrl?: string;
  /** Which player's lane to open on. */
  side?: 0 | 1;
  /** Called once the world is built. For tools that drive the view directly. */
  onReady?: (pb: Playback, scene: Scene) => void;
}

export function MatchViewer({ initial, pollUrl, side: startSide = 0, onReady }: MatchViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pbRef = useRef<Playback | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [feed, setFeed] = useState(initial);
  // In a lane view you watch your own lane; the other is hidden until the match ends.
  const [side, setSide] = useState<0 | 1>(initial.lane?.side ?? startSide);
  const [hud, setHud] = useState<Hud | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [tip, setTip] = useState<{ id: number; x: number; y: number } | null>(null);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [light, setLight] = useState<Lighting["key"]>("golden");
  const [now, setNow] = useState(() => Date.now());
  const openRef = useRef<Open>(null);
  openRef.current = open;

  // Build the world once, then run it. Rendering stops while the tab is hidden.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let saved: Lighting["key"] = "golden";
    try { const v = localStorage.getItem("td-light"); if (v === "morning" || v === "golden" || v === "night") saved = v; } catch { /* storage unavailable: keep the default */ }
    setLight(saved);
    const pb = new Playback(initial, initial.lane?.side ?? startSide), scene = new Scene(canvas, pb, saved);
    pbRef.current = pb; sceneRef.current = scene;
    onReady?.(pb, scene);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => { scene.reduced = motion.matches; };
    applyMotion(); motion.addEventListener("change", applyMotion);
    let raf = 0, last = performance.now(), sinceHud = 1;
    const frame = (t: number) => {
      // A frame's timestamp can precede the moment the loop was started, so never step backwards.
      const dt = Math.max(0, Math.min(0.1, (t - last) / 1000)); last = t;
      pb.update(dt); scene.frame(dt);
      sinceHud += dt;
      if (sinceHud > 0.1) {
        sinceHud = 0;
        setHud(pb.hud()); setNow(Date.now());
        const o = openRef.current;
        if (isTower(o)) { const a = scene.anchor(o.tower); if (a) setPin(a); else setOpen(null); }
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); };
    const onVisible = () => { if (document.hidden) cancelAnimationFrame(raf); else start(); };
    document.addEventListener("visibilitychange", onVisible);
    setHud(pb.hud()); start();
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVisible); motion.removeEventListener("change", applyMotion); };
    // The match is fixed for the life of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow a live match.
  useEffect(() => {
    if (!pollUrl || feed.status !== "active") return;
    let polling = false;
    const id = setInterval(async () => {
      if (document.hidden || polling) return;
      polling = true;
      try { const res = await fetch(pollUrl, { cache: "no-store" }); if (res.ok) {
        const next = (await res.json()) as MatchView;
        // The match ended (lane to full replay) or the viewer's access changed: start again with the new view.
        if (next.view !== feed.view) { location.reload(); return; }
        pbRef.current?.setFeed(next); setFeed(next);
      } } catch { /* offline: try again on the next tick */ } finally { polling = false; }
    }, 2000);
    return () => clearInterval(id);
  }, [pollUrl, feed.status]);

  const close = useCallback(() => { setOpen(null); if (sceneRef.current) sceneRef.current.selected = null; }, []);
  const toggle = useCallback((next: Exclude<Open, null>) => {
    setOpen((cur) => {
      const same = isTower(cur) && isTower(next) ? cur.tower === next.tower : cur === next;
      const scene = sceneRef.current;
      if (scene) scene.selected = !same && isTower(next) ? next.tower : null;
      if (!same && isTower(next)) setPin(scene?.anchor(next.tower) ?? null);
      return same ? null : next;
    });
    setTip(null);
  }, []);

  // One popover at a time; Escape or a click elsewhere puts it away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && openRef.current) { close(); (document.querySelector("[data-tdv-last]") as HTMLElement | null)?.focus(); } };
    const onDown = (e: PointerEvent) => { const t = e.target as HTMLElement; if (openRef.current && !t.closest("[data-tdv-pop],[data-tdv-trigger],canvas")) close(); };
    document.addEventListener("keydown", onKey); document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [close]);

  const chooseLight = (key: Lighting["key"]) => { setLight(key); sceneRef.current?.setLighting(key); try { localStorage.setItem("td-light", key); } catch { /* not saved: applies for this visit only */ } };
  const watch = (p: 0 | 1) => { pbRef.current?.setSide(p); setSide(p); close(); };

  // ---- the battlefield as an entry point ----
  const act = (hit: Hit | null) => {
    if (!hit) { close(); return; }
    if (hit.kind === "tower") toggle({ tower: hit.id });
    else toggle(hit.kind === "gate" ? "wave" : "me");
  };
  const onMove = (e: React.PointerEvent) => {
    const scene = sceneRef.current; if (!scene) return;
    const hit = scene.hit(e.clientX, e.clientY);
    scene.hover = hit;
    (e.currentTarget as HTMLElement).style.cursor = hit ? "pointer" : "default";
    const a = hit?.kind === "tower" && !(isTower(open) && open.tower === hit.id) ? scene.anchor(hit.id) : null;
    setTip(a && hit?.kind === "tower" ? { id: hit.id, ...a } : null);
  };
  const onCanvasKey = (e: React.KeyboardEvent) => {
    const scene = sceneRef.current, pb = pbRef.current; if (!scene || !pb) return;
    const list = pb.towers;
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && list.length) {
      e.preventDefault();
      const cur = scene.hover?.kind === "tower" ? list.findIndex((t) => t.id === (scene.hover as { id: number }).id) : -1;
      const t = list[(cur + (e.key === "ArrowRight" ? 1 : list.length - 1) + (cur < 0 && e.key === "ArrowLeft" ? 1 : 0)) % list.length];
      scene.hover = { kind: "tower", id: t.id };
      const a = scene.anchor(t.id); setTip(a ? { id: t.id, ...a } : null);
    } else if ((e.key === "Enter" || e.key === " ") && scene.hover) { e.preventDefault(); act(scene.hover); }
  };

  const pb = pbRef.current;
  const me = feed.players[side], foe = feed.players[1 - side], other = (1 - side) as 0 | 1;
  const trigger = (key: Exclude<Open, null>, label: string) => ({
    "data-tdv-trigger": "", "aria-expanded": open === key, "aria-label": label,
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => { document.querySelectorAll("[data-tdv-last]").forEach((n) => n.removeAttribute("data-tdv-last")); e.currentTarget.setAttribute("data-tdv-last", ""); toggle(key); },
  });
  const tipTower = tip && pb ? pb.towers.find((t) => t.id === tip.id) : null;
  const pinned = isTower(open) && pb ? pb.towers.find((t) => t.id === open.tower) : null;
  const stageW = stageRef.current?.clientWidth ?? 900, stageH = stageRef.current?.clientHeight ?? 640;
  const clampX = (x: number, w: number) => Math.max(w / 2 + 8, Math.min(stageW - w / 2 - 8, x));
  // The tower popover sits beside its tower, on whichever side has room, and never covers the HUD rows.
  const popW = stageW < 640 ? 248 : 288;
  const popTop = pin ? Math.max(76, Math.min(stageH - 76 - 280, pin.y - 48)) : 0;
  const popLeft = pin ? Math.max(8, Math.min(stageW - popW - 8, pin.x > stageW / 2 ? pin.x - 44 - popW : pin.x + 44)) : 0;

  return (
    <div className="text-[13px]/4 text-parchment [&_b]:font-semibold [&_i]:not-italic [&_em]:not-italic" data-light={light}>
      <div className="relative overflow-hidden rounded-lg bg-charcoal" ref={stageRef} style={{ "--tdv-pop-max": `${Math.max(96, stageH - (stageW < 640 ? 90 : 168))}px` } as React.CSSProperties}>
        <canvas
          ref={canvasRef} className="block h-auto w-full focus-visible:-outline-offset-2" tabIndex={0} role="application"
          aria-label={`Battlefield for @${me.handle}. Use left and right arrows to move between towers, Enter to inspect.`}
          onPointerMove={onMove} onPointerLeave={() => { if (sceneRef.current) sceneRef.current.hover = null; setTip(null); }}
          onClick={(e) => act(sceneRef.current?.hit(e.clientX, e.clientY) ?? null)} onKeyDown={onCanvasKey}
        />

        {hud && pb && (
          <>
            <div className="hud-slot top-2 left-2 items-start sm:top-4 sm:left-4">
              <button className="instrument player-plate [--tone:var(--color-jade)] [&>canvas]:col-start-1" {...trigger("me", `@${me.handle}, ${hud.lives[side]} lives. Open agent details.`)}>
                <Portrait seed={me.avatarSeed} mood={hud.mood[side]} />
                <span className="player-name"><b>@{me.handle}</b><i>{me.rank}</i></span>
                <span className={`health max-sm:col-start-2 max-sm:justify-end${hud.mood[side] === "sad" ? " text-terracotta" : ""}`}><Heart /><b>{Math.max(0, hud.lives[side])}</b></span>
                <Pips n={hud.lives[side]} />
              </button>
              <TransactionLog key={side} entries={pb.activity[side]} />
              {open === "me" && <AgentPop p={me} idx={side} hud={hud} pb={pb} feed={feed} now={now} friend onWatch={null} />}
            </div>

            <div className="hud-slot top-2 left-1/2 -translate-x-1/2 items-center sm:top-4">
              <button className="instrument flex flex-col items-center gap-0.5 px-2 pt-1.5 pb-2 sm:px-3" {...trigger("round", `Round ${hud.round} of ${hud.maxRounds}. Open round timeline.`)}>
                <span className="caption">{hud.replay ? "Replay · round" : feed.view === "lane" ? "Live · round" : "Round"}</span>
                <span className="flex items-baseline gap-0.5 [&>b]:text-[28px]/7 [&>b]:tabular-nums motion-safe:[&>b]:animate-tick [&>i]:text-[11px] [&>i]:text-sand"><b key={hud.round}>{hud.round}</b><i>/{hud.maxRounds}</i></span>
                <span className="mt-0.5 flex gap-px [&>i]:size-[2px] sm:[&>i]:size-[3px] [&>i]:rounded-[1px]" aria-hidden>{Array.from({ length: hud.maxRounds }, (_, i) => <i key={i} className={i < hud.round - 1 ? "bg-honey" : i === hud.round - 1 ? "bg-parchment" : "bg-bronze"} />)}</span>
              </button>
              {hud.note && <div className={`whitespace-nowrap rounded-md border bg-walnut px-2 py-0.5 text-[11px]/4 font-medium motion-safe:animate-note ${hud.note.good ? "border-honey/40 text-honey" : "border-bronze text-terracotta"}`} role="status">{hud.note.text}</div>}
              {open === "round" && <RoundPop hud={hud} pb={pb} feed={feed} side={side} now={now} light={light} onLight={chooseLight} />}
            </div>

            <div className="hud-slot top-2 right-2 items-end sm:top-4 sm:right-4">
              <button className="instrument player-plate [--tone:var(--color-terracotta)] [&>canvas]:col-start-3 [&>[aria-hidden]:last-child]:col-start-1 [&>[aria-hidden]:last-child]:flex-row-reverse" {...trigger("foe", `@${foe.handle}, ${hud.lives[other]} lives. Open opponent details.`)}>
                <span className={`health col-start-1 row-start-1${hud.mood[other] === "sad" ? " text-terracotta" : ""}`}><Heart /><b>{Math.max(0, hud.lives[other])}</b></span>
                <span className="player-name sm:col-start-2 sm:row-start-1 text-right"><b>@{foe.handle}</b><i>{foe.rank}</i></span>
                <Portrait seed={foe.avatarSeed} mood={hud.mood[other]} />
                <Pips n={hud.lives[other]} />
              </button>
              {open === "foe" && <AgentPop p={foe} idx={other} hud={hud} pb={pb} feed={feed} now={now} friend={false} onWatch={feed.view === "lane" ? null : () => watch(other)} />}
            </div>

            <div className="hud-slot bottom-2 left-2 items-start sm:bottom-4 sm:left-4">
              {open === "econ" && <EconPop pb={pb} idx={side} hud={hud} />}
              <button className="instrument flex h-12 items-center gap-2 px-2 sm:px-3" {...trigger("econ", `${hud.gold[side]} gold, ${hud.income[side]} per round. Open economy.`)}>
                <span className="figure"><span><i className={`relative size-3.5 flex-none overflow-hidden rounded-full bg-radial-[at_34%_30%] from-amber-100 via-honey to-amber-700 ring-1 ring-inset ring-amber-800 ${hud.phase === "result" ? "after:absolute after:inset-0 after:bg-linear-to-r after:via-white/80 motion-safe:after:animate-sheen" : ""}`} /><Count value={hud.gold[side]} /></span><i>Gold</i></span>
                <span className="h-7 w-px bg-bronze" />
                <span className="figure"><b className="text-fern">+{hud.income[side]}</b><i>Per round</i></span>
              </button>
            </div>

            <div className="hud-slot bottom-2 right-2 items-end sm:bottom-4 sm:right-4">
              {open === "wave" && <WavePop hud={hud} rulesVersion={pb.map.rulesVersion} />}
              <button className="instrument flex h-12 items-center gap-1 px-1 max-sm:max-w-[calc(100vw-166px)] max-sm:overflow-x-auto sm:gap-2 sm:px-3" {...trigger("wave", `${hud.wave.forecast ? "Next" : "Current"} wave: ${THEMES[hud.wave.theme] ?? hud.wave.theme}. Open wave details.`)}>
                <span className="figure hidden sm:flex"><i>{hud.wave.forecast ? "Next wave" : `Wave ${hud.wave.round}`}</i><b className="text-[13px]! text-terracotta">{THEMES[hud.wave.theme] ?? hud.wave.theme}</b></span>
                <span className="hidden h-7 w-px bg-bronze sm:block" />
                {hud.wave.entries.length === 0 && <span className="caption">Match over</span>}
                {hud.wave.entries.map((e) => (
                  <span className="flex items-center gap-1 [&_i]:hidden sm:[&_i]:inline [&_b]:text-[15px]/4" key={e.unit}><UnitIcon unit={e.unit} /><span className="figure"><b>{e.count}</b><i className="capitalize">{e.unit}</i></span></span>
                ))}
              </button>
            </div>

            {hud.result && (
              <div className={`instrument absolute top-24 left-1/2 z-1 flex w-max max-w-[min(20rem,90%)] -translate-x-1/2 flex-col items-center gap-1 px-5 py-3 text-center motion-safe:animate-fade [&>span]:text-sand [&>b]:text-xl ${hud.result.text === "Victory" ? "[&>b]:text-honey" : hud.result.text === "Defeat" ? "[&>b]:text-terracotta" : ""}`} role="status">
                <b>{hud.result.text}</b>
                <span>{hud.result.reason}</span>
                {me.ratingBefore !== null && me.ratingAfter !== null && feed.mode === "ranked" && <span className="caption">Rating {Math.round(me.ratingBefore)} → {Math.round(me.ratingAfter)}</span>}
                {feed.status === "finished" && <span className="caption">The replay starts again shortly.</span>}
              </div>
            )}

            {tipTower && tip && <div className="instrument pointer-events-none absolute z-3 -translate-x-1/2 -translate-y-[calc(100%+4px)] whitespace-nowrap px-2 py-1.5 [&>b]:block [&>b]:text-xs [&_i]:ml-1 [&_i]:font-normal [&_i]:text-sand [&>span]:text-[11px] [&>span]:text-sand" style={{ left: clampX(tip.x, 246), top: tip.y }}><TowerLine t={tipTower} pb={pb} /></div>}
            {pinned && pin && <div className="popover" data-tdv-pop role="dialog" aria-label="Tower details" style={{ left: popLeft, top: popTop, maxHeight: Math.max(160, stageH - popTop - 72) }}><TowerPop t={pinned} pb={pb} idx={side} /></div>}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- small instruments ----------
const Heart = () => <svg className="h-3 w-3.5 fill-(--tone)" viewBox="0 0 7 6" shapeRendering="crispEdges" aria-hidden><path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" /></svg>;
const Pips = ({ n }: { n: number }) => <span className="col-span-full row-start-3 flex gap-px sm:col-span-2 sm:col-start-2 sm:row-start-2 sm:gap-[2px] [&>i]:flex-1 [&>i]:rounded-[1px] motion-safe:[&>i]:transition-colors" aria-hidden>{Array.from({ length: RULES.startLives }, (_, i) => <i key={i} className={i < n ? "bg-(--tone)" : "bg-bronze"} />)}</span>;

/** A number that runs to its new value instead of jumping. */
function Count({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); from.current = value; return; }
    const start = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 450), v = Math.round(start + (value - start) * (1 - (1 - p) ** 3)); setShown(v); from.current = v; if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <b>{shown}</b>;
}

function attackSummary(t: Tower, s: EffectiveStats): string {
  if (t.type === "beacon") return "Support · adjacent towers";
  const reach = s.range >= 4.5 ? "Long range" : s.range >= 3 ? "Medium range" : "Short range";
  const pattern = s.slow ? "Area slow" : s.splash ? "Splash" : s.chain ? "Chain" : "Single target";
  return `${reach} · ${pattern} · ${s.targets === "both" ? "Air & ground" : s.targets === "air" ? "Air only" : "Ground only"}`;
}

const TransactionLog = memo(function TransactionLog({ entries }: { entries: ActivityEntry[] }) {
  const list = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  const first = useRef<ActivityEntry | undefined>(undefined);
  const [expanded, setExpanded] = useState(true);
  const [atLatest, setAtLatest] = useState(true);
  useLayoutEffect(() => {
    // Restarting a replay creates new entries, even if round one has the same orders.
    if (first.current !== entries[0]) {
      follow.current = true;
      setAtLatest(true);
      first.current = entries[0];
    }
    if (follow.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [entries, expanded]);

  return (
    <section className="instrument absolute top-[calc(100%+4px)] left-0 w-[min(47vw,13rem)] overflow-hidden bg-walnut/95 sm:top-[calc(100%+8px)] sm:w-60" aria-label="Transactions">
      <div className="flex items-center justify-between px-2">
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="flex flex-1 cursor-pointer items-center gap-1.5 py-1 text-left text-[11px] font-semibold text-limestone">
          <span aria-hidden className="text-brass">{expanded ? "▾" : "▸"}</span>Transactions
        </button>
        {expanded && !atLatest && <button type="button" className="cursor-pointer px-1 text-[11px] text-jade" onClick={() => {
          follow.current = true;
          if (list.current) list.current.scrollTop = list.current.scrollHeight;
          setAtLatest(true);
        }}>Latest ↓</button>}
      </div>
      {expanded && <ol ref={list} tabIndex={0} aria-label="Transaction and core damage history" onScroll={e => {
        const el = e.currentTarget;
        follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 4;
        setAtLatest(follow.current);
      }} className="max-h-[clamp(3rem,13vw,6rem)] overflow-y-auto overscroll-contain border-t border-bronze/70 px-2 text-[11px]/3.5 [scrollbar-width:thin] [overflow-anchor:none] sm:max-h-36">
        {entries.length === 0 && <li className="py-2 text-sand">Waiting for the first order.</li>}
        {entries.map(({ round, kind, label, amount }, i) => (
          <li key={i} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-1.5 border-b border-bronze/40 py-1 last:border-0">
            <span className="font-mono text-sand">R{round}</span>
            <span>{label}</span>
            <span className={`whitespace-nowrap font-mono tabular-nums ${kind === "taken" ? "text-terracotta" : kind === "dealt" ? "text-fern" : "text-honey"}`}>
              {kind === "dealt" ? `${amount} dmg` : kind === "taken" ? `−${amount} HP` : `${amount > 0 ? "+" : "−"}${Math.abs(amount)}g`}
            </span>
          </li>
        ))}
      </ol>}
    </section>
  );
});

function TowerLine({ t, pb }: { t: Tower; pb: Playback }) {
  const s = effectiveStats(t, pb.map, pb.towers), def = TOWERS[t.type];
  return (
    <>
      <b>{def.name} <i>{towerLabel(t)}</i></b>
      <span>{attackSummary(t, s)}</span>
    </>
  );
}

// ---------- popovers: everything below is read from the match itself ----------
function AgentPop({ p, idx, hud, pb, feed, now, friend, onWatch }: { p: FeedPlayer; idx: 0 | 1; hud: Hud; pb: Playback; feed: Feed; now: number; friend: boolean; onWatch: (() => void) | null }) {
  const lane = pb.duel.lanes[idx], history = pb.duel.history, txns = pb.txns[idx];
  const perfect = history.filter((r) => r.sides[idx].battle.livesLost === 0).length;
  const kills = lane.towers.reduce((s, t) => s + t.kills, 0);
  const lastRound = txns.length ? txns[txns.length - 1].round : 0;
  const lastActions = txns.filter((t) => t.round === lastRound).map((t) => t.payload);
  // Show what the agent sent: a Scanner is its own tool, and sales drop the replay-only pricing marker.
  const combat = lastActions.filter((a) => a.type !== "scan").map((a) => a.type === "sell" ? { type: a.type, id: a.id } : a);
  const payload = [
    ...(lastActions.some((a) => a.type === "scan") ? [`deploy_scanner {"round":${lastRound}}`] : []),
    ...(combat.length ? [`take_turn ${JSON.stringify({ actions: combat })}`] : []),
  ].join("\n");
  // A live match seen by its player: the opponent's board, purse and moves are hidden, as they are from your agent.
  const hidden = feed.view === "lane" && feed.lane !== undefined && idx !== feed.lane.side;
  const live = feed.live;
  let link: ReactNode;
  if (p.houseBot) link = "House bot: plays on the server, not over MCP";
  else if (!live) link = `Match finished · ${p.calls} MCP calls`;
  else if (live.turnEnded[idx]) link = "Turn ended, waiting for the round";
  else link = live.lastCall[idx] === null ? "Planning · no call seen since the server started" : `Planning · last MCP call ${ago(now - live.lastCall[idx]!)}`;
  return (
    <div className={`popover top-[calc(100%+8px)] ${friend ? "left-0" : "right-0"}`} data-tdv-pop role="dialog" aria-label={`@${p.handle} details`}>
      <header><Portrait seed={p.avatarSeed} mood={hud.mood[idx]} size={48} /><div><b>@{p.handle}</b><span>{p.rank} · {Math.round(p.rating)}{p.houseBot ? " · house bot" : ""}</span></div></header>
      {p.tagline && <p className="text-sand">{p.tagline}</p>}
      <Section title="Agent">
        <Row k="Record" v={`${p.wins}–${p.losses}${p.draws ? `–${p.draws}` : ""}`} />
        {p.streak !== 0 && <Row k="Streak" v={p.streak > 0 ? `${p.streak} won` : `${-p.streak} lost`} tone={p.streak > 0 ? "good" : undefined} />}
        <Row k="Peak rating" v={Math.round(p.peak)} />
        <Row k="Strategy" v={p.houseBot ? "Built-in heuristics" : p.playbookVersion ? `Playbook v${p.playbookVersion}` : "No playbook saved"} />
        {p.agentModel && <Row k="Runs on" v={p.agentModel} />}
        <Row k="Link" v={link} />
      </Section>
      {hidden && feed.lane ? <IntelSection lane={feed.lane} round={pb.duel.round} /> : <>
      <Section title="This match">
        <Row k="Rounds held without a leak" v={`${perfect} of ${history.length}`} tone={perfect > 0 ? "gold" : undefined} />
        <Row k="Lives taken by sends" v={lane.totals.livesTaken} />
        <Row k="Raiders destroyed" v={kills} />
        <Row k="Towers standing" v={lane.towers.length} />
      </Section>
      <Section title={`Recent actions${lastRound ? ` · round ${lastRound}` : ""}`}>
        {txns.length === 0 && <p className="empty">No actions yet.</p>}
        <ul className="action-log">{txns.slice(-5).map((t, i) => <li key={i}><i>R{t.round}</i>{t.text}</li>)}</ul>
        {payload && !p.houseBot && <details><summary>MCP payload</summary><code>{payload}</code><p className="empty">Accepted actions only; rejected ones are not recorded.</p></details>}
      </Section>
      </>}
      {onWatch && <button className="mt-3 w-full cursor-pointer rounded-md border border-bronze bg-elevated py-1.5 font-medium hover:border-brass" onClick={onWatch}>Watch this lane</button>}
    </div>
  );
}

/** What your agent knows about a live opponent: only what its raiders and Scanners have revealed. */
function IntelSection({ lane, round }: { lane: LaneInfo; round: number }) {
  const known = lane.intel;
  return (
    <Section title="What your agent knows">
      <p className="empty">Their board, gold and income stay hidden until the match ends. Towers appear here when they strike your raiders, or when a Scanner sees them.</p>
      <Row k="Known towers" v={known.length} />
      <Row k="Last Scanner" v={lane.lastScanRound ? (lane.lastScanRound === round ? "this round" : `round ${lane.lastScanRound}`) : "none"} />
      {known.length > 0 && <ul className="action-log mt-1">{known.map((t) => <li key={t.id}><i>R{t.seenRound}</i>{TOWERS[t.type].name}{t.spec ? ` · ${TOWERS[t.type].specs[t.spec].name}` : ` · level ${t.level}`} at {t.x},{t.y}<b className="text-sand">{t.via === "scan" ? "scanned" : "hit you"}</b></li>)}</ul>}
    </Section>
  );
}

function RoundPop({ hud, pb, feed, side, now, light, onLight }: { hud: Hud; pb: Playback; feed: Feed; side: 0 | 1; now: number; light: Lighting["key"]; onLight: (k: Lighting["key"]) => void }) {
  const d = pb.duel, other = 1 - side;
  // While a round is on screen it is not "coming up"; the engine's own counter has already moved on once it resolves.
  const first = hud.phase === "build" || hud.phase === "battle" ? d.round + 1 : d.round;
  const upcoming = d.status === "planning" ? [0, 1, 2].map((i) => first + i).filter((r) => r <= RULES.maxRounds) : [];
  const left = feed.live ? Math.max(0, Math.round((feed.live.deadline - now) / 1000)) : null;
  return (
    <div className="popover top-[calc(100%+8px)] left-1/2 -translate-x-1/2 motion-safe:animate-fade" data-tdv-pop role="dialog" aria-label="Round timeline">
      <header><div><b>Round {hud.round} of {hud.maxRounds}</b><span>{feed.mode === "ranked" ? "Ranked" : "Practice"} · seed {feed.seed}{feed.live && hud.phase === "waiting" && left !== null ? ` · planning, ${left}s left` : ""}</span></div></header>
      <Section title="Rounds fought">
        {d.history.length === 0 && <p className="empty">No rounds resolved yet.</p>}
        <ol className="timeline">
          {d.history.slice(-8).map((r) => {
            const a = r.sides[side].battle.livesLost, b = r.sides[other].battle.livesLost;
            return <li key={r.round}><i>{r.round}</i><span>{THEMES[waveArchetype(d.seed, r.round)]}</span><b className={a ? "text-terracotta" : "text-honey"}>{a ? `−${a}` : "held"}</b><b className={b ? "text-fern" : ""}>{b ? `−${b}` : "held"}</b></li>;
          })}
        </ol>
        {d.history.length > 0 && <p className="empty">Lives lost: this lane, then the opponent's.</p>}
      </Section>
      {upcoming.length > 0 && (
        <Section title="Coming up">
          <ol className="timeline">{upcoming.map((r) => <li key={r}><i>{r}</i><span>{THEMES[waveArchetype(d.seed, r)]}</span><em>{Object.entries(summarizeWave(baseWave(d.seed, r))).map(([u, n]) => `${n} ${u}`).join(", ")}</em></li>)}</ol>
        </Section>
      )}
      <Section title="Light">
        <div className="flex gap-0.5 rounded-md border border-bronze bg-charcoal p-0.5 text-[11px]/4" role="radiogroup" aria-label="Time of day">
          {(Object.keys(LIGHTING) as Lighting["key"][]).map((k) => <button key={k} role="radio" aria-checked={light === k} className="flex-1 cursor-pointer rounded py-1 font-medium text-sand aria-checked:bg-elevated aria-checked:text-parchment" onClick={() => onLight(k)}>{LIGHTING[k].name}</button>)}
        </div>
      </Section>
    </div>
  );
}

function EconPop({ pb, idx, hud }: { pb: Playback; idx: 0 | 1; hud: Hud }) {
  const lane = pb.duel.lanes[idx], txns = pb.txns[idx].filter((t) => t.delta !== 0);
  const byType = new Map<TowerType, number>();
  for (const t of lane.towers) byType.set(t.type, (byType.get(t.type) ?? 0) + t.invested);
  return (
    <div className="popover bottom-[calc(100%+8px)] left-0" data-tdv-pop role="dialog" aria-label="Economy">
      <header><div><b>{hud.gold[idx]} gold</b><span>+{hud.income[idx]} at the end of every round</span></div></header>
      <Section title="Income">
        <Row k="Base" v={`+${RULES.baseIncome}`} />
        <Row k="From sends" v={`+${lane.income - RULES.baseIncome}`} tone="good" />
      </Section>
      <Section title="So far">
        <Row k="Spent on towers" v={lane.totals.towerGold} />
        <Row k="Spent on sends" v={lane.totals.sendGold} />
        {lane.totals.goldStolen > 0 && <Row k="Stolen by your goblins" v={`+${lane.totals.goldStolen}`} tone="good" />}
        {lane.totals.goldLost > 0 && <Row k="Stolen from you by goblins" v={`−${lane.totals.goldLost}`} tone="bad" />}
        <Row k="Bounties earned" v={`+${lane.totals.bounty}`} tone="gold" />
        {lane.totals.refunds > 0 && <Row k="Refunds from selling" v={`+${lane.totals.refunds}`} />}
      </Section>
      {byType.size > 0 && <Section title="Invested in towers">{[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, gold]) => <Row key={type} k={TOWERS[type].name} v={gold} />)}</Section>}
      <Section title="Recent transactions">
        {txns.length === 0 && <p className="empty">Nothing spent yet.</p>}
        <ul className="action-log">{txns.slice(-5).map((t, i) => <li key={i}><i>R{t.round}</i>{t.text.replace(/ for \d+ gold.*$| \(\d+ gold\)\.?$/, "").replace(/\.$/, "")}<b className={t.delta > 0 ? "text-fern" : ""}>{t.delta > 0 ? "+" : ""}{t.delta}</b></li>)}</ul>
      </Section>
    </div>
  );
}

function WavePop({ hud, rulesVersion }: { hud: Hud; rulesVersion: RulesVersion }) {
  const scale = hpScale(hud.wave.round);
  return (
    <div className="popover bottom-[calc(100%+8px)] right-0" data-tdv-pop role="dialog" aria-label="Wave details">
      <header><div><b>{THEMES[hud.wave.theme] ?? hud.wave.theme}</b><span>{hud.wave.forecast ? "Next wave" : "Wave"} {hud.wave.round} · health ×{scale}</span></div></header>
      {hud.wave.entries.map((e) => {
        const u = UNITS[e.unit], vitals = unitVitals(e.unit, rulesVersion);
        return (
          <section key={e.unit} className="flex items-start gap-2 [&>img]:size-9 [&_p]:text-sand">
            <UnitIcon unit={e.unit} />
            <div>
              <h4>{e.count} × {u.name} · {UNIT_ART[e.unit].kind}{e.sent > 0 && <em> · {e.sent} sent by the opponent</em>}</h4>
              <p>{u.desc}</p>
              <code>{Math.round(vitals.hp * scale)} hp{vitals.shield ? ` · ${Math.round(vitals.shield * scale)} shield` : ""}{u.armor ? ` · ${u.armor} armour` : ""} · speed {u.speed}{u.flying ? " · flying" : ""} · {u.loot ? `steals ${lootFor(e.unit, hud.wave.round)} gold, no lives` : `costs ${u.lives} ${u.lives === 1 ? "life" : "lives"}`} · {u.bounty}g bounty</code>
            </div>
          </section>
        );
      })}
      {hud.wave.forecast && <p className="empty">Units the opponent sends stay hidden until the round resolves.</p>}
    </div>
  );
}

// Matchups describe what the tower actually has to work with in a lane.
const MATCHUPS: Record<TowerType, [advantage: string, limitation: string]> = {
  gatling: ["Fast, unarmoured raiders", "Armour absorbs damage from each bullet"],
  cannon: ["Packed ground waves", "Flyers and targets inside its minimum range"],
  ballista: ["Armoured ogres, wyverns and bosses", "Slow reload against a swarm"],
  tesla: ["Shieldbearers and tight packs", "Widely spaced raiders break the chain"],
  flak: ["Flying imps and wyverns", "Ground units pass underneath"],
  frost: ["Fast waves in a bend", "Needs a damage tower nearby"],
  laser: ["Goblin thieves and wounded targets", "Armour blunts each beam"],
  beacon: ["A cluster of adjacent damage towers", "An isolated Beacon gives no bonus"],
};

function TowerPop({ t, pb, idx }: { t: Tower; pb: Playback; idx: 0 | 1 }) {
  const def = TOWERS[t.type], s = effectiveStats(t, pb.map, pb.towers), nowStats = pb.towerNow(t.id), notes = pb.towerNotes[idx].get(t.id) ?? [];
  const [advantage, limitation] = MATCHUPS[t.type];
  const focusedArc = t.type === "tesla" && t.spec === "b";
  const next = t.spec ? null : t.level < 3 ? def.levels[t.level] : null;
  return (
    <>
      <header><TowerIcon type={t.type} level={t.level} /><div><b>{def.name}</b><span>{towerLabel(t)} · cell {t.x},{t.y}</span></div></header>
      <p className="font-medium text-parchment">{attackSummary(t, s)}</p>
      {t.spec && <p className="text-sand">{def.specs[t.spec].desc}</p>}
      <Row k="Best use" v={focusedArc ? "Breaking one heavy shield" : advantage} tone="good" />
      <Row k="Limitation" v={focusedArc ? "Only hits one enemy per shot" : limitation} />
      <Section title="Now">
        {t.type !== "beacon" && t.type !== "frost" && <Row k="Damage per second" v={(s.dmg * s.rate).toFixed(1)} />}
        {t.type !== "beacon" && <Row k="Range" v={`${s.minRange ? s.minRange + "–" : ""}${s.range.toFixed(2)} cells`} />}
        {s.splash ? <Row k="Blast radius" v={s.splash} /> : null}
        {s.chain ? <Row k="Jumps" v={s.chain} /> : null}
        {s.slow ? <Row k="Slow" v={`${Math.round(s.slow * 100)}%`} /> : null}
        {s.buffDmg ? <Row k="Boost to neighbours" v={`+${Math.round(s.buffDmg * 100)}% damage${s.buffRange ? `, +${Math.round(s.buffRange * 100)}% range` : ""}`} /> : null}
        {t.type !== "beacon" && t.type !== "frost" && <Row k="Targeting" v={t.targeting} />}
      </Section>
      <Section title="Performance">
        {nowStats && <Row k="This battle" v={`${nowStats.dmg} damage · ${nowStats.kills} kills`} />}
        <Row k="Lifetime damage" v={t.dmg + (nowStats?.dmg ?? 0)} />
        <Row k="Lifetime kills" v={t.kills + (nowStats?.kills ?? 0)} />
        <Row k="Gold invested" v={t.invested} tone="gold" />
        <Row k="Sell value" v={`${defenceResale(t.invested)} gold`} />
      </Section>
      <Section title="History">
        <ul className="action-log">{notes.map((n, i) => <li key={i}><i>R{n.round}</i>{n.text}</li>)}</ul>
      </Section>
      <Section title="Next upgrade">
        {next && <Row k={`Level ${t.level + 1}`} v={`${next.cost} gold${next.dmg ? ` · ${(next.dmg * next.rate).toFixed(1)} dps` : ""}`} />}
        {!t.spec && t.level === 3 && (["a", "b"] as const).map((k) => <Row key={k} k={def.specs[k].name} v={`${def.specs[k].cost} gold`} />)}
        {!t.spec && t.level === 3 && <p className="empty">{def.specs.a.name}: {def.specs.a.desc} {def.specs.b.name}: {def.specs.b.desc}</p>}
        {t.spec && <p className="empty">Fully specialised.</p>}
      </Section>
    </>
  );
}

export default MatchViewer;
