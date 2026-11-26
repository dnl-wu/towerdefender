"use client";

import { useEffect, useRef } from "react";
import { warden, type Mood } from "./models.ts";
import { LIGHTING, project, renderSprite } from "./voxel.ts";

/** Draw an account's warden framed on the face: the head's centre sits at the centre of the tile and the body runs off the bottom. */
export function drawWarden(cv: HTMLCanvasElement, seed: number, mood: Mood, size: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1), s = (size / 12.5) * dpr, sp = renderSprite(warden(seed, mood), s, LIGHTING.golden), k = cv.getContext("2d")!;
  cv.width = cv.height = size * dpr;
  k.clearRect(0, 0, cv.width, cv.height);
  const [hx, hy] = project(4, 4, 9.5, s);
  k.drawImage(sp.cv, Math.round(cv.width / 2 - (sp.ox + hx)), Math.round(cv.height / 2 - (sp.oy + hy)));
}

/** A still portrait of an account's warden, for profiles and the ladder. */
export function WardenAvatar({ seed, size = 40, className = "" }: { seed: number; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawWarden(ref.current, seed, "neutral", size); }, [seed, size]);
  return <canvas ref={ref} aria-hidden className={`block flex-none rounded-md bg-elevated ring-1 ring-bronze ring-inset ${className}`} style={{ width: size, height: size }} />;
}
