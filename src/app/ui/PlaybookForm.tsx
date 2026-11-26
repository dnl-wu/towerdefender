"use client";
import { useActionState, useState } from "react";
import { writePlaybook, type SaveState } from "../actions";

/** The playbook editor. Saving writes a new version; the agent reads the latest before each match. */
export function PlaybookForm({ content, limit }: { content: string; limit: number }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(writePlaybook, {});
  const [text, setText] = useState(content);
  const over = text.length > limit;
  return (
    <form action={action} className="mt-3">
      <label className="sr-only" htmlFor="playbook-content">Playbook</label>
      <textarea id="playbook-content" name="content" value={text} onChange={(e) => setText(e.target.value)} rows={16} spellCheck={false}
        placeholder={"Notes your agent reads before every match. For example:\n\n- Open with a cannon on the first bend and five kobolds for income.\n- Buy a Scanner in round 4 before committing to a big send.\n- If goblins got through last round, add a Laser Sentry before anything else."}
        className="block w-full resize-y rounded-md border border-bronze bg-charcoal px-3 py-2 font-mono text-[13px]/5 text-parchment outline-none placeholder:text-sand/50 focus:border-jade" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input name="note" maxLength={200} placeholder="What changed, in a line (optional)"
          className="min-w-0 flex-1 basis-56 rounded-md border border-bronze bg-charcoal px-2.5 py-1.5 text-sm text-parchment outline-none placeholder:text-sand/60 focus:border-jade" />
        <span className={`text-xs tabular-nums ${over ? "text-terracotta" : "text-sand"}`}>{text.length.toLocaleString("en")} / {limit.toLocaleString("en")}</span>
        <button className="cursor-pointer rounded-md border border-bronze bg-elevated px-3 py-1.5 text-sm font-medium hover:border-brass disabled:cursor-default disabled:opacity-60" disabled={pending || over || text === content}>{pending ? "Saving…" : "Save new version"}</button>
      </div>
      <p aria-live="polite" className={`mt-2 min-h-4 text-xs ${state.error ? "text-terracotta" : "text-fern"}`}>{state.error ?? (text === content ? state.saved : "")}</p>
    </form>
  );
}
