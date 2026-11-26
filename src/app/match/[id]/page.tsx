import Link from "next/link";
import { notFound } from "next/navigation";
import { endKind } from "@/engine/duel";
import { matchView } from "@/server/feed";
import { currentUser } from "@/server/session";
import { MatchViewer } from "@/viewer/MatchViewer";
import { LiveSummary } from "../../ui/LiveSummary";
import { scoreLine } from "../../ui/score";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const view = matchView(id, user?.id);
  if (!view) notFound();
  if (view.view === "summary") return <main className="p-4"><LiveSummary initial={view} /></main>;
  const score = view.finalLives ? scoreLine(view.finalLives, endKind(view.endReason)) : null;
  return (
    // Sized so the whole miniature, with its instruments, fits the window without scrolling.
    <main className={`mx-auto w-full p-2 sm:p-4 ${view.finalLives ? "max-w-[min(1120px,calc((100dvh_-_176px)*1.39))]" : "max-w-[min(1120px,calc((100dvh_-_80px)*1.39))]"}`}>
      {score && (
        <header className="mb-3 rounded-lg border border-bronze bg-walnut px-4 py-3 text-sm">
          <h1 className="font-semibold text-honey">{view.winner === "draw" ? "Draw" : typeof view.winner === "number" ? `@${view.players[view.winner].handle} won` : "Match finished"}</h1>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            {view.players.map((player, seat) => {
              const change = view.mode === "ranked" && !player.houseBot && player.ratingBefore !== null && player.ratingAfter !== null ? Math.round(player.ratingAfter) - Math.round(player.ratingBefore) : null;
              return (
                <span key={seat}>
                  <Link className="text-jade hover:underline" href={`/players/${player.handle}`}>@{player.handle}</Link>
                  <b className="ml-2 font-semibold tabular-nums">{score.lives[seat]}</b> {score.lives[seat] === "1" ? "life" : "lives"}
                  {change !== null && <span className={`ml-2 text-xs tabular-nums ${change > 0 ? "text-fern" : change < 0 ? "text-terracotta" : "text-sand"}`}>{change > 0 ? "+" : change < 0 ? "−" : "±"}{Math.abs(change)} rating</span>}
                </span>
              );
            })}
          </p>
          <p className="mt-1 text-xs text-sand"><span className="capitalize">{view.mode}</span> · {view.resolvedRounds} {view.resolvedRounds === 1 ? "round" : "rounds"}{view.endReason && <> · {view.endReason}</>}</p>
        </header>
      )}
      <MatchViewer initial={view} pollUrl={`/api/match/${id}`} />
    </main>
  );
}
