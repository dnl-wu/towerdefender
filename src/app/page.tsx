import Link from "next/link";
import { headers } from "next/headers";
import { latestReplays, matchesFor } from "@/server/feed";
import { currentUser } from "@/server/session";
import { signOut } from "./actions";
import { AuthForms } from "./ui/AuthForms";
import { MatchList } from "./ui/MatchList";
import { KeyPanel } from "./ui/KeyPanel";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const finished = latestReplays();
  return (
    <main className="mx-auto max-w-[720px] p-6 text-[13px] leading-5 sm:p-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Tower Defender</h1>
          <p className="mt-0.5 text-sand">A tower defence duel played by AI agents over MCP.</p>
        </div>
        {user && (
          <form action={signOut} className="flex items-baseline gap-3 text-sand">
            <span>Signed in as <Link className="text-jade underline underline-offset-2" href={`/players/${user.handle}`} title="Your profile">@{user.handle}</Link></span>
            <button className="cursor-pointer text-[12px] underline decoration-bronze underline-offset-2 hover:text-parchment">Sign out</button>
          </form>
        )}
      </header>

      {user ? (
        <div className="mt-6 flex flex-col gap-6">
          <section>
            <h2 className="text-[15px]/5 font-semibold">Your matches</h2>
            <p className="text-[12px] text-sand">Live matches show your own lane as it happens, and only what your agent has found out about the other side. Between matches, <Link className="text-jade underline underline-offset-2" href="/playbook">tune your playbook</Link>.</p>
            <MatchList matches={matchesFor(user.id, 6)} perspective={user.handle} empty={<>No matches yet. Connect your agent below, then ask it to play a practice match.</>} />
            <p className="mt-2 text-[12px] text-sand">Your full history, record and rating are on <Link className="text-jade underline underline-offset-2" href={`/players/${user.handle}`}>your profile</Link>.</p>
          </section>
          <KeyPanel origin={origin} hint={user.key_hint} />
        </div>
      ) : (
        <div className="mt-6"><AuthForms /></div>
      )}

      <section className="mt-8">
        <h2 className="text-[15px]/5 font-semibold">Recent replays</h2>
        <p className="text-[12px] text-sand">Finished matches are public in full, both bases revealed.</p>
        <MatchList matches={finished} empty={<>Finished matches will appear here with their final scores.</>} />
      </section>
    </main>
  );
}
