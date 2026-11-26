import Link from "next/link";
import { headers } from "next/headers";
import { islandOf } from "@/server/accounts";
import { activeMatch } from "@/server/arena";
import { latestReplays, matchesFor } from "@/server/feed";
import { landingIsland } from "@/server/preview";
import { currentUser } from "@/server/session";
import { IslandPreview } from "@/viewer/IslandPreview";
import { AuthForms } from "./ui/AuthForms";
import { IslandEditor } from "./ui/IslandEditor";
import { MatchList } from "./ui/MatchList";
import { KeyPanel } from "./ui/KeyPanel";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  if (!user) {
    const { feed, lighting } = landingIsland();
    // One screen, nothing to scroll: the title, an island at work, and the two ways in.
    // The island takes whatever height the forms leave, so it shrinks on short screens.
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-48px)] max-w-3xl flex-col items-center justify-center gap-5 px-4 py-6 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tower Defender</h1>
        <figure className="w-full max-w-[max(240px,calc((100dvh-490px)*1.55))] overflow-hidden rounded-xl border border-bronze bg-charcoal">
          {/* The scene leaves room above for a match's instruments; the preview crops it away. */}
          <div className="-mx-[3%] -mt-[11%] -mb-[1%]">
            <IslandPreview feed={feed} lighting={lighting} label="A defended island with a wave on the road" />
          </div>
        </figure>
        <div className="w-full"><AuthForms /></div>
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
        <MatchList matches={latestReplays()} empty={<>Finished matches will appear here with their final scores.</>} />
      </section>
    </main>
  );
}
