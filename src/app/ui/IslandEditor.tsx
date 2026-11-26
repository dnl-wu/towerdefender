"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { HomeIsland } from "@/viewer/HomeIsland";
import { LIGHTS, OPTION_GROUPS, styleKey, type IslandStyle } from "@/viewer/island-style";
import { LIGHTING } from "@/viewer/voxel";
import { saveIslandStyle, type SaveState } from "../actions";

const button = "cursor-pointer rounded-md px-2.5 py-1 text-[13px] font-medium disabled:cursor-default disabled:opacity-40";
const quiet = `${button} border border-bronze bg-elevated hover:border-brass`;
const primary = `${button} bg-jade font-semibold text-charcoal hover:bg-[#93d3c3]`;
/** A segmented control: one rounded track, the chosen segment raised. */
const track = "flex rounded-lg bg-charcoal p-0.5 ring-1 ring-bronze";
const segment = "flex-1 cursor-pointer rounded-md px-2 py-1 text-[12px] font-medium text-sand hover:text-parchment aria-checked:bg-elevated aria-checked:text-parchment aria-checked:shadow-sm aria-selected:bg-elevated aria-selected:text-parchment aria-selected:shadow-sm";

const same = (a: IslandStyle, b: IslandStyle) => styleKey(a) === styleKey(b) && a.shape === b.shape && a.light === b.light;

type GroupKey = (typeof OPTION_GROUPS)[number]["key"];

/**
 * Your island in one panel, laid out like a settings pane on a Mac: a title bar
 * with the save controls, the island, and a sidebar that switches between what
 * can be changed. Changes show at once and are kept only when saved. While your
 * agent is in a match the island is locked.
 */
export function IslandEditor({ handle, saved, liveMatch }: { handle: string; saved: IslandStyle; liveMatch: string | null }) {
  const [style, setStyle] = useState(saved);
  const [tab, setTab] = useState<GroupKey>("turf");
  const [state, action, pending] = useActionState<SaveState, FormData>(saveIslandStyle, {});
  const locked = liveMatch !== null;
  const changed = !same(style, saved);
  const set = <K extends keyof IslandStyle>(key: K, value: IslandStyle[K]) => setStyle((s) => ({ ...s, [key]: value }));
  const group = OPTION_GROUPS.find((g) => g.key === tab)!;
  const status = state.error ?? (changed ? "Edited" : state.saved);

  return (
    <form action={action} aria-labelledby="your-island" className="overflow-hidden rounded-xl border border-bronze bg-walnut shadow-lg shadow-black/20">
      <input type="hidden" name="style" value={JSON.stringify(style)} />

      {/* Title bar: the name and whether there is anything unsaved on the left, the actions on the right. */}
      <header className="flex h-11 items-center gap-3 border-b border-bronze bg-elevated/40 px-4">
        <h2 id="your-island" className="text-[13px] font-semibold">Your island</h2>
        <p aria-live="polite" className={`min-w-0 flex-1 truncate text-[12px] ${state.error ? "text-terracotta" : changed ? "text-honey" : "text-sand"}`}>{status}</p>
        <button type="button" className={quiet} disabled={locked || pending || !changed} onClick={() => setStyle(saved)}>Revert</button>
        <button className={primary} disabled={locked || pending || !changed}>{pending ? "Saving…" : "Save"}</button>
      </header>

      {locked && (
        <p className="border-b border-honey/30 bg-honey/10 px-4 py-2 text-[12px] text-honey">
          Your agent is in a match, so your island is locked until it ends. <Link className="underline underline-offset-2" href={`/match/${liveMatch}`}>Watch the match</Link>
        </p>
      )}

      <div className="grid md:grid-cols-[minmax(0,1fr)_272px]">
        {/* The island fills its half of the panel whatever the sidebar's height, cropped from the top, where the scene keeps room for a match's instruments. */}
        <div className="relative aspect-[1.55] overflow-hidden bg-charcoal md:aspect-auto [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:size-full [&_canvas]:object-cover [&_canvas]:object-bottom">
          <HomeIsland handle={handle} style={style} />
        </div>

        <fieldset disabled={locked || pending} className="flex min-w-0 flex-col gap-4 border-t border-bronze p-4 disabled:opacity-50 md:border-t-0 md:border-l">
          <div role="tablist" aria-label="Part of the island" className={track}>
            {OPTION_GROUPS.map((g) => (
              <button key={g.key} type="button" role="tab" id={`tab-${g.key}`} aria-controls="island-options" aria-selected={tab === g.key}
                onClick={() => setTab(g.key)} className={segment}>{g.key === "crystal" ? "Crystal" : g.label}</button>
            ))}
          </div>

          {/* The chosen part's options, as a short list with the current one ticked. Beside the island, room for the longest list, so the panel keeps its size between tabs. */}
          <div id="island-options" role="tabpanel" aria-labelledby={`tab-${tab}`} className="md:min-h-[164px]">
            <div role="radiogroup" aria-label={group.label} className="flex flex-col">
              {Object.entries(group.options).map(([key, option]) => (
                <button key={key} type="button" role="radio" aria-checked={style[tab] === key}
                  onClick={() => setStyle((s) => ({ ...s, [tab]: key }))}
                  className="group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-sand hover:bg-elevated/60 aria-checked:text-parchment">
                  <span aria-hidden className="size-5 flex-none rounded-full ring-1 ring-black/40" style={{ background: option.swatch }} />
                  <span className="flex-1 truncate">{option.name}</span>
                  <svg aria-hidden viewBox="0 0 16 16" className="invisible size-3.5 fill-none stroke-jade stroke-2 group-aria-checked:visible"><path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3 border-t border-bronze pt-4">
            <div className="flex flex-col gap-1.5">
              <span id="light-label" className="text-[12px] text-limestone">Time of day</span>
              <div role="radiogroup" aria-labelledby="light-label" className={track}>
                {LIGHTS.map((key) => (
                  <button key={key} type="button" role="radio" aria-checked={style.light === key} aria-label={LIGHTING[key].name}
                    onClick={() => set("light", key)} className={segment}>{LIGHTING[key].name.split(" ")[0]}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-limestone">Shape</span>
              <button type="button" className={quiet} onClick={() => set("shape", 1 + Math.floor(Math.random() * 999_999_999))}>Shuffle</button>
            </div>
          </div>
        </fieldset>
      </div>
    </form>
  );
}
