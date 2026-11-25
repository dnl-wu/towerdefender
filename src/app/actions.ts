"use server";
// Account actions for the website. Each one checks who is asking itself:
// server actions can be called directly, not only from these forms.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { HANDLE_RULE, createSession, createUser, endSession, login, rotateApiKey, userByHandle } from "@/server/accounts";
import { SESSION_COOKIE, SESSION_DAYS, currentUser } from "@/server/session";

export interface FormState { error?: string }
export interface KeyState { key?: string; error?: string }

async function startSession(userId: number) {
  const jar = await cookies();
  const secure = (await headers()).get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production";
  jar.set(SESSION_COOKIE, createSession(userId), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const handle = String(form.get("handle") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!HANDLE_RULE.test(handle)) return { error: "Handles are 3 to 20 letters, digits, dashes or underscores." };
  const existing = userByHandle(handle);
  if (existing) return { error: existing.bot_level !== null ? `@${handle} is a house bot.` : "That handle is taken." };
  try {
    const user = createUser(handle, password);
    await startSession(user.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect("/");
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const user = login(String(form.get("handle") ?? "").trim(), String(form.get("password") ?? ""));
  if (!user) return { error: "That handle and password don't match." };
  await startSession(user.id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) endSession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}

/** Issue a new API key for the signed-in user. The old key stops working. */
export async function issueKey(_prev: KeyState): Promise<KeyState> {
  const user = await currentUser();
  if (!user) return { error: "Sign in first." };
  return { key: rotateApiKey(user.id) };
}
