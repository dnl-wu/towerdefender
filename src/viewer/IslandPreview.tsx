"use client";
// A real island, with no interface and no input: just the miniature. With `replay`
// it plays the feed's last round on a loop; without, it is a quiet island at rest.
import { useEffect, useRef } from "react";
import type { Feed } from "./feed.ts";
import { Playback } from "./playback.ts";
import { Scene } from "./scene.ts";
import type { Lighting } from "./voxel.ts";

export function IslandPreview({ feed, lighting, label, replay = true }: { feed: Feed; lighting: Lighting["key"]; label: string; replay?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const pb = new Playback(feed, 0);
    // A preview is drawn a few hundred pixels wide; the scene's own resolution is plenty without the screen's pixel ratio on top.
    const scene = new Scene(canvas, pb, lighting, 1);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scene.reduced = still;
    // Start partway into the battle, so the first thing anyone sees is the island at work.
    if (replay) for (let i = 0; i < 400 && (pb.phase !== "battle" || pb.phaseT < 3); i++) pb.update(0.05);
    scene.frame(0);
    if (still) return;

    let raf = 0, last = performance.now(), visible = false;
    const frame = (t: number) => {
      const dt = Math.max(0, Math.min(0.1, (t - last) / 1000)); last = t;
      // The round is over: play it again from the top.
      if (replay && pb.phase === "waiting") pb.restart();
      pb.update(dt); scene.frame(dt);
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      if (visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
    };
    // Only islands on screen are animated.
    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    seen.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    return () => { cancelAnimationFrame(raf); seen.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, [feed, lighting, replay]);
  return <canvas ref={ref} role="img" aria-label={label} className="block h-auto w-full" />;
}
