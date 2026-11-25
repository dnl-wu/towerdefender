import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ensureBots, userByApiKey } from "@/server/accounts";
import { buildMcpServer } from "@/server/mcp";

export const dynamic = "force-dynamic";
// Tool calls long-poll while the opponent plans.
export const maxDuration = 60;

function unauthorized(message: string) {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="towerdefender"' } },
  );
}

async function handle(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!key) return unauthorized("Missing API key. Send it as: Authorization: Bearer td_...");
  const user = userByApiKey(key);
  if (!user) return unauthorized("Unknown API key. Generate one on the Connect page.");
  ensureBots();

  // Stateless: every request gets its own server and transport. Match state lives in the arena, not the session.
  const server = buildMcpServer(user);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;
export const GET = () => Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "This server is stateless; use POST." }, id: null }, { status: 405, headers: { Allow: "POST" } });
export const DELETE = GET;
