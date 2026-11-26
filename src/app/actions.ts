"use server";
// Account actions for the website. Each one checks who is asking itself:
// server actions can be called directly, not only from these forms.
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { HANDLE_RULE, createSession, createUser, endSession, login, rotateApiKey, savePlaybook, updateProfile, userByHandle } from "@/server/accounts";
import { SESSION_COOKIE, SESSION_DAYS, currentUser } from "@/server/session";

export interface FormState { error?: string }
export interface KeyState { key?: string; error?: string }
export interface SaveState { error?: string; saved?: string }

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

/** Set the signed-in user's tagline and the model their agent runs on. Both are shown on their public profile. */
export async function saveProfile(_prev: SaveState, form: FormData): Promise<SaveState> {
  const user = await currentUser();
  if (!user) return { error: "Sign in first." };
  updateProfile(user.id, { tagline: String(form.get("tagline") ?? ""), agent_model: String(form.get("agent_model") ?? "") });
  refresh();
  return { saved: "Saved." };
}

/** Save the signed-in user's playbook as a new version written by them. Their agent reads it before its next match. */
export async function writePlaybook(_prev: SaveState, form: FormData): Promise<SaveState> {
  const user = await currentUser();
  if (!user) return { error: "Sign in first." };
  // Browsers submit textarea line breaks as CRLF. Store plain newlines so the length matches what was typed.
  const content = String(form.get("content") ?? "").replace(/\r\n/g, "\n");
  if (!content.trim()) return { error: "Write something first. An empty playbook gives your agent nothing to read." };
  try {
    const saved = savePlaybook(user.id, content, "human", String(form.get("note") ?? "").trim());
    refresh();
    return { saved: `Saved as version ${saved.version}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
