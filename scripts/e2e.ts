// End-to-end check over real MCP: two scripted agents queue for ranked and play
// each other to the end. Needs a running server.
// Run: TD_DB=<file> node --experimental-strip-types scripts/e2e.ts [baseUrl]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createUser, rotateApiKey, userByHandle } from "../src/server/accounts.ts";

const base = process.argv[2] ?? "http://localhost:3000";

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

async function connect(handle: string) {
  const user = userByHandle(handle) ?? createUser(handle, "correct-horse-battery");
  const key = rotateApiKey(user.id);
  const client = new Client({ name: `e2e-${handle}`, version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as ToolResult;
    if (res.isError) throw new Error(`${name}: ${res.content[0].text}`);
    const first = res.content[0].text;
    return { data: first.startsWith("{") || first.startsWith("[") ? JSON.parse(first) : first, texts: res.content.slice(1).map((c) => c.text) };
  };
  return { handle, client, call };
}

/** A deliberately simple scripted player: gatlings and cannons on the best cells, a few kobolds each round. */
async function play(agent: Awaited<ReturnType<typeof connect>>, aggressive: boolean) {
  const start = await agent.call("find_match", { mode: "ranked" });
  let state = start.data;
  console.log(`[@${agent.handle}] match ${state.matchId} vs @${state.versus.handle}${state.versus.houseBot ? " (bot)" : ""}`);
  const rows = start.texts[1].split("\n").slice(1).map((r: string) => r.split(" ").slice(2));
  const cells: { x: number; y: number; n: number }[] = [];
  rows.forEach((r: string[], y: number) => r.forEach((c, x) => c !== "-" && cells.push({ x, y, n: Number(c) })));
  cells.sort((a, b) => b.n - a.n);
  let used = 0;
  for (;;) {
    const actions: Record<string, unknown>[] = [];
    let gold = state.you.gold;
    if (aggressive && state.round > 1) {
      actions.push({ type: "send", unit: "kobold", orders: 2 });
      gold -= 40;
    }
    const air = Object.keys(state.incomingWaves[0].units).some((u) => u === "imp" || u === "wyvern");
    while (gold >= 70 && used < cells.length) {
      const tower = air && used % 2 === 0 ? "flak" : used % 3 === 1 ? "cannon" : used % 5 === 4 ? "ballista" : "gatling";
      actions.push({ type: "build", tower, x: cells[used].x, y: cells[used].y });
      gold -= tower === "cannon" ? 70 : tower === "ballista" ? 80 : tower === "flak" ? 50 : 40;
      used++;
    }
    let res = await agent.call("take_turn", { actions });
    while (res.data.waiting) res = await agent.call("wait_for_round");
    const rep = res.data.roundReport;
    console.log(`[@${agent.handle}] R${rep.round} ${rep.theme}: lost ${rep.you.livesLost} (now ${rep.you.livesNow}), opp ${rep.opponent.livesNow}${rep.notes.length ? " — " + rep.notes[0] : ""}`);
    if (res.data.matchOver) {
      console.log(`[@${agent.handle}] ${res.data.result}: ${res.data.reason} rating ${JSON.stringify(res.data.rating)}`);
      break;
    }
    state = res.data;
  }
  const record = String((await agent.call("get_match_record")).data);
  const head = record.split("\n")[0];
  console.log(`[@${agent.handle}] match record: ${record.length} characters, ${head}`);
  await agent.call("save_playbook", { content: `Last match: ${head}`, note: "e2e run" });
  await agent.client.close();
}

const [a, b] = await Promise.all([connect("e2e_alpha"), connect("e2e_bravo")]);
const tools = await a.client.listTools();
console.log(`tools: ${tools.tools.map((t) => t.name).join(", ")}`);
const rules = await a.call("get_rules");
console.log(`rules: ${String(rules.data).length} chars`);
await Promise.all([play(a, true), play(b, false)]);
console.log("e2e ok");
process.exit(0);
