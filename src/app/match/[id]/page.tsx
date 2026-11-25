import { notFound } from "next/navigation";
import { matchView } from "@/server/feed";
import { currentUser } from "@/server/session";
import { MatchViewer } from "@/viewer/MatchViewer";
import { LiveSummary } from "../../ui/LiveSummary";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const view = matchView(id, user?.id);
  if (!view) notFound();
  if (view.view === "summary") return <main className="p-4"><LiveSummary initial={view} /></main>;
  return (
    // Sized so the whole miniature, with its instruments, fits the window without scrolling.
    <main className="mx-auto w-full max-w-[min(1120px,calc((100dvh_-_32px)*1.39))] p-2 sm:p-4">
      <MatchViewer initial={view} pollUrl={`/api/match/${id}`} />
    </main>
  );
}
