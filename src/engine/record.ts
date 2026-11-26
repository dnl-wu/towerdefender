// The full record of a finished match, for agents. Everything that happened, in
// as few tokens as possible: no prose, no advice. Both lanes are open once a match
// ends, so the record covers both sides. The format is described in its own header.
import type { Action, DuelState, RoundRecord } from "./duel.ts";
import { UNITS, type UnitType } from "./data.ts";
import { waveArchetype } from "./waves.ts";

export interface RecordMeta {
  id: string;
  mode: string;
  /** Handles, by seat. */
  handles: [string, string];
  /** The seat the record is written for, or null for a neutral record. */
  you: 0 | 1 | null;
  ratings?: [[number | null, number | null], [number | null, number | null]];
  playbooks?: [number | null, number | null];
}

const SEAT = ["A", "B"] as const;

const LEGEND = `# Seats A and B. Per round: "r<n> <wave theme>", then for each seat:
#  <S> do <actions in order, accepted only>
#    +type@x,y[:targeting]=build (default targeting first)  ^id[a|b]=upgrade[, spec]  $id=sell  ~id:mode=retarget
#    unit*orders=send  scan  drums  say"text"
#  <S> fight faced unit:wave+sent ... | leaked unit:wave+sent ... (goblin: total) | lives -wave-sent | bounty n | gold -stolen-from-you +stolen-by-you | tower id:damage/kills/overkill ...
#  <S> end lives gold income towerValue
# Tower ids are per seat. "final" lists each seat's towers at the end: id type x,y level[spec] targeting invested damage kills.`;

function action(a: Action): string {
  switch (a.type) {
    case "build": return `+${a.tower}@${a.x},${a.y}${a.targeting && a.targeting !== "first" ? `:${a.targeting}` : ""}`;
    case "upgrade": return `^${a.id}${a.spec ?? ""}`;
    case "sell": return `$${a.id}`;
    case "target": return `~${a.id}:${a.mode}`;
    case "send": return `${a.unit}*${a.orders ?? 1}`;
    case "scan": return "scan";
    case "drums": return "drums";
    case "say": return `say${JSON.stringify(a.text)}`;
  }
}

/** "unit:wave+sent" pairs, in a fixed unit order, skipping units that were not there. */
function split(byUnit: Map<UnitType, [number, number]>): string {
  return [...byUnit].filter(([, [w, s]]) => w + s > 0).map(([u, [w, s]]) => `${u}:${w}+${s}`).join(" ") || "-";
}

function fight(rec: RoundRecord, seat: 0 | 1): string {
  const me = rec.sides[seat], b = me.battle;
  const sent = new Map<UnitType, number>();
  for (const o of rec.sides[1 - seat].sent) sent.set(o.unit, (sent.get(o.unit) ?? 0) + o.orders * UNITS[o.unit].send.count);
  const faced = new Map<UnitType, [number, number]>();
  for (const [u, n] of Object.entries(b.spawned) as [UnitType, number][]) {
    const s = Math.min(n, sent.get(u) ?? 0);
    faced.set(u, [n - s, s]);
  }
  const leaked = new Map<UnitType, [number, number]>();
  for (const hit of b.coreHits) {
    const e = leaked.get(hit.unit) ?? [0, 0];
    e[hit.source === "send" ? 1 : 0]++;
    leaked.set(hit.unit, e);
  }
  // Goblins cost no lives, so they never hit the core and their origin is not recorded.
  const goblins = b.leaked.goblin ?? 0;
  const towers = b.towers.filter((t) => t.dmg > 0 || t.kills > 0).map((t) => `${t.id}:${t.dmg}/${t.kills}/${t.overkill}`).join(" ") || "-";
  return `fight faced ${split(faced)} | leaked ${split(leaked)}${goblins ? ` goblin:${goblins}` : ""} | lives -${b.leakedLives.base}-${b.leakedLives.send} | bounty ${b.bounty} | gold -${me.goldLost}+${me.goldStolen} | tower ${towers}`;
}

/** The match as compact text. `state` must be the finished match rebuilt from its log. */
export function matchRecord(state: DuelState, meta: RecordMeta): string {
  const w = state.winner;
  const result = w === "draw" || w === null ? "draw" : `${SEAT[w]}`;
  const lines = [
    `TDR1 id=${meta.id} mode=${meta.mode} rules=${state.map.rulesVersion} seed=${state.seed} rounds=${state.history.length} winner=${result}${meta.you === null ? "" : ` you=${SEAT[meta.you]}`}`,
    `end ${JSON.stringify(state.endReason ?? "")}`,
    ...([0, 1] as const).map((p) => {
      const r = meta.ratings?.[p], pb = meta.playbooks?.[p];
      return `${SEAT[p]} @${meta.handles[p]}${r && r[0] !== null && r[1] !== null ? ` rating ${Math.round(r[0])}>${Math.round(r[1])}` : ""}${pb != null ? ` playbook v${pb}` : ""}`;
    }),
    `map ${state.map.w}x${state.map.h} rows y=0.. (both seats; . open ^ high ground * power tile # path S spawn C core x rubble)`,
    ...state.map.tiles.map((row) => row.join("")),
    LEGEND,
  ];
  for (const rec of state.history) {
    lines.push(`r${rec.round} ${waveArchetype(state.seed, rec.round)}`);
    for (const p of [0, 1] as const) {
      const s = rec.sides[p];
      lines.push(`${SEAT[p]} do ${state.log[rec.round - 1][p].map(action).join(" ") || "-"}`);
      lines.push(`${SEAT[p]} ${fight(rec, p)}`);
      lines.push(`${SEAT[p]} end ${s.livesAfter} ${s.goldAfter} ${s.incomeAfter} ${s.towerValue}`);
    }
  }
  for (const p of [0, 1] as const) {
    lines.push(`final ${SEAT[p]}`);
    for (const t of state.lanes[p].towers) lines.push(`${t.id} ${t.type} ${t.x},${t.y} L${t.level}${t.spec ?? ""} ${t.targeting} ${t.invested} ${t.dmg} ${t.kills}`);
  }
  return lines.join("\n");
}
