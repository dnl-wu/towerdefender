"use client";

import { useEffect, useState } from "react";
import { UNITS, type TowerType, type UnitType } from "../engine/data.ts";
import { UNIT_ART, towerModel } from "./models.ts";
import { C } from "./palette.ts";
import { LIGHTING, blank, outlined, renderSprite } from "./voxel.ts";

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
type Piece = { unit: UnitType; tower?: never; level?: never } | { unit?: never; tower: TowerType; level: number };

function PieceIcon({ unit, tower, level, size }: Piece & { size: string }) {
  const key = unit !== undefined ? "u:" + unit : `t:${tower}:${level}`;
  // Icons are drawn in the browser. One already drawn shows at once; a new one appears after the first paint.
  const [src, setSrc] = useState(() => iconCache.get(key));
  useEffect(() => {
    setSrc(unit !== undefined ? modelIcon(key, () => UNIT_ART[unit].model()) : modelIcon(key, () => towerModel(tower, level)));
  }, [key, unit, tower, level]);
  const tile = `block ${size} flex-none rounded-md bg-linear-to-b from-[#cfc1a4] to-[#b1a385] ring-1 ring-inset ring-charcoal/55`;
  // Until then an empty tile of the same size holds the place: an <img> with no source would show its alt text.
  return src ? <img src={src} alt={unit ? UNITS[unit].name : ""} className={tile} /> : <span aria-hidden className={tile} />;
}

export function UnitIcon({ unit, size = "size-7" }: { unit: UnitType; size?: string }) {
  return <PieceIcon unit={unit} size={size} />;
}

export function TowerIcon({ type, level, size = "size-7" }: { type: TowerType; level: number; size?: string }) {
  return <PieceIcon tower={type} level={level} size={size} />;
}
