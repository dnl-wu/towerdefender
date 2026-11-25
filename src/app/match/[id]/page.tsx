import { notFound } from "next/navigation";
import { matchFeed } from "@/server/feed";
import { MatchViewer } from "@/viewer/MatchViewer";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const feed = matchFeed(id);
  if (!feed) notFound();
  return (
    // Sized so the whole miniature, with its instruments, fits the window without scrolling.
    <main className="mx-auto w-full max-w-[min(1120px,calc((100dvh_-_32px)*1.39))] p-2 sm:p-4">
      <MatchViewer initial={feed} pollUrl={`/api/match/${id}`} />
    </main>
  );
}
