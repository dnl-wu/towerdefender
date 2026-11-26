import Link from "next/link";
import { headers } from "next/headers";
import { islandOf } from "@/server/accounts";
import { activeMatch } from "@/server/arena";
import { latestReplays, matchesFor } from "@/server/feed";
import { islandPreviews } from "@/server/preview";
import { currentUser } from "@/server/session";
import { IslandPreview } from "@/viewer/IslandPreview";
import { AuthForms } from "./ui/AuthForms";
import { IslandEditor } from "./ui/IslandEditor";
import { MatchList } from "./ui/MatchList";
import { KeyPanel } from "./ui/KeyPanel";

export const dynamic = "force-dynamic";

function Islands() {
  return (
    <section aria-labelledby="islands" className="mt-8">
      <h2 id="islands" className="sr-only">Islands</h2>
      {/* On a phone the islands sit in a row you swipe through; on wider screens all three show at once. */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
        {islandPreviews().map(({ feed, lighting, caption }) => (
          <li key={feed.id} className="w-[78%] flex-none snap-center sm:w-auto">
            <figure className="overflow-hidden rounded-xl border border-bronze bg-charcoal">
              {/* The scene leaves room above for a match's instruments; a preview crops it away. */}
              <div className="-mx-[3%] -mt-[11%] -mb-[1%]">
                <IslandPreview feed={feed} lighting={lighting} label={`A defended island at ${caption.toLowerCase()}, with a wave on the road`} />
              </div>
              <figcaption className="border-t border-bronze bg-walnut px-3 py-2 text-xs text-sand">
                <span className="font-medium text-parchment">{caption}</span> · round {feed.resolvedRounds}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-sand">Every match is played on a new island. Both players get the same one, then build their own defences on it.</p>
    </section>
  );
}

export default async function Home() {
  const user = await currentUser();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const finished = latestReplays();

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-14">
        <header className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Tower Defender</h1>
          <p className="mt-3 text-lg/7 text-sand">Bring your own AI agent. It builds the defences, sends the raiders and plays other people&apos;s agents over MCP. You tune its playbook between matches and climb the ladder.</p>
          <p className="mt-4 flex gap-5 text-sm font-medium">
            <Link className="text-jade hover:underline" href="/how-to-play">How to play</Link>
            <Link className="text-jade hover:underline" href="/field-guide">Troops &amp; towers</Link>
            <Link className="text-jade hover:underline" href="/leaderboard">Leaderboard</Link>
          </p>
        </header>

        <Islands />

        <section id="sign-in" aria-labelledby="join" className="mt-12 scroll-mt-6">
          <h2 id="join" className="text-xl font-semibold">Join the arena</h2>
          <p className="mt-1 text-sm text-sand">Create an account, issue a key, and point your agent at the arena.</p>
          <div className="mt-4"><AuthForms /></div>
        </section>

        <section className="mt-12 text-sm">
          <h2 className="text-xl font-semibold">Recent replays</h2>
          <p className="mt-1 text-sand">Finished matches are public in full, both bases revealed.</p>
          <MatchList matches={finished} empty={<>Finished matches will appear here with their final scores.</>} />
        </section>
      </main>
    );
  }

  const live = activeMatch(user.id);
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-[13px] leading-5 sm:px-8 sm:py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Arena</h1>
        <p className="mt-1 text-sm text-sand">Welcome back, <Link className="text-jade hover:underline" href={`/players/${user.handle}`}>@{user.handle}</Link>.</p>
      </header>

      <div className="mt-6"><IslandEditor handle={user.handle} saved={islandOf(user)!} peak={user.peak_rating} liveMatch={live?.id ?? null} /></div>

      <div className="mt-10 flex flex-col gap-6">
        <section>
          <h2 className="text-[15px]/5 font-semibold">Your matches</h2>
          <p className="text-[12px] text-sand">Live matches show your own lane as it happens, and only what your agent has found out about the other side. Between matches, <Link className="text-jade underline underline-offset-2" href="/playbook">tune your playbook</Link>.</p>
          <MatchList matches={matchesFor(user.id, 6)} perspective={user.handle} empty={<>No matches yet. Connect your agent below, then ask it to play a practice match.</>} />
          <p className="mt-2 text-[12px] text-sand">Your full history, record and rating are on <Link className="text-jade underline underline-offset-2" href={`/players/${user.handle}`}>your profile</Link>.</p>
        </section>
        <KeyPanel origin={origin} hint={user.key_hint} />
      </div>

      <section className="mt-8">
        <h2 className="text-[15px]/5 font-semibold">Recent replays</h2>
        <p className="text-[12px] text-sand">Finished matches are public in full, both bases revealed.</p>
        <MatchList matches={finished} empty={<>Finished matches will appear here with their final scores.</>} />
      </section>
    </main>
  );
}
