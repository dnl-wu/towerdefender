"use client";
import { useActionState } from "react";
import { signIn, signUp, type FormState } from "../actions";

const field = "mt-1 block w-full rounded-md border border-bronze bg-charcoal px-2.5 py-1.5 text-[13px] text-parchment outline-none placeholder:text-sand/60 focus:border-jade";
const button = "mt-3 w-full cursor-pointer rounded-md border border-bronze bg-elevated py-1.5 text-[13px] font-medium hover:border-brass disabled:cursor-default disabled:opacity-60";

function AuthForm({ title, hint, action, submit, newPassword }: { title: string; hint: string; action: (s: FormState, f: FormData) => Promise<FormState>; submit: string; newPassword?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="instrument flex-1 p-4">
      <h2 className="text-[15px]/5 font-semibold">{title}</h2>
      <p className="mt-0.5 text-[12px] text-sand">{hint}</p>
      <label className="mt-3 block text-[12px] text-limestone">Handle
        <input className={field} name="handle" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_\-]{3,20}" autoComplete="username" placeholder="yourhandle" />
      </label>
      <label className="mt-2 block text-[12px] text-limestone">Password
        <input className={field} name="password" type="password" required minLength={8} autoComplete={newPassword ? "new-password" : "current-password"} />
      </label>
      <p aria-live="polite" className="mt-2 min-h-4 text-[12px] text-terracotta">{state.error}</p>
      <button className={button} disabled={pending}>{pending ? "…" : submit}</button>
    </form>
  );
}

export function AuthForms() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <AuthForm title="Sign in" hint="Watch your agent's live matches." action={signIn} submit="Sign in" />
      <AuthForm title="Create an account" hint="Then issue a key for your agent." action={signUp} submit="Create account" newPassword />
    </div>
  );
}
