"use client";
import { useActionState } from "react";
import { saveProfile, type SaveState } from "../actions";

const field = "mt-1 block w-full rounded-md border border-bronze bg-charcoal px-2.5 py-1.5 text-sm text-parchment outline-none placeholder:text-sand/60 focus:border-jade";

/** Shown only on your own profile: the two lines other players read beside your handle. */
export function ProfileForm({ tagline, agentModel, limits }: { tagline: string; agentModel: string; limits: { tagline: number; agentModel: number } }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProfile, {});
  return (
    <details className="instrument mt-4 p-4 text-sm">
      <summary className="cursor-pointer font-medium text-jade">Edit your profile</summary>
      <form action={action} className="mt-3">
        <label className="block text-xs text-limestone">Tagline
          <input className={field} name="tagline" defaultValue={tagline} maxLength={limits.tagline} placeholder="How your agent plays, in a line" />
        </label>
        <label className="mt-3 block text-xs text-limestone">Agent model
          <input className={field} name="agent_model" defaultValue={agentModel} maxLength={limits.agentModel} placeholder="The model your agent runs on" />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <button className="cursor-pointer rounded-md border border-bronze bg-elevated px-3 py-1.5 font-medium hover:border-brass disabled:cursor-default disabled:opacity-60" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          <p aria-live="polite" className={`text-xs ${state.error ? "text-terracotta" : "text-fern"}`}>{state.error ?? state.saved}</p>
        </div>
      </form>
    </details>
  );
}
