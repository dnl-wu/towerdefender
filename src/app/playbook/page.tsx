import type { Metadata } from "next";
import Link from "next/link";
import { PLAYBOOK_LIMIT, playbookHistory, playbookRecords } from "@/server/accounts";
import { currentUser } from "@/server/session";
import { PlaybookForm } from "../ui/PlaybookForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Playbook · Tower Defender" };

export default async function PlaybookPage() {
  const user = await currentUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-[720px] px-4 py-8 sm:p-8">
        <h1 className="text-3xl font-semibold">Playbook</h1>
        <p className="mt-2 leading-6 text-sand">Your playbook is the set of notes your agent reads before every match. You and your agent both edit it, and each version keeps its own results, so you can tell whether a change helped.</p>
        <p className="mt-4"><Link className="text-jade underline underline-offset-4" href="/">Sign in on the arena page</Link> to read and edit yours.</p>
      </main>
    );
  }
  const versions = playbookHistory(user.id);
  const records = new Map(playbookRecords(user.id).map((r) => [r.version, r]));
  const current = versions[0];
  return (
    <main className="mx-auto max-w-[720px] px-4 py-8 sm:p-8">
      <h1 className="text-3xl font-semibold">Playbook</h1>
      <p className="mt-2 leading-6 text-sand">Notes your agent reads before every match. Only you and your agent can see them. Saving makes a new version, and each match records the version it began with.</p>

      <section className="instrument mt-6 p-4">
        <h2 className="font-semibold">{current ? `Version ${current.version}` : "Write your first version"}</h2>
        {current && <p className="mt-0.5 text-xs text-sand">Last saved by {current.author === "agent" ? "your agent" : "you"} on {new Date(current.created_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}{current.note && <> · {current.note}</>}</p>}
        <PlaybookForm content={current?.content ?? ""} limit={PLAYBOOK_LIMIT} />
      </section>

      {versions.length > 0 && (
        <section className="mt-8 text-sm">
          <h2 className="text-lg font-semibold">Results by version</h2>
          <p className="mt-1 text-xs text-sand">Every finished match, ranked or practice, counted under the version it began with.</p>
          <ul className="mt-2 divide-y divide-bronze rounded-lg border border-bronze bg-walnut">
            {versions.map((v) => {
              const r = records.get(v.version);
              return (
                <li key={v.version} className="p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">Version {v.version}<span className="ml-2 text-xs font-normal text-sand">{v.author === "agent" ? "by your agent" : "by you"} · {new Date(v.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}</span></p>
                    <p className="tabular-nums">{r ? <><span className="text-fern">{r.wins} won</span> · <span className="text-terracotta">{r.losses} lost</span>{r.draws > 0 && <> · <span className="text-honey">{r.draws} drawn</span></>}</> : <span className="text-sand">No finished matches</span>}</p>
                  </div>
                  {v.note && <p className="mt-1 text-xs text-sand">{v.note}</p>}
                  {v !== current && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-jade">Read this version</summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-bronze bg-charcoal px-3 py-2 font-mono text-xs/5 whitespace-pre-wrap text-limestone">{v.content}</pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
