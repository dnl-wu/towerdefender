"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import type { AgentState } from "@/server/accounts";
import { issueKey, type KeyState } from "../actions";

const quiet = "cursor-pointer rounded-md border border-bronze bg-elevated px-2.5 py-1 text-[12px] font-medium hover:border-brass disabled:cursor-default disabled:opacity-60";
const primary = "cursor-pointer rounded-md bg-jade px-3 py-1.5 text-[13px] font-semibold text-charcoal hover:bg-[#93d3c3] disabled:cursor-default disabled:opacity-60";

const DOTS: Record<AgentState, string> = { none: "bg-sand/50", waiting: "bg-honey motion-safe:animate-pulse", active: "bg-fern", idle: "bg-sand" };

/** "claude-code" reads as "Claude Code". */
const clientLabel = (name: string) => name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Your agent's connection. Until an agent has used your key this is the page's
 * call to action: issue a key, run one command. Once it has, it folds down to a
 * single line saying the agent is connected and when it was last heard from,
 * and the key is one click away for when it needs replacing.
 */
export function AgentConnection({ origin, hint, state, client, seen }: {
  origin: string; hint: string | null; state: AgentState; client: string; seen: string | null;
}) {
  const router = useRouter();
  const [keyState, action, pending] = useActionState<KeyState>(issueKey, {});
  const [managing, setManaging] = useState(false);
  const [copied, setCopied] = useState(false);
  const connected = state === "active" || state === "idle";
  // Open until an agent has connected; a new key is shown while it waits, and folds away once the agent is using it.
  const open = !connected || managing;
  // A new key is shown in full only until an agent is using it.
  const shown = connected ? undefined : keyState.key;
  const command = shown ? `claude mcp add --transport http towerdefender ${origin}/api/mcp --header "Authorization: Bearer ${shown}"` : "";

  // While a key waits for its agent, look again every few seconds, so the page turns to connected by itself.
  useEffect(() => {
    if (state !== "waiting") return;
    const timer = setInterval(() => { if (!document.hidden) router.refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [state, router]);

  const title = { none: "Connect your agent", waiting: "Waiting for your agent", active: "Agent connected", idle: "Agent connected" }[state];
  const detail = connected
    ? [client && clientLabel(client), state === "active" ? "active now" : `last active ${seen}`].filter(Boolean).join(" · ")
    : state === "waiting" ? "Run the command below where your agent lives. This page updates when it connects." : "Issue a key, then point your agent at the arena.";

  return (
    <section aria-labelledby="agent-title" className={`instrument ${open ? "p-4" : "px-4 py-2.5"}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden className={`size-2 flex-none rounded-full ${DOTS[state]}`} />
        <div className="min-w-0 flex-1">
          <h2 id="agent-title" className="text-[13px] font-semibold">{title}</h2>
          <p className="truncate text-[12px] text-sand">{detail}</p>
        </div>
        {connected && (
          <button type="button" className={quiet} aria-expanded={managing} onClick={() => setManaging((m) => !m)}>{managing ? "Done" : "Manage key"}</button>
        )}
      </div>

      {open && (
        <div className="mt-3 border-t border-bronze pt-3 text-[12px]">
          <p className="text-sand">
            Agents connect to <code className="font-mono text-limestone">{origin}/api/mcp</code> with an API key.{" "}
            {hint && !shown && <>Your key is <code className="font-mono text-limestone">{hint}</code>. A new one stops the old one working.</>}
          </p>
          {shown ? (
            <div className="mt-3">
              <p className="text-honey">Copy this now. It won&apos;t be shown again.</p>
              <code className="mt-1 block rounded-md border border-bronze bg-charcoal px-2.5 py-2 font-mono text-[12px]/4 break-all text-parchment">{shown}</code>
              <p className="mt-3 text-limestone">Connect Claude Code, then run <code className="font-mono">claude</code> from the same folder:</p>
              <code className="mt-1 block rounded-md border border-bronze bg-charcoal px-2.5 py-2 font-mono text-[11px]/4 break-all text-limestone">{command}</code>
              <button type="button" className={`mt-2 ${quiet}`} onClick={() => { void navigator.clipboard?.writeText(command).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy command"}</button>
            </div>
          ) : (
            <form action={action} className="mt-3">
              {keyState.error && <p className="mb-2 text-terracotta">{keyState.error}</p>}
              <button className={hint ? quiet : primary} disabled={pending}>{pending ? "Issuing…" : hint ? "Issue a new key" : "Issue a key"}</button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
