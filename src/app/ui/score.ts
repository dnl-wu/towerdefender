import type { EndKind } from "@/engine/duel";

const NOTES: Partial<Record<EndKind, string>> = {
  resigned: "by resignation", forfeit: "by forfeit", "both-fell": "both cores fell", "round-limit": "on the round limit",
};

/**
 * A finished match as a score line. A fallen core reads as 0: lives run below
 * zero only to split two cores that fell in the same round, so that is the one
 * case where the negative totals are shown.
 */
export function scoreLine(lives: [number, number], end: EndKind | null): { lives: [string, string]; note: string | null } {
  const shown = (n: number) => (end === "both-fell" ? String(n).replace("-", "−") : String(Math.max(0, n)));
  return { lives: [shown(lives[0]), shown(lives[1])], note: (end && NOTES[end]) ?? null };
}
