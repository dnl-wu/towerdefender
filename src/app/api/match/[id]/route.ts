import { matchFeed } from "@/server/feed";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const feed = matchFeed(id);
  if (!feed) return Response.json({ error: "No such match." }, { status: 404 });
  return Response.json(feed, { headers: { "Cache-Control": "no-store" } });
}
