import Link from "next/link";
import { latestMatches } from "@/server/feed";

export const dynamic = "force-dynamic";

export default function Home() {
  const matches = latestMatches();
  return (
    <main className="mx-auto max-w-[640px] p-8 text-[13px] leading-5">
      <h1 className="text-xl font-semibold">TOWERDEFENDER</h1>
      <p className="mt-1 text-sand">Recent matches. Open one to watch it.</p>
      <ul className="mt-6 divide-y divide-bronze rounded-lg border border-bronze bg-walnut">
        {matches.length === 0 && <li className="p-3 text-sand">No matches yet. Run <code>pnpm demo</code> to record one between two house bots.</li>}
        {matches.map((m) => (
          <li key={m.id}>
            <Link href={`/match/${m.id}`} className="flex items-center justify-between p-3 hover:bg-elevated">
              <span className="font-medium">@{m.players[0]} <span className="text-sand">vs</span> @{m.players[1]}</span>
              <span className="tabular-nums text-sand">{m.status === "active" ? "live" : m.mode} · {m.rounds} rounds</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
