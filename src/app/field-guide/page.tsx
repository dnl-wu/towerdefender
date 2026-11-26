import type { Metadata } from "next";
import { DRUMS, RULES, SCALE, TOWERS, TOWER_TYPES, UNITS, UNIT_TYPES, drumsPrice, scannerPrice, type TowerStats, type TowerType } from "@/engine/data";
import { TowerIcon, UnitIcon } from "@/viewer/PieceIcon";

export const metadata: Metadata = { title: "Troops & towers · Tower Defender" };

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-sand">{label}</dt><dd className="mt-1 font-medium tabular-nums">{children}</dd></div>;
}

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
const tidy = (n: number) => String(Math.round(n * 10) / 10);

/** What one step of a tower does, in the figure a player compares: damage per second for guns, the slow or the bonus for support. */
function effect(type: TowerType, s: TowerStats): { main: string; detail: string } {
  if (type === "beacon") return { main: `+${percent(s.buffDmg ?? 0)} damage${s.buffRange ? `, +${percent(s.buffRange)} range` : ""}`, detail: "to the 8 cells around it" };
  if (type === "frost") return { main: `Slows ${percent(s.slow ?? 0)}`, detail: `for ${s.slowDur}s, once a second` };
  const extras = [s.splash && `splash ${s.splash}`, s.chain && `${s.chain} jumps`, s.burn && `burns ${s.burn}/s`].filter(Boolean);
  return { main: `${tidy(s.dmg * s.rate)} damage/s`, detail: [`${s.dmg} × ${s.rate}/s`, ...extras].join(" · ") };
}

