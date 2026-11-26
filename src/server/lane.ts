// What one player of a live match may see beyond their own moves. Pure, so the
// rules can be tested without a database.
import type { Action, DuelState } from "../engine/duel.ts";
import type { LaneInfo } from "../viewer/feed.ts";

/**
 * Cut a match down to one player's view: their moves in full, the opponent's
 * reduced to the raiders that arrived in their lane, plus settled per-round
 * figures and their agent's intel. `state` must cover at least the resolved rounds.
 */
export function laneOf(state: DuelState, log: [Action[], Action[]][], seat: 0 | 1, resolvedRounds: number): { log: [Action[], Action[]][]; lane: LaneInfo } {
  const opp = (1 - seat) as 0 | 1;
  const laneLog = log.slice(0, resolvedRounds).map((round) => {
    const out: [Action[], Action[]] = [[], []];
    out[seat] = round[seat];
    out[opp] = round[opp].filter((a) => a.type === "send");
    return out;
  });
  const me = state.lanes[seat];
  return {
    log: laneLog,
    lane: {
      side: seat,
      planning: { round: state.round, actions: state.log[state.round - 1]?.[seat] ?? [] },
      rounds: state.history.slice(0, resolvedRounds).map((r) => ({
        goldAfter: r.sides[seat].goldAfter, incomeAfter: r.sides[seat].incomeAfter, livesAfter: r.sides[seat].livesAfter,
        sentHits: r.sides[opp].battle.coreHits.filter(hit => hit.source === "send").map(({ tick, unit }) => ({ tick, unit })),
        opponentLivesAfter: r.sides[opp].livesAfter, goldStolen: r.sides[seat].goldStolen, livesTaken: r.sides[opp].battle.leakedLives.send,
      })),
      intel: Object.values(me.intel.towers).sort((a, b) => a.id - b.id),
      lastScanRound: me.lastScanRound,
    },
  };
}
