// The handbook agents read. Generated from the same tables the simulation uses.
import { RULES, TOWERS, TOWER_TYPES, UNITS, UNIT_TYPES, hpScale, sendCap, waveBudget } from "./data.ts";
import { MAP_H, MAP_W } from "./map.ts";

export function rulesHandbook(): string {
  const towers = TOWER_TYPES.map((k) => {
    const d = TOWERS[k];
    const lv = d.levels
      .map((s, i) => {
        const bits = [`L${i + 1} (${i === 0 ? "build" : "upgrade"} ${s.cost}g)`];
        if (k === "relay") bits.push(`+${Math.round((s.buffDmg ?? 0) * 100)}% damage${s.buffRange ? `, +${Math.round(s.buffRange * 100)}% range` : ""} to neighbours`);
        else if (k === "frost") bits.push(`slow ${Math.round((s.slow ?? 0) * 100)}% for ${s.slowDur}s, range ${s.range}`);
        else bits.push(`${s.dmg} dmg × ${s.rate}/s = ${Math.round(s.dmg * s.rate * 10) / 10} dps, range ${s.range}${s.minRange ? ` (min ${s.minRange})` : ""}${s.splash ? `, splash ${s.splash}` : ""}${s.chain ? `, ${s.chain} jumps` : ""}`);
        return "    " + bits.join(": ");
      })
      .join("\n");
    const specs = (["a", "b"] as const).map((sp) => `    spec ${sp} "${d.specs[sp].name}" (${d.specs[sp].cost}g): ${d.specs[sp].desc}`).join("\n");
    return `- ${k} — ${d.name}. Hits: ${d.targets}. Damage type: ${d.dmgType}.\n    ${d.role}\n${lv}\n${specs}`;
  }).join("\n");

  const units = UNIT_TYPES.map((k) => {
    const u = UNITS[k];
    const traits = [`${u.hp} hp`, u.shield ? `${u.shield} shield` : "", u.armor ? `${u.armor} armour` : "", `speed ${u.speed}`, u.flying ? "FLYING" : "", u.slowResist ? `ignores ${u.slowResist * 100}% of slows` : "", `costs ${u.lives} ${u.lives === 1 ? "life" : "lives"} if it leaks`, `${u.bounty}g bounty`].filter(Boolean).join(", ");
    return `- ${k} — ${u.name}: ${traits}.\n    ${u.desc}\n    Send: ${u.send.cost}g buys ${u.send.count}, +${u.send.income} income, from round ${u.send.unlock}.`;
  }).join("\n");

  const scaling = [1, 5, 10, 15, 20].map((r) => `round ${r}: hp ×${hpScale(r)}, neutral wave size ${waveBudget(r)}, send cap ${sendCap(r)}g`).join("; ");

  return `# TOWERDEFENDER — rules

## The duel
Two players, two identical lanes on the same map. You never share a lane. Each round:
1. PLAN (simultaneous, hidden): build, upgrade, sell and retarget towers, and buy sends. Then end your turn.
2. FIGHT: your lane is attacked by the neutral wave (identical for both players) plus whatever the opponent sent you. It resolves instantly.
3. PAYOUT: you receive kill bounties and your income.
You start with ${RULES.startGold} gold, ${RULES.baseIncome} income and ${RULES.startLives} lives. A leaking enemy removes lives. At 0 lives your core falls and you lose. If both fall in the same round, whoever took less damage wins. After round ${RULES.maxRounds}, more lives wins.

## Sends are your economy and your attack
Every send order permanently raises your income. Cheap units are the best investment; expensive ones are the real threats. Gold spent on towers keeps you alive; gold spent on sends compounds. You may spend at most 40 + 20 × round gold on sends per round. Sent units scale with the round exactly like neutral ones, so the same order hits harder later.
You see the opponent's board as it stood when the round opened (scout_opponent). Their moves this round are hidden until it resolves. Send what their board cannot handle.

## Map
${MAP_W}×${MAP_H} grid, x left to right, y top to bottom, both from 0. Ground units walk the path from S to C. Flying units cross in a straight line from S to C and ignore the path. Towers go on open ground, high ground (^, +${RULES.highGroundRange} range) or power tiles (*, +${RULES.powerTileDmg * 100}% damage). Range is straight-line distance in cells from the tower's cell.

## Combat
- Armour is subtracted from every hit (minimum 1). Explosive hits ignore half of it; pierce ignores all of it.
- Shields absorb damage first. Non-energy damage is halved against a shield; energy is doubled.
- Slows do not stack; the strongest applies.
- Relay bonuses do not stack; the strongest applies. Relays buff the 8 cells around them.
- Arc Coil jumps lose ${RULES.chainFalloff * 100}% damage per jump and reach ${RULES.chainJumpRange} cells.
- Targeting modes: first (closest to your core), last, strong (most health), weak (least health), close (nearest the tower).
- Selling refunds ${RULES.sellRefund * 100}% of everything spent on the tower.
- Upgrades go level 1 → 2 → 3, then one specialisation (a or b), which is permanent.

## Towers
${towers}

## Units
${units}

## Scaling
Enemy health and shields grow 9% per round. ${scaling}.
Neutral waves have a theme (swarm, rush, shield, air, armor, mixed) and every 5th round is a boss round. The next three are always visible in get_state. A theme never repeats back to back.

## Clock
Each planning phase has a time limit, shown in get_state. If it expires your turn ends with whatever you had done. Three expired turns in a row with no actions forfeits the match.
`;
}
