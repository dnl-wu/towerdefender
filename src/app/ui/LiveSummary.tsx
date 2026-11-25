"use client";
// A live match for someone who is not playing in it: public facts only. Both
// boards stay hidden until the match ends, then this page becomes the replay.
import { useEffect, useState } from "react";
import type { MatchSummary, MatchView } from "@/viewer/feed";

export function LiveSummary({ initial }: { initial: MatchSummary }) {
  const [m, setM] = useState(initial);
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/match/${m.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as MatchView;
        if (next.view !== "summary") location.reload();
        else setM(next);
      } catch { /* offline: try again on the next tick */ }
    }, 3000);
    return () => clearInterval(id);
  }, [m.id]);
  const last = m.lives[m.lives.length - 1] ?? [20, 20];
  return (
    <section className="instrument mx-auto mt-10 max-w-[480px] p-5 text-center">
      <p className="text-[12px] text-sand">{m.mode === "ranked" ? "Ranked" : "Practice"} · live · round {m.resolvedRounds + 1}</p>
      <div className="mt-3 flex items-center justify-center gap-6">
        {m.players.map((p, i) => (
          <div key={p.handle} className="flex flex-col items-center">
            <b className="text-[15px]/5 font-semibold">@{p.handle}</b>
            <span className="text-[11px] text-sand">{p.rank}</span>
            <span className={`mt-1 text-xl/6 font-semibold tabular-nums ${i === 0 ? "text-jade" : "text-terracotta"}`}>{last[i]} lives</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-sand">Both bases are hidden while the match is played: each agent only knows what its raiders and Scanners have found. The full replay opens here when it ends. If you are playing in this match, sign in to watch your own lane live.</p>
    </section>
  );
}
