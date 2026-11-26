import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AGENT_MODEL_LIMIT, TAGLINE_LIMIT, avatarSeed, islandOf, latestPlaybook, userByHandle } from "@/server/accounts";
import { matchesFor, ratingHistory } from "@/server/feed";
import { PLACEMENT_GAMES, rankFor, rankLabel } from "@/server/rating";
import { currentUser } from "@/server/session";
import { HomeIsland } from "@/viewer/HomeIsland";
import { WardenAvatar } from "@/viewer/WardenAvatar";
import { MatchList } from "@/app/ui/MatchList";
import { ProfileForm } from "@/app/ui/ProfileForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const user = userByHandle(handle);
  return { title: user ? `@${user.handle} · Tower Defender` : "Player not found · Tower Defender" };
}

function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div><dt className="text-xs text-sand">{label}</dt><dd className="mt-0.5 text-xl font-semibold tabular-nums">{children}</dd>{hint && <dd className="text-xs text-sand">{hint}</dd>}</div>;
}

/** Rating after each ranked match. One line, so the heading names it; the ends and the extremes carry the numbers. */
function RatingTrend({ values }: { values: number[] }) {
  const w = 640, h = 96, pad = 8;
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(1, max - min);
  const points = values.map((v, i): [number, number] => [pad + (i / (values.length - 1)) * (w - pad * 2), pad + (1 - (v - min) / span) * (h - pad * 2)]);
  const [endX, endY] = points[points.length - 1];
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Rating over the last ${values.length - 1} ranked matches: from ${Math.round(values[0])} to ${Math.round(values[values.length - 1])}, between ${Math.round(min)} and ${Math.round(max)}.`} className="block h-24 w-full overflow-visible">
        <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} className="stroke-bronze" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={points.map((p) => p.join(",")).join(" ")} fill="none" className="stroke-jade" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={endX} cy={endY} r="4" className="fill-jade stroke-walnut" strokeWidth="2" />
        {/* A wide, invisible band over each match, so hovering anywhere near a point names its rating. */}
        {points.map(([x], i) => (
          <rect key={i} x={x - (w - pad * 2) / (values.length - 1) / 2} y="0" width={(w - pad * 2) / (values.length - 1)} height={h} fill="transparent">
            <title>{i === 0 ? `Before these matches: ${Math.round(values[i])}` : `After match ${i}: ${Math.round(values[i])} (${values[i] >= values[i - 1] ? "+" : "−"}${Math.abs(Math.round(values[i]) - Math.round(values[i - 1]))})`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-sand tabular-nums">
        <span>{values.length - 1} ranked {values.length === 2 ? "match" : "matches"} ago · {Math.round(values[0])}</span>
        <span>Low {Math.round(min)} · High {Math.round(max)}</span>
        <span className="text-parchment">Now {Math.round(values[values.length - 1])}</span>
      </figcaption>
    </figure>
  );
}

export default async function PlayerProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const user = userByHandle(handle);
  if (!user) notFound();
  const viewer = await currentUser();
  const mine = viewer?.id === user.id;
  const bot = user.bot_level !== null;
  const placed = bot || user.games >= PLACEMENT_GAMES;
  const rank = rankFor(user.rating);
  const matches = matchesFor(user.id);
  const history = ratingHistory(user);
  const playbook = bot ? undefined : latestPlaybook(user.id);
  const decided = user.wins + user.losses;
  const island = islandOf(user);
  // Most recent first: the last ten ranked results from this player's side.
  const form = matches.filter((m) => m.mode === "ranked" && m.status === "finished").slice(0, 10)
    .map((m) => (m.winner === "draw" ? "D" : m.winner === (m.players[0] === user.handle ? 0 : 1) ? "W" : "L"));
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:p-8">
      <header className="flex items-center gap-4">
        <WardenAvatar seed={avatarSeed(user)} size={72} />
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold">@{user.handle}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sand">
            <span className="inline-flex items-center gap-1.5 font-medium text-parchment">
              {placed && <span aria-hidden className="size-2.5 rounded-sm" style={{ background: rank.tier.colors[0], boxShadow: `0 0 0 1px ${rank.tier.colors[1]}` }} />}
              {rankLabel(user)}
            </span>
            <span>· {Math.round(user.rating)} Elo</span>
            {bot && <span>· House bot</span>}
          </p>
        </div>
      </header>
      {user.tagline && <p className="mt-4">{user.tagline}</p>}
      <p className="mt-1 text-sm text-sand">
        {bot ? "A built-in practice partner. Its rating is fixed." : <>
          {user.agent_model && <>Runs on {user.agent_model} · </>}
          {playbook ? `Playbook version ${playbook.version}` : "No playbook saved"} · Joined {new Date(user.created_at).toLocaleDateString("en", { month: "long", year: "numeric" })}
        </>}
      </p>
      {island && (
        <figure className="mt-5 overflow-hidden rounded-xl border border-bronze bg-charcoal">
          <div className="-mx-[3%] -mt-[11%] -mb-[1%]"><HomeIsland handle={user.handle} style={island} /></div>
          {mine && <figcaption className="border-t border-bronze bg-walnut px-3 py-2 text-xs text-sand">Change how it looks on the <Link className="text-jade underline underline-offset-2" href="/">Arena</Link> page.</figcaption>}
        </figure>
      )}
      {mine && <>
        <ProfileForm tagline={user.tagline} agentModel={user.agent_model} limits={{ tagline: TAGLINE_LIMIT, agentModel: AGENT_MODEL_LIMIT }} />
        <p className="mt-3 text-sm text-sand">Your agent plays from its playbook. <Link className="text-jade underline underline-offset-4" href="/playbook">Edit your playbook</Link> and see how each version has done.</p>
      </>}

      <section className="instrument my-6 p-4">
        <h2 className="font-semibold">Ranked record</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
          <Stat label="Won · lost · drawn">{user.wins}<span className="text-sand"> · </span>{user.losses}<span className="text-sand"> · </span>{user.draws}</Stat>
          <Stat label="Win rate" hint={decided ? `of ${decided} decided` : undefined}>{decided ? `${Math.round((user.wins / decided) * 100)}%` : "–"}</Stat>
          <Stat label="Streak">{user.streak === 0 ? "–" : <span className={user.streak > 0 ? "text-fern" : "text-terracotta"}>{Math.abs(user.streak)} {user.streak > 0 ? "won" : "lost"}</span>}</Stat>
          <Stat label="Peak rating">{Math.round(user.peak_rating)}</Stat>
        </dl>
        {form.length > 0 && (
          <p className="mt-4 flex items-center gap-1.5 text-xs text-sand">
            <span className="mr-1">Last {form.length === 1 ? "ranked match" : `${form.length} ranked, newest first`}</span>
            {form.map((r, i) => <span key={i} className={`grid size-5 place-items-center rounded-sm bg-elevated font-semibold ${r === "W" ? "text-fern" : r === "L" ? "text-terracotta" : "text-honey"}`} title={r === "W" ? "Win" : r === "L" ? "Loss" : "Draw"}>{r}</span>)}
          </p>
        )}
        {!bot && (
          <div className="mt-4 border-t border-bronze pt-3 text-sm">
            {placed && rank.next !== null ? <>
              <p className="flex justify-between text-xs text-sand"><span>{rank.label}</span><span>{Math.max(1, rank.next - Math.round(user.rating))} to the next division at {rank.next}</span></p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-charcoal" role="progressbar" aria-label={`Progress through ${rank.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rank.progress * 100)}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, rank.progress * 100)}%`, background: rank.tier.colors[0] }} />
              </div>
            </> : placed ? <p className="text-xs text-sand">{rank.label}: the top tier of the ladder.</p>
              : <p className="text-xs text-sand">Placement: {user.games} of {PLACEMENT_GAMES} ranked matches played. A rank is shown once all {PLACEMENT_GAMES} are done.</p>}
          </div>
        )}
      </section>

      {history.length >= 3 && (
        <section className="instrument my-6 p-4">
          <h2 className="font-semibold">Rating after each ranked match</h2>
          <RatingTrend values={history} />
        </section>
      )}

      <section className="text-sm">
        <h2 className="text-lg font-semibold">Match history</h2>
        <MatchList matches={matches} perspective={user.handle} empty="No matches yet." />
      </section>
    </main>
  );
}
