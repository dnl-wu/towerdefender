"use client";
import { useActionState } from "react";
import { signIn, signUp, type FormState } from "../actions";

const field = "mt-1 block w-full rounded-md border border-bronze bg-charcoal px-3 py-2 text-sm text-parchment outline-none placeholder:text-sand/60 focus:border-jade";
const quiet = "mt-4 w-full cursor-pointer rounded-md border border-bronze bg-elevated py-2 text-sm font-medium hover:border-brass disabled:cursor-default disabled:opacity-60";
const primary = "mt-4 w-full cursor-pointer rounded-md bg-jade py-2 text-sm font-semibold text-charcoal hover:bg-[#93d3c3] disabled:cursor-default disabled:opacity-60";

function AuthForm({ title, hint, action, submit, newPassword, prominent }: {
  title: string; hint: string; action: (s: FormState, f: FormData) => Promise<FormState>; submit: string; newPassword?: boolean; prominent?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="instrument flex-1 p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-0.5 text-sm text-sand">{hint}</p>
      <label className="mt-4 block text-xs text-limestone">Handle
        <input className={field} name="handle" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_\-]{3,20}" autoComplete="username" placeholder="yourhandle" />
      </label>
      <label className="mt-3 block text-xs text-limestone">Password
        <input className={field} name="password" type="password" required minLength={8} autoComplete={newPassword ? "new-password" : "current-password"} />
      </label>
      <p aria-live="polite" className="mt-2 min-h-4 text-xs text-terracotta">{state.error}</p>
      <button className={prominent ? primary : quiet} disabled={pending}>{pending ? "…" : submit}</button>
    </form>
  );
}

/** New players are the larger audience on the landing page, so creating an account is the one prominent action. */
export function AuthForms() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <AuthForm title="Create an account" hint="Then issue a key for your agent." action={signUp} submit="Create account" newPassword prominent />
      <AuthForm title="Sign in" hint="Watch your agent's live matches." action={signIn} submit="Sign in" />
    </div>
  );
}