export default function FieldGuide() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:p-8">
      <h1 className="text-3xl font-semibold">Troops &amp; towers</h1>
      <p className="mt-2 text-sand">Choose what to send down the enemy lane and what to build beside yours.</p>
      <nav aria-label="Guide sections" className="my-6 flex gap-5 text-sm font-medium text-jade">
        <a href="#troops" className="underline underline-offset-4">Troops ({UNIT_TYPES.length})</a>
        <a href="#towers" className="underline underline-offset-4">Towers ({TOWER_TYPES.length})</a>
        <a href="#tactics" className="underline underline-offset-4">Tactics (2)</a>
      </nav>
      <section id="troops" className="scroll-mt-4">
        <h2 className="text-xl font-semibold">Troops</h2>
        <p className="mt-1 text-sm text-sand">Each send buys a group and adds income to every payout, starting this round. The same troops make up the neutral waves. Health and shields are shown for round 1 and grow {percent(SCALE.early - 1)} a round, then {percent(SCALE.late - 1)} a round from round {SCALE.kneeRound}.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {UNIT_TYPES.map(type => {
            const unit = UNITS[type];
            return (
              <article key={type} id={type} className="guide-card flex scroll-mt-4 flex-col">
                <header><UnitIcon unit={type} size="size-14" /><div><h3>{unit.name}</h3><p>{unit.flying ? "Flying" : "Ground"} · Send unlocks in round {unit.send.unlock}</p></div></header>
                <p className="flex-1">{unit.desc}</p>
                <dl>
                  <Stat label="Health">{unit.hp}{unit.shield > 0 && <span className="text-jade"> +{unit.shield} shield</span>}</Stat>
                  <Stat label="Speed">{unit.speed} cells/s</Stat>
                  <Stat label="Armour">{unit.armor || "None"}</Stat>
                  <Stat label="Send order">{unit.send.count} for {unit.send.cost} gold</Stat>
                  <Stat label="Income">+{unit.send.income} gold</Stat>
                  <Stat label="At the core">{unit.loot ? `Steals ${unit.loot.base} gold +${unit.loot.perRound} per round` : `Takes ${unit.lives} ${unit.lives === 1 ? "life" : "lives"}`}</Stat>
                </dl>
                <p className="mt-3 text-xs text-sand">Killing one pays the defender {unit.bounty} gold.{unit.slowResist > 0 && ` Ignores ${percent(unit.slowResist)} of every slow.`}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section id="towers" className="mt-10 scroll-mt-4">
        <h2 className="text-xl font-semibold">Towers</h2>
        <p className="mt-1 text-sm text-sand">Upgrade a tower to level three, then choose one of two permanent specialisations. Costs are for each step. Range is in cells; high ground adds {RULES.highGroundRange}, and a power tile adds {percent(RULES.powerTileDmg)} damage. Selling returns {RULES.sellRefundPercent}% of everything spent on the tower.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {TOWER_TYPES.map(type => {
            const tower = TOWERS[type];
            const steps = [
              ...tower.levels.map((stats, i) => ({ name: `Level ${i + 1}`, desc: "", stats })),
              ...Object.values(tower.specs).map((spec) => ({ name: spec.name, desc: spec.desc, stats: spec as TowerStats })),
            ];
            return (
              <article key={type} id={type} className="guide-card scroll-mt-4">
                <header><TowerIcon type={type} level={1} size="size-14" /><div><h3>{tower.name}</h3><p>{type === "beacon" ? "Support" : tower.targets === "both" ? "Ground & air" : tower.targets === "air" ? "Air only" : "Ground only"} · {tower.levels[0].cost} gold to build</p></div></header>
                <p>{tower.role}</p>
                <table className="mt-4 w-full border-t border-bronze text-sm">
                  <thead className="text-left text-xs text-sand">
                    <tr className="[&>th]:pt-3 [&>th]:pb-1 [&>th]:font-normal"><th>Step</th><th className="text-right">Cost</th><th className="pl-4">Effect</th>{type !== "beacon" && <th className="text-right">Range</th>}</tr>
                  </thead>
                  <tbody>
                    {steps.map((step, i) => {
                      const { main, detail } = effect(type, step.stats);
                      return (
                        <tr key={step.name} className={`align-top [&>td]:py-1 ${i === 3 ? "[&>td]:border-t [&>td]:border-bronze/60 [&>td]:pt-2" : ""}`}>
                          <td className="pr-3 font-medium whitespace-nowrap">{step.name}</td>
                          <td className="text-right whitespace-nowrap tabular-nums">{step.stats.cost}g</td>
                          <td className="pl-4 tabular-nums"><span className="flex flex-wrap items-baseline gap-x-2">{main}<span className="text-xs text-sand">{detail}</span></span>{step.desc && <span className="block text-xs text-sand">{step.desc}</span>}</td>
                          {type !== "beacon" && <td className="pl-2 text-right whitespace-nowrap tabular-nums">{step.stats.minRange ? `${step.stats.minRange}–` : ""}{step.stats.range}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </article>
            );
          })}
        </div>
      </section>
      <section id="tactics" className="mt-10 scroll-mt-4">
        <h2 className="text-xl font-semibold">Tactics</h2>
        <p className="mt-1 text-sm text-sand">Bought during planning, once a round each, and paid for from the same purse as everything else.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <article id="scanner" className="guide-card scroll-mt-4">
            <header><div><h3>Scanner</h3><p>Intel · {scannerPrice(1)} gold in round 1</p></div></header>
            <p>Shows the opponent&apos;s whole base as it stood when the round opened, and forgets towers that are gone. Your turn stays open, so you can act on what it shows.</p>
            <dl>
              <Stat label="Price">{scannerPrice(1) - scannerPrice(2)} less each round</Stat>
              <Stat label="Floor">{scannerPrice(RULES.maxRounds)} gold</Stat>
              <Stat label="Send cap">Not used</Stat>
            </dl>
          </article>
          <article id="drums" className="guide-card scroll-mt-4">
            <header><div><h3>War Drums</h3><p>Pressure · from round {DRUMS.unlock}</p></div></header>
            <p>Every enemy in the opponent&apos;s lane, the neutral wave included, moves faster for one battle. Hidden until it is fought. Slows still apply, so Frost Vents blunt them.</p>
            <dl>
              <Stat label="Speed">+{Math.round((DRUMS.haste - 1) * 100)}%</Stat>
              <Stat label="Price">{drumsPrice(DRUMS.unlock)}g, +{drumsPrice(DRUMS.unlock + 1) - drumsPrice(DRUMS.unlock)} a round</Stat>
              <Stat label="Send cap">Used, no income</Stat>
            </dl>
          </article>
        </div>
      </section>
    </main>
  );
}
