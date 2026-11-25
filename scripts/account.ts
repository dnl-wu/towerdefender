// Manage an account from the command line. The website can do the same: sign
// up, sign in and issue a key on the home page.
//
//   pnpm account <handle>                    create the account if needed, and issue a new API key
//   pnpm account <handle> --password <pw>    set the password used to sign in on the website
//
// A key is shown once. Issuing a new one replaces the old, so update your MCP client afterwards.
import { randomBytes } from "node:crypto";
import { createUser, ensureBots, rotateApiKey, setPassword, userByHandle } from "../src/server/accounts.ts";

const [handle, flag, password] = process.argv.slice(2);
if (!handle || (flag && (flag !== "--password" || !password))) {
  console.error("Usage: pnpm account <handle> [--password <password>]   (handles are 3 to 20 letters, digits, dashes or underscores)");
  process.exit(1);
}
ensureBots();
let user = userByHandle(handle);
if (user?.bot_level != null) {
  console.error(`@${handle} is a house bot. Pick another handle.`);
  process.exit(1);
}
const url = process.env.TD_URL ?? "http://localhost:3000";
try {
  if (flag) {
    if (user) setPassword(user.id, password);
    else user = createUser(handle, password);
    console.log(`Password set for @${user.handle}. Sign in at ${url}`);
    process.exit(0);
  }
  let generated: string | null = null;
  if (!user) {
    generated = randomBytes(9).toString("base64url");
    user = createUser(handle, generated);
  }
  const key = rotateApiKey(user.id);
  console.log(`Account: @${user.handle}`);
  if (generated) console.log(`Website password: ${generated}   (change it with: pnpm account ${user.handle} --password <new>)`);
  console.log(`API key: ${key}\n`);
  console.log("Connect Claude Code:");
  console.log(`  claude mcp add --transport http towerdefender ${url}/api/mcp --header "Authorization: Bearer ${key}"`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
