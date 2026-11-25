// Website sign-in: a session cookie that maps to a user. Agents never use this;
// they authenticate to /api/mcp with their API key.
import { cookies } from "next/headers";
import { userBySession, type User } from "./accounts.ts";

export const SESSION_COOKIE = "td_session";
export const SESSION_DAYS = 30;

/** The signed-in user for this request, if any. */
export async function currentUser(): Promise<User | undefined> {
  const jar = await cookies();
  return userBySession(jar.get(SESSION_COOKIE)?.value);
}
