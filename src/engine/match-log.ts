// A replay must run with the combat values in force when the match began.
import { TOWERS, UNITS, type Spec, type TowerType, type UnitType } from "./data.ts";
import type { Action, DuelState } from "./duel.ts";

export type RulesVersion = 1 | 2;
export const CURRENT_RULES: RulesVersion = 2;

export const towerAliases = {
  nailgun: "gatling", mortar: "cannon", harpoon: "ballista", coil: "tesla", relay: "beacon", sentinel: "laser",
} as const satisfies Record<string, TowerType>;
export const unitAliases = {
  scuttler: "kobold", runner: "hellhound", shellback: "orc", drone: "imp",
  hulk: "ogre", gunship: "wyvern", colossus: "minotaur",
} as const satisfies Record<string, UnitType>;

export function canonicalAction(action: Action): Action {
  if (action?.type === "build" && Object.hasOwn(towerAliases, action.tower))
    return { ...action, tower: towerAliases[action.tower as keyof typeof towerAliases] };
  if (action?.type === "send" && Object.hasOwn(unitAliases, action.unit))
    return { ...action, unit: unitAliases[action.unit as keyof typeof unitAliases] };
  return action;
}

/**
 * A stored match. `botSalt` seeds the house bots' temperament for this match.
 * It lives only in the server's copy and is never sent to a browser or an agent.
 */
type MatchLog = { rulesVersion: RulesVersion; rounds: DuelState["log"]; botSalt?: number };

export function readMatchLog(json: string): MatchLog {
  const stored: MatchLog | DuelState["log"] = JSON.parse(json);
  if (!Array.isArray(stored)) return stored;
  const rounds = stored.map(([a, b]): [Action[], Action[]] => [a.map(canonicalAction), b.map(canonicalAction)]);
  return { rulesVersion: 1, rounds };
}

export function writeMatchLog(state: DuelState, botSalt?: number): string {
  return JSON.stringify({ rulesVersion: state.map.rulesVersion, rounds: state.log, botSalt } satisfies MatchLog);
}

const originalHP: Record<UnitType, number> = {
  kobold: 22, hellhound: 42, goblin: 10, orc: 70, imp: 55, ogre: 260, wyvern: 300, minotaur: 850,
};

export function unitVitals(unit: UnitType, version: RulesVersion) {
  if (version === 1) return { hp: originalHP[unit], shield: unit === "orc" ? 90 : 0 };
  return UNITS[unit];
}

// Levels 1–3, followed by the two specialisations. Other towers kept their reach.
const originalRange: Partial<Record<TowerType, number[]>> = {
  gatling: [2.6, 2.6, 2.9, 2.9, 4.6], cannon: [4.2, 4.2, 4.5, 4.5, 4.5],
  ballista: [3.6, 3.6, 4, 4.4, 4], laser: [3.2, 3.4, 3.8, 3.8, 5.4],
};

export function towerStats(type: TowerType, level: number, spec: Spec | null, version: RulesVersion) {
  const def = TOWERS[type];
  const stats = spec ? def.specs[spec] : def.levels[Math.min(level, 3) - 1];
  const ranges = version === 1 && originalRange[type];
  return ranges ? { ...stats, range: ranges[spec === "a" ? 3 : spec === "b" ? 4 : level - 1] } : stats;
}
