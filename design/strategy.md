# Fog of war, goblins, feints, resale, War Drums and the difficulty curve

Notes behind the current balance. Every number here comes from the tables in `src/engine/data.ts`, and the experiments can be rerun with the commands at the end.

## One purse, hidden boards

Both agents buy from the same arena shop and pay for towers, upgrades, raiders and Scanners from one purse. The send cap (50 + 20 × round gold) limits how much can be spent on raiders in a round; it is not extra money. Raiders cannot be resold. Towers can.

The game is deterministic, so with everything visible it reduces to calculation, and an agent wired to a copy of the engine beats one that reasons. Hiding information makes it a game of reading the opponent instead, like poker:

- **Private:** the opponent's board, gold and income, and everything they do this round.
- **Public:** their lives, the raiders they send at you (when they arrive), the map and the neutral waves.
- **Earned by contact:** a tower that strikes or slows a raider you sent is revealed after the round. Sends become probes; a Beacon or an idle tower can stay secret.
- **Bought:** a Scanner shows the whole base as the round opened. It costs 45 gold in round 1, 4 less each round, and 5 from round 11, so it is a real sacrifice early, when bases are small, and nearly free late, when one look can redirect hundreds of gold of raiders. One per round; the turn stays open to act on it. The value of a look depends on whether it would change your decision ([value of perfect information](https://inst.eecs.berkeley.edu/~cs188/textbook/vpis/vpi.html)).

What you know goes stale: entries carry the round they were seen, and a later Scanner drops towers that are gone.

Spectating follows the same rules, because anything a viewer can load, an agent can load too. During a live match each player, signed in, sees their own lane and only what their agent knows of the other; everyone else sees lives. The finished replay is public in full, like cards at a showdown.

## Feints and resale

Kuhn poker shows how a small game can combine an observable action with private information: the same public bet supports several readings ([OpenSpiel's Kuhn poker](https://github.com/google-deepmind/open_spiel/blob/master/open_spiel/games/kuhn_poker/kuhn_poker.cc)). A Scanner reveals the opponent’s opening board. Their moves during the round stay hidden. A cannon on the first bend might be a lasting commitment to splash, or bait for an imp send just before the defender sells it for flak. An attacker who always believes the board can be punished; one who always disbelieves it wastes gold.

**Selling returns 70% of everything spent on a tower, rounded down.** That makes a pivot affordable but never free. Selling a 70-gold cannon to buy a 50-gold flak tower:

| Refund rate | Sale proceeds | Extra gold needed for flak | Gold lost on the cannon |
| --- | ---: | ---: | ---: |
| 50% | 35 | 15 | 35 |
| 60% | 42 | 8 | 28 |
| **70%** | **49** | **1** | **21** |
| 80% | 56 | 0 | 14 |

At 70% the switch needs one gold more than the sale returns. Reversing it costs another 15 on the flak sale, so a full feint costs 36 gold, about one gatling. Upgrades count toward the resale value.

## Goblins and Laser Sentries

A goblin is a thief. It has 12 health (scaled by round like everything else), runs fast, costs no lives, and is **sneaky**: a tower ignores it while any other enemy is in range, unless that tower targets the weakest enemy. Each goblin that reaches the core takes 6 gold plus 1 per round from the defender's payout and gives it to the sender; a defender is never pushed below zero. An order is 6 goblins for 30 gold and adds 2 income.

Sneakiness is what makes goblins a decision rather than a free kill. Without it, a goblin outran its pack, became the "first" target of every tower, and died. Sent at bot-built boards, 90 gold of goblins stole about 7 gold. With it:

| Board (rounds 4, 7 and 10, 63 boards) | Gold stolen by 18 goblins (90 gold) |
| --- | ---: |
| As the bot built it | 24.0 |
| Plus one Gatling on the best open tile | 19.5 |
| Plus one Laser Sentry on the same tile | 5.3 |

The **Laser Sentry** (45 gold) always targets the weakest enemy in range, cannot be retargeted, has medium reach and hits ground and air. It is the counter: one Laser Sentry cuts theft by about 78%, against about 19% for a Gatling of similar price. Any tower set to "weak" also sees goblins, at the cost of whatever it was doing. Splash and chain damage kill goblins incidentally, which is part of the counterplay.

## The difficulty curve

Gold went up so there is more to spend each round: 300 starting gold, 60 base income, and bounties about 50% higher. Enemies got much tougher to compensate, especially late:

- Health and shields grow 12% per round until round 8, then 13% per round.
- Neutral waves grow faster: a threat budget of 14 + 6 × (round − 1) + 0.3 × (round − 1)².
- Waves arrive more densely, so a battle takes 10–30 simulated seconds, and the spectator view plays them 1.6× faster.

The target was that careless defence dies early, decent defence mid-game, and even strong defence cannot simply wait out the clock. Each house bot alone against the neutral waves, with an opponent that never builds or sends (24 seeds):

| Bot | How it plays | Dies in round (median, 10th–90th percentile) |
| --- | --- | --- |
| Rustbucket | Random gatlings and cannons | 8 (6–10) |
| Patchwork | A fixed rotation of towers | 13 (10–15) |
| Foreman | Builds for the forecast, no checking | 13 (11–15) |
| Overseer | Simulates each round, buys what is needed | 16 (13–18) |
| Tyrant | Same, plus simulated attacks, War Drums and a margin for hidden bursts | 15 (14–17) |

Measured again after War Drums and bot temperaments were added (November 2026). In head-to-head play the ladder is in strength order, and matches between the two strongest bots end around round 9, decided by sends. Winning means pressuring the other lane, not outlasting it.

## Where agents could game the system

Agents bring their own tools, and the engine is open source, so any rule that can be computed will be. A review in November 2026 looked for places where computing beats playing. All figures below come from `pnpm exploits`.

**House bots could be replicated, and farmed.** The bots were deterministic: given the seed and the moves you made, a copy of the engine reproduced the bot's every decision, including its hidden board and this round's sends. Tyrant's own logic, planning against such a replica, beat Tyrant in 93% of matches, against 50% without it, and beat Overseer in all of them. Ranked falls back to a house bot when nobody is queued, and Elo kept paying a little for each expected win, so an agent could climb the ladder without meeting a person.

- *Rework:* each match now gives its house bots a secret temperament, drawn from a salt the server keeps in its own copy of the match log and never sends out. It varies how much gold they hold back, when they scan, how they weigh attacks, and, when the best tiles are nearly equal, where they build. A replica that has to guess the salt knows the bot's board exactly in 27% of rounds, not 100%, and its win rate falls to 68% (88% when it guesses right; these are today's figures, after the burst margin below). What remains is the ordinary edge of having studied an opponent's habits.
- *Rework:* a win over a house bot can no longer lift a rating more than 100 above that bot's rating. Losses still count. The bots set the floor of the ladder, and only matches between people's agents reach the top. This follows the arena's purpose: house bots are for practice.

**The ranked seed gave away the whole match.** `find_match` returned the seed in ranked play. With the open engine it reveals every neutral wave for all 24 rounds, not the three that are forecast. It is now returned only in practice, where you choose the seed anyway. A player's own browser still receives it to replay their lane, so a person could pass it to their agent. Closing that path would mean sending the replay its waves instead of a seed; it is noted, not done.

**A defence could be solved to the last gold.** The neutral wave is forecast and deterministic, so an agent with the engine can buy exactly the defence that holds it and spend everything else on income. The only uncertainty was what the opponent sent. Measured with the bots, raiders are mostly an economy: they took 3.7 lives per 100 gold.

- *Rework, War Drums:* from round 3, a player can beat War Drums once a round, from the send cap and with no income. Every enemy in the opponent's lane, the neutral wave included, moves 20% faster for that battle. Drums are hidden until the battle, so they punish exactly the defence that was built to just hold the forecast, and reward keeping a margin. Frost Vents still slow a hastened enemy. When the bots choose drums, they take 8.6 lives per 100 gold, more than twice what raiders do, but beating drums every round wins none of 40 matches against a player who picks their moments (3% before Tyrant kept a margin for hidden bursts): the gold has to come from defence or income. At a 30% speed boost, one early purchase cost the defender about six lives, a third of the core, so the boost was cut to 20%.

**Tyrant could be lulled, then burst.** Tyrant expected the opponent to repeat its last send and bought exactly the defence its simulation said would hold that, with no margin. A player that sent one kobold order a round for eight rounds, then spent its whole send cap on kobolds, took 31 of Tyrant's 20 lives in one round; this happened in a live practice match in November 2026. With one or two orders that round, Tyrant would have lost nothing. Measured against a quiet opponent, a surprise full-cap kobold burst from round 6 cost Tyrant 5.2 lives on average and half its remaining lives or more in 21% of rounds.
- *Rework:* raiders are hidden until the battle, so Tyrant no longer reads a quiet round as a promise. From round 5 it also covers a burst of kobolds, the cheapest swarm, up to a share of the send cap drawn from its per-match temperament (60–90%), on top of whatever the repeat already covers. The same burst now costs it 1.3 lives on average and is crippling in 2% of rounds. The caution made Tyrant stronger, not weaker: Foreman's wins against it fell from 42% to 23% and Patchwork's from 20% to 7%, because their raids had partly been the same surprise. Against Overseer it wins 87% of matches as one seat (95% before) and loses 38% as the other (43% before); the ladder keeps its order.

**Checked and left alone.** Pure income play does not dominate. A defence-only bot that spent its whole send cap on kobolds every round won none of 20 matches against Tyrant, and the best single-unit version, orcs, won 40%. Late Scanners are nearly free, but matches between strong players are decided by round 10, while the price is still meaningful. Two accounts trading wins in ranked is possible; stopping it needs rules about accounts, not the game.

## Reproduce

```sh
pnpm solo 24      # survival table above
pnpm goblins 40   # goblin theft table above
pnpm balance 12   # round-robin between house bots
pnpm exploits 40  # bot replicas, drum spam, what drums take per gold, and surprise bursts
```
