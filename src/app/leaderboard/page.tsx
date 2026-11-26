import type { Metadata } from "next";
import Link from "next/link";
import { avatarSeed, leaderboard, type User } from "@/server/accounts";
import { PLACEMENT_GAMES, rankFor } from "@/server/rating";
import { currentUser } from "@/server/session";
import { WardenAvatar } from "@/viewer/WardenAvatar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard · Tower Defender" };

/** On a phone the rank column is dropped, so the rank takes the tagline's place under the handle. */
function Player({ user, rank }: { user: User; rank?: string }) {
  return (
    <Link href={`/players/${user.handle}`} className="group flex min-w-0 items-center gap-3">
      <WardenAvatar seed={avatarSeed(user)} size={32} />
      <span className="min-w-0">
        <span className="block truncate font-medium group-hover:underline">@{user.handle}{user.bot_level !== null && <span className="ml-2 text-xs font-normal text-sand">house bot</span>}</span>
        {user.tagline && <span className={`block truncate text-xs text-sand ${rank ? "max-sm:hidden" : ""}`}>{user.tagline}</span>}
        {rank && <span className="block truncate text-xs text-sand sm:hidden">{rank}</span>}
      </span>
    </Link>
  );
}

export default async function Leaderboard() {
  const me = await currentUser();
  const everyone = leaderboard(100);
  // House bots are fixed rungs to measure against. People join the ladder once their placement matches are played.
  const ladder = everyone.filter((u) => u.bot_level !== null || u.games >= PLACEMENT_GAMES);
  const placing = everyone.filter((u) => u.bot_level === null && u.games < PLACEMENT_GAMES);
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:p-8">
      <h1 className="text-3xl font-semibold">Leaderboard</h1>
      <p className="mt-2 text-sand">Ranked results move your Elo rating. House bots hold fixed ratings, so they mark the rungs to climb past.</p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-bronze bg-walnut">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-sand">
            <tr className="border-b border-bronze [&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
              <th className="w-10 text-right">#</th><th>Player</th><th className="max-sm:hidden">Rank</th><th className="text-right">Rating</th>
              <th className="text-right max-sm:hidden">Won · lost · drawn</th><th className="text-right max-sm:hidden">Streak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bronze">
            {ladder.map((user, i) => {
              const rank = rankFor(user.rating);
              return (
                <tr key={user.id} className={`[&>td]:px-3 [&>td]:py-2 ${me?.id === user.id ? "bg-elevated" : ""}`}>
                  <td className="text-right text-sand tabular-nums">{i + 1}</td>
                  <td className="w-full max-w-0 sm:w-1/2"><Player user={user} rank={rank.label} /></td>
                  <td className="whitespace-nowrap max-sm:hidden"><span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: rank.tier.colors[0], boxShadow: `0 0 0 1px ${rank.tier.colors[1]}` }} />{rank.label}</span></td>
                  <td className="text-right font-semibold tabular-nums">{Math.round(user.rating)}</td>
                  <td className="text-right tabular-nums max-sm:hidden">{user.wins} · {user.losses} · {user.draws}</td>
                  <td className={`text-right tabular-nums max-sm:hidden ${user.streak > 0 ? "text-fern" : user.streak < 0 ? "text-terracotta" : "text-sand"}`}>{user.streak === 0 ? "–" : `${Math.abs(user.streak)} ${user.streak > 0 ? "won" : "lost"}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {placing.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">In placement</h2>
          <p className="mt-1 text-sm text-sand">A rank is shown after {PLACEMENT_GAMES} ranked matches.</p>
          <ul className="mt-3 divide-y divide-bronze rounded-lg border border-bronze bg-walnut text-sm">
            {placing.map((user) => (
              <li key={user.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${me?.id === user.id ? "bg-elevated" : ""}`}>
                <Player user={user} />
                <span className="flex-none text-sand tabular-nums">{user.games} of {PLACEMENT_GAMES} played</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
