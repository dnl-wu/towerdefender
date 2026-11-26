"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { HomeIsland } from "@/viewer/HomeIsland";
import { LIGHTS, OPTION_GROUPS, styleKey, tierName, unlockRating, type IslandStyle } from "@/viewer/island-style";
import { LIGHTING } from "@/viewer/voxel";
import { saveIslandStyle, type SaveState } from "../actions";

const quiet = "cursor-pointer rounded-md border border-bronze bg-elevated px-3 py-1.5 text-sm font-medium hover:border-brass disabled:cursor-default disabled:opacity-50";
const primary = "cursor-pointer rounded-md bg-jade px-3 py-1.5 text-sm font-semibold text-charcoal hover:bg-[#93d3c3] disabled:cursor-default disabled:opacity-50";

const same = (a: IslandStyle, b: IslandStyle) => styleKey(a) === styleKey(b) && a.shape === b.shape && a.light === b.light;

/**
 * Your island and the controls that change it. Changes show at once and are kept
 * only when saved. While your agent is in a match the island is locked.
 */
export function IslandEditor({ handle, saved, peak, liveMatch }: { handle: string; saved: IslandStyle; peak: number; liveMatch: string | null }) {
  const [style, setStyle] = useState(saved);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveIslandStyle, {});
  const locked = liveMatch !== null;
  const changed = !same(style, saved);
  const set = <K extends keyof IslandStyle>(key: K, value: IslandStyle[K]) => setStyle((s) => ({ ...s, [key]: value }));

  return (
    <section aria-labelledby="your-island" className="grid gap-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <figure className="self-start overflow-hidden rounded-xl border border-bronze bg-charcoal md:sticky md:top-6">
        <div className="-mx-[3%] -mt-[11%] -mb-[1%]"><HomeIsland handle={handle} style={style} /></div>
        <figcaption className="border-t border-bronze bg-walnut px-3 py-2 text-xs text-sand">
          {changed ? <span className="text-honey">Previewing changes. Save to keep them.</span> : <>Your island, as it stands.</>}
        </figcaption>
      </figure>

      <form action={action} className="min-w-0">
        <h2 id="your-island" className="text-xl font-semibold">Your island</h2>
        <p className="mt-1 text-sm text-sand">Matches are played on their own map, the same for both players. Your colours dress your lane when people watch.</p>
        {locked && (
          <p className="mt-3 rounded-md border border-honey/40 bg-honey/10 px-3 py-2 text-sm text-honey">
            Your agent is in a match, so your island is locked until it ends. <Link className="underline underline-offset-2" href={`/match/${liveMatch}`}>Watch the match</Link>
          </p>
        )}
        <input type="hidden" name="style" value={JSON.stringify(style)} />
        <fieldset disabled={locked || pending} className="mt-4 space-y-4 disabled:opacity-60">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-limestone">Shape</span>
            <button type="button" className={quiet} onClick={() => set("shape", 1 + Math.floor(Math.random() * 999_999_999))}>Try another shape</button>
          </div>

          <div>
            <span id="light-label" className="text-xs font-medium text-limestone">Time of day</span>
            <div role="radiogroup" aria-labelledby="light-label" className="mt-1.5 flex rounded-md border border-bronze bg-charcoal p-0.5 text-sm">
              {LIGHTS.map((key) => (
                <button key={key} type="button" role="radio" aria-checked={style.light === key} onClick={() => set("light", key)}
                  className="flex-1 cursor-pointer rounded py-1 font-medium text-sand aria-checked:bg-elevated aria-checked:text-parchment">{LIGHTING[key].name}</button>
              ))}
            </div>
          </div>

          {OPTION_GROUPS.map((group) => (
            <div key={group.key}>
              <span id={`${group.key}-label`} className="text-xs font-medium text-limestone">{group.label}</span>
              <div role="radiogroup" aria-labelledby={`${group.key}-label`} className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-1.5">
                {Object.entries(group.options).map(([key, option]) => {
                  const unlock = "unlock" in option ? option.unlock : undefined;
                  const floor = unlockRating(unlock);
                  const closed = floor !== null && peak < floor;
                  const picked = style[group.key] === key;
                  return (
                    <button key={key} type="button" role="radio" aria-checked={picked} disabled={closed}
                      title={closed ? `Unlocks at ${tierName(unlock!)} (${floor} peak rating)` : option.name}
                      onClick={() => setStyle((s) => ({ ...s, [group.key]: key }))}
                      className="flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-md border border-transparent px-1 py-1.5 text-[11px] text-sand hover:bg-elevated aria-checked:border-jade aria-checked:text-parchment disabled:cursor-not-allowed disabled:hover:bg-transparent">
                      <span aria-hidden className="relative grid size-7 place-items-center">
                        <span className={`absolute inset-0 rounded-full ring-1 ring-black/40 ${closed ? "opacity-30" : ""}`} style={{ background: option.swatch }} />
                        {closed && <svg viewBox="0 0 16 16" className="relative size-3.5 fill-parchment"><path d="M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" /></svg>}
                      </span>
                      <span className="max-w-full truncate">{option.name}</span>
                      {closed && <span className="-mt-1 max-w-full truncate text-[10px] text-sand/70">{tierName(unlock!)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </fieldset>

        <div className="mt-5 flex items-center gap-3">
          <button className={primary} disabled={locked || pending || !changed}>{pending ? "Saving…" : "Save island"}</button>
          <button type="button" className={quiet} disabled={locked || pending || !changed} onClick={() => setStyle(saved)}>Revert</button>
          <p aria-live="polite" className={`text-xs ${state.error ? "text-terracotta" : "text-fern"}`}>{state.error ?? (changed ? "" : state.saved)}</p>
        </div>
        <p className="mt-3 text-xs text-sand">Locked colours open up as your peak rating reaches new tiers.</p>
      </form>
    </section>
  );
}
