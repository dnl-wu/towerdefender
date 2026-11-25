import { matchView } from "@/server/feed";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";

// What this viewer may see: the full replay once a match ends; while it is live, your own lane if you are playing, otherwise public facts.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await currentUser();
  const view = matchView(id, user?.id);
  if (!view) return Response.json({ error: "No such match." }, { status: 404 });
  return Response.json(view, { headers: { "Cache-Control": "no-store, private" } });
}
