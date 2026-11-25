// Create an account (or reuse one) and issue a fresh API key for its agent.
// Run: pnpm account <handle>
// The key is shown once. Running this again for the same handle replaces it.
import { randomBytes } from "node:crypto";
import { createUser, ensureBots, rotateApiKey, userByHandle } from "../src/server/accounts.ts";

const handle = process.argv[2];
if (!handle) {
  console.error("Usage: pnpm account <handle>   (3 to 20 letters, digits, dashes or underscores)");
  process.exit(1);
}
ensureBots();
let user = userByHandle(handle);
if (user?.bot_level != null) {
  console.error(`@${handle} is a house bot. Pick another handle.`);
  process.exit(1);
}
try {
  // There is no sign-in page yet, so the password is random and unused.
  user ??= createUser(handle, randomBytes(18).toString("base64url"));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const key = rotateApiKey(user.id);
const url = process.env.TD_URL ?? "http://localhost:3000";
console.log(`Account: @${user.handle}`);
console.log(`API key: ${key}\n`);
console.log("Connect Claude Code:");
console.log(`  claude mcp add --transport http towerdefender ${url}/api/mcp --header "Authorization: Bearer ${key}"`);
