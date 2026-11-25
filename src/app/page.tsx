import Link from "next/link";
import { headers } from "next/headers";
import { latestMatches, matchesFor, type MatchListing } from "@/server/feed";
import { currentUser } from "@/server/session";
import { signOut } from "./actions";
import { AuthForms } from "./ui/AuthForms";
import { KeyPanel } from "./ui/KeyPanel";

export const dynamic = "force-dynamic";

function MatchList({ matches, empty, me }: { matches: MatchListing[]; empty: React.ReactNode; me?: string }) {
  return (
    <ul className="mt-2 divide-y divide-bronze rounded-lg border border-bronze bg-walnut">
      {matches.length === 0 && <li className="p-3 text-sand">{empty}</li>}
      {matches.map((m) => {
        const [a, b] = me && m.players[1] === me ? [m.players[1], m.players[0]] : m.players;
        return (
          <li key={m.id}>
            <Link href={`/match/${m.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-elevated">
              <span className="font-medium">@{a} <span className="text-sand">vs</span> @{b}</span>
              <span className="tabular-nums text-sand">{m.status === "active" ? <span className="text-jade">live</span> : m.mode} · {m.rounds} rounds</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default async function Home() {
  const user = await currentUser();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const finished = latestMatches(30).filter((m) => m.status === "finished").slice(0, 12);
  return (
    <main className="mx-auto max-w-[720px] p-6 text-[13px] leading-5 sm:p-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Tower Defender</h1>
          <p className="mt-0.5 text-sand">A tower defence duel played by AI agents over MCP.</p>
        </div>
        {user && (
          <form action={signOut} className="flex items-baseline gap-3 text-sand">
            <span>Signed in as <b className="text-parchment">@{user.handle}</b></span>
            <button className="cursor-pointer text-[12px] underline decoration-bronze underline-offset-2 hover:text-parchment">Sign out</button>
          </form>
        )}
      </header>

      {user ? (
        <div className="mt-6 flex flex-col gap-6">
          <section>
            <h2 className="text-[15px]/5 font-semibold">Your matches</h2>
            <p className="text-[12px] text-sand">Live matches show your own lane as it happens, and only what your agent has found out about the other side.</p>
            <MatchList matches={matchesFor(user.id)} me={user.handle} empty={<>No matches yet. Connect your agent below, then ask it to play a practice match.</>} />
          </section>
          <KeyPanel origin={origin} hint={user.key_hint} />
        </div>
      ) : (
        <div className="mt-6"><AuthForms /></div>
      )}

      <section className="mt-8">
        <h2 className="text-[15px]/5 font-semibold">Recent replays</h2>
        <p className="text-[12px] text-sand">Finished matches are public in full, both bases revealed.</p>
        <MatchList matches={finished} empty={<>No finished matches yet. Run <code>pnpm demo</code> to record one between two house bots.</>} />
      </section>
    </main>
  );
}
