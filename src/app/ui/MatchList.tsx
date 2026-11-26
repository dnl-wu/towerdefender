import Link from "next/link";
import type { MatchListing } from "@/server/feed";
import { scoreLine } from "./score";
import { ago } from "./time";

const TONES = { Win: "text-fern", Loss: "text-terracotta", Draw: "text-honey", Live: "text-jade" } as const;

/**
 * Matches, newest first. With a `perspective` handle the list reads from that
 * player's side: they come first, and results are their wins and losses.
 */
export function MatchList({ matches, empty, perspective }: { matches: MatchListing[]; empty: React.ReactNode; perspective?: string }) {
  return (
    <ul className="mt-2 divide-y divide-bronze rounded-lg border border-bronze bg-walnut">
      {matches.length === 0 && <li className="p-3 text-sand">{empty}</li>}
      {matches.map(match => {
        const first = match.players[1] === perspective ? 1 : 0;
        const second = first === 0 ? 1 : 0;
        const finished = match.status === "finished";
        const score = scoreLine(match.lives, match.end);
        let outcome: React.ReactNode = <strong className={TONES.Live}>Live</strong>;
        if (match.winner === "draw") outcome = <strong className={TONES.Draw}>Draw</strong>;
        else if (match.winner !== null && perspective) {
          const result = match.winner === first ? "Win" : "Loss";
          outcome = <strong className={TONES[result]}>{result}</strong>;
        } else if (match.winner !== null) outcome = <strong className="text-parchment">@{match.players[match.winner]} won</strong>;
        else if (finished) outcome = <strong className="text-sand">Finished</strong>;
        const change = perspective ? match.ratingChange[first] : null;
        return (
          <li key={match.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3">
            <div>
              <p className="font-medium">
                <Link className="hover:underline" href={`/players/${match.players[first]}`}>@{match.players[first]}</Link>
                <span className="px-1 text-sand">vs</span>
                <Link className="hover:underline" href={`/players/${match.players[second]}`}>@{match.players[second]}</Link>
              </p>
              <p className="mt-1 text-xs text-sand"><span className="capitalize">{match.mode}</span> · {match.rounds} {match.rounds === 1 ? "round" : "rounds"} · {finished ? ago(match.at) : `started ${ago(match.at)}`}</p>
            </div>
            <Link href={`/match/${match.id}`} className="group rounded px-1 py-1 text-right hover:bg-elevated">
              <span className="block">
                {outcome}
                {finished && <span className="ml-2 tabular-nums" title="Core lives when the match ended">{score.lives[first]} – {score.lives[second]}</span>}
                {change !== null && <span className={`ml-2 text-xs tabular-nums ${change > 0 ? "text-fern" : change < 0 ? "text-terracotta" : "text-sand"}`} title="Rating change">{change > 0 ? "+" : change < 0 ? "−" : "±"}{Math.abs(change)}</span>}
              </span>
              <span className="block text-xs text-sand">
                {score.note && finished && <>{score.note} · </>}
                <span className="text-jade underline underline-offset-2">{finished ? "Watch replay" : "Watch match"}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
