# Fog of war, goblins, feints, resale and the difficulty curve

Notes behind the current balance. Every number here comes from the tables in `src/engine/data.ts`, and the experiments can be rerun with the commands at the end.

## One purse, hidden boards

Both agents buy from the same arena shop and pay for towers, upgrades, raiders and Scanners from one purse. The send cap (50 + 20 × round gold) limits how much can be spent on raiders in a round; it is not extra money. Raiders cannot be resold. Towers can.

The game is deterministic, so with everything visible it reduces to calculation, and an agent wired to a copy of the engine beats one that reasons. Hiding information makes it a game of reading the opponent instead, like poker:

- **Private:** the opponent's board, gold and income, and everything they do this round.
- **Public:** their lives, the raiders they send at you (when they arrive), the map and the neutral waves.
- **Earned by contact:** a tower that strikes or slows a raider you sent is revealed after the round. Sends become probes; a Relay or an idle tower can stay secret.
- **Bought:** a Scanner shows the whole base as the round opened. It costs 45 gold in round 1, 4 less each round, and 5 from round 11, so it is a real sacrifice early, when bases are small, and nearly free late, when one look can redirect hundreds of gold of raiders. One per round; the turn stays open to act on it. The value of a look depends on whether it would change your decision ([value of perfect information](https://inst.eecs.berkeley.edu/~cs188/textbook/vpis/vpi.html)).

What you know goes stale: entries carry the round they were seen, and a later Scanner drops towers that are gone.

Spectating follows the same rules, because anything a viewer can load, an agent can load too. During a live match each player, signed in, sees their own lane and only what their agent knows of the other; everyone else sees lives. The finished replay is public in full, like cards at a showdown.

## Feints and resale

Kuhn poker shows how a small game can combine an observable action with private information: the same public bet supports several readings ([OpenSpiel's Kuhn poker](https://github.com/google-deepmind/open_spiel/blob/master/open_spiel/games/kuhn_poker/kuhn_poker.cc)). Here the opponent's opening board is public and this round's changes are private. A mortar on the first bend might be a lasting commitment to splash, or bait for a drone send just before the defender sells it for flak. An attacker who always believes the board can be punished; one who always disbelieves it wastes gold.

**Selling returns 70% of everything spent on a tower, rounded down.** That makes a pivot affordable but never free. Selling a 70-gold mortar to buy a 50-gold flak tower:

| Refund rate | Sale proceeds | Extra gold needed for flak | Gold lost on the mortar |
| --- | ---: | ---: | ---: |
| 50% | 35 | 15 | 35 |
| 60% | 42 | 8 | 28 |
| **70%** | **49** | **1** | **21** |
| 80% | 56 | 0 | 14 |

At 70% the switch needs one gold more than the sale returns. Reversing it costs another 15 on the flak sale, so a full feint costs 36 gold, about one nailgun. Upgrades count toward the resale value.

## Goblins and Sentinels

A goblin is a thief. It has 10 health (scaled by round like everything else), runs fast, costs no lives, and is **sneaky**: a tower ignores it while any other enemy is in range, unless that tower targets the weakest enemy. Each goblin that reaches the core takes 6 gold plus 1 per round from the defender's payout and gives it to the sender; a defender is never pushed below zero. An order is 6 goblins for 30 gold and adds 2 income.

Sneakiness is what makes goblins a decision rather than a free kill. Without it, a goblin outran its pack, became the "first" target of every tower, and died. Sent at bot-built boards, 90 gold of goblins stole about 7 gold. With it:

| Board (rounds 4, 7 and 10, 69 boards) | Gold stolen by 18 goblins (90 gold) |
| --- | ---: |
| As the bot built it | 40.0 |
| Plus one Nailgun on the best open tile | 25.9 |
| Plus one Sentinel on the same tile | 5.8 |

The **Sentinel** (45 gold) always targets the weakest enemy in range, cannot be retargeted, has long reach and hits ground and air. It is the counter: one Sentinel cuts theft by about 85%, against about 35% for a Nailgun of similar price. Any tower set to "weak" also sees goblins, at the cost of whatever it was doing. Splash and chain damage kill goblins incidentally, which is part of the counterplay.

## The difficulty curve

Gold went up so there is more to spend each round: 300 starting gold, 60 base income, and bounties about 50% higher. Enemies got much tougher to compensate, especially late:

- Health and shields grow 12% per round until round 8, then 13% per round.
- Neutral waves grow faster: a threat budget of 14 + 6 × (round − 1) + 0.3 × (round − 1)².
- Waves arrive more densely, so a battle takes 10–30 simulated seconds, and the spectator view plays them 1.6× faster.

The target was that careless defence dies early, decent defence mid-game, and even strong defence cannot simply wait out the clock. Each house bot alone against the neutral waves, with an opponent that never builds or sends (24 seeds):

| Bot | How it plays | Dies in round (median, 10th–90th percentile) |
| --- | --- | --- |
| Rustbucket | Random nailguns and mortars | 10 (8–10) |
| Patchwork | A fixed rotation of towers | 14 (11–16) |
| Foreman | Builds for the forecast, no checking | 14 (13–18) |
| Overseer | Simulates each round, buys what is needed | 19 (16–21) |
| Tyrant | Same, plus simulated attacks | 18 (16–20) |

In head-to-head play the ladder is in strength order, and matches between the two strongest bots end around round 10, decided by sends. Winning means pressuring the other lane, not outlasting it.

## Reproduce

```sh
pnpm solo 24      # survival table above
pnpm goblins 40   # goblin theft table above
pnpm balance 12   # round-robin between house bots
```
