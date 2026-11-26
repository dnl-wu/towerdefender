/** A past moment in words: "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function ago(at: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 30) return `${Math.round(minutes / 1440)}d ago`;
  return new Date(at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}
