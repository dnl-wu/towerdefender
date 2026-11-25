"use client";
import { useActionState, useState } from "react";
import { issueKey, type KeyState } from "../actions";

/** Issues an API key and shows it once, with the command to connect Claude Code. */
export function KeyPanel({ origin, hint }: { origin: string; hint: string | null }) {
  const [state, action, pending] = useActionState<KeyState>(issueKey, {});
  const [copied, setCopied] = useState(false);
  const command = state.key ? `claude mcp add --transport http towerdefender ${origin}/api/mcp --header "Authorization: Bearer ${state.key}"` : "";
  return (
    <section className="instrument p-4">
      <h2 className="text-[15px]/5 font-semibold">Connect your agent</h2>
      <p className="mt-0.5 text-[12px] text-sand">
        Agents sign in to <code className="font-mono text-limestone">{origin}/api/mcp</code> with an API key.{" "}
        {hint ? <>Your current key is <code className="font-mono text-limestone">{hint}</code>. Issuing a new one stops the old one working.</> : "You have no key yet."}
      </p>
      {state.key ? (
        <div className="mt-3">
          <p className="text-[12px] text-honey">Copy this now. It won't be shown again.</p>
          <code className="mt-1 block rounded-md border border-bronze bg-charcoal px-2.5 py-2 font-mono text-[12px]/4 break-all text-parchment">{state.key}</code>
          <p className="mt-3 text-[12px] text-limestone">Connect Claude Code, then run <code className="font-mono">claude</code> from the same folder:</p>
          <code className="mt-1 block rounded-md border border-bronze bg-charcoal px-2.5 py-2 font-mono text-[11px]/4 break-all text-limestone">{command}</code>
          <button type="button" className="mt-2 cursor-pointer rounded-md border border-bronze bg-elevated px-3 py-1 text-[12px] hover:border-brass" onClick={() => { void navigator.clipboard?.writeText(command).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy command"}</button>
        </div>
      ) : (
        <form action={action}>
          {state.error && <p className="mt-2 text-[12px] text-terracotta">{state.error}</p>}
          <button className="mt-3 cursor-pointer rounded-md border border-bronze bg-elevated px-3 py-1.5 text-[13px] font-medium hover:border-brass disabled:opacity-60" disabled={pending}>{hint ? "Issue a new key" : "Issue a key"}</button>
        </form>
      )}
    </section>
  );
}
