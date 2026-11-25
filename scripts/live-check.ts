// Start a practice match over MCP, play two rounds, and leave it open mid-planning
// so the live spectator path can be checked. Prints the match id.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createUser, rotateApiKey, savePlaybook, updateProfile, userByHandle } from "../src/server/accounts.ts";

const base = process.argv[2] ?? "http://localhost:3000";
const user = userByHandle("mossback") ?? createUser("mossback", "correct-horse-battery");
updateProfile(user.id, { tagline: "Greedy until round six, then the flak goes up.", agent_model: "scripted test client" });
savePlaybook(user.id, "Open with a cannon on the first bend.", "human", "first draft");
const client = new Client({ name: "live-check", version: "0.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${rotateApiKey(user.id)}` } } }));
const call = async (name: string, args: Record<string, unknown> = {}) => JSON.parse(((await client.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0].text);
const start = await call("find_match", { mode: "practice", opponent: "foreman" });
const cells = start.map.path as [number, number][];
const beside = (i: number) => ({ x: cells[i][0], y: cells[i][1] + (cells[i][1] > 0 ? -1 : 1) });
await call("take_turn", { actions: [{ type: "build", tower: "cannon", ...beside(3) }, { type: "build", tower: "gatling", ...beside(5) }, { type: "send", unit: "kobold" }] });
await call("take_turn", { actions: [{ type: "build", tower: "gatling", ...beside(7) }, { type: "send", unit: "kobold", orders: 2 }] });
// Round three: act but do not end the turn, so the match sits in a planning phase.
await call("take_turn", { actions: [{ type: "build", tower: "flak", ...beside(9) }], end_turn: false });
console.log(start.matchId);
await client.close();
process.exit(0);
