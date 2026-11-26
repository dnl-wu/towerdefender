# Review notes, 26 November 2026

A review of the navigation, guide, rules, profile and match-score work, followed by fixes and improvements to the site and the game. Everything listed under "Fixed" and "Added" is in the code and covered by `pnpm typecheck`, `pnpm test` (22 tests) and the Cloudflare build.

## Fixed in the earlier work

| Where | What was wrong | Now |
| --- | --- | --- |
| Match scores | A fallen core showed its negative life total, such as "-3 / 17 lives". | A fallen core reads as 0. Negative totals appear only when both cores fell in the same round, where they decide the winner. |
| Match scores | A resignation or forfeit looked like an ordinary loss at "20 / 20 lives". | The score line says "by resignation" or "by forfeit". |
| Match lists | Win, Loss and Draw were all the same colour, with no rating change or date. | Wins are green and losses red. Ranked matches show the rating gained or lost. Each row says how long ago it ended. |
| Navigation | The links sat in a wider column than the page beneath, so nothing lined up. | One bar the width of the widest page, with the site name. It scrolls sideways on a phone. |
| Troops & towers | No stats: no health, speed, armour, damage, fire rate or range. Tower upgrades were hidden in a collapsed section. | Each troop shows health, shield, speed, armour, bounty and its send terms. Each tower shows every level and both specialisations with cost, damage per second and range. |
| Piece icons | Icons were set on an image with no source, which shows the alt text until the script runs. | An empty tile of the same size holds the place until the icon is drawn. |
| How to play | Said your agent sees "incoming raiders". Planning is simultaneous, so it sees them only after the round. | Reworded. The Scanner's cheapest round is now computed from the price table. |
| Profile | Only a handle, three numbers and a list. | See "Added". |
| `package.json` | `pnpm seed` pointed at a script that does not exist. | Removed. |
| Live summary | Starting lives were hard-coded as 20. | Read from the rules table. |

## Added

**Leaderboard page.** The ranked ladder existed only as an MCP tool. `/leaderboard` now shows rank, rating, record and streak, with your own row highlighted. Players still in placement are listed separately.

**Fuller profiles.** Each profile shows the account's warden portrait, rank with progress to the next division, win rate, streak, peak rating, the last ten ranked results and a chart of rating after each ranked match. On your own profile you can set your tagline and the model your agent runs on. These fields existed in the database with no way to edit them.

**Playbook page.** The MCP tools told agents that their operator edits the playbook and can see results per version, but the site had no playbook screen. `/playbook` lets you read and edit it, and lists every version with its author, note and win–loss record. Playbooks stay private to the account.

**Longer wait for a human opponent.** A ranked search gave another player 10 seconds to turn up before seating a house bot, which made arranged matches between two people's agents hard to start. `find_match` now takes `wait_seconds`, up to 45.

**Debrief fix.** `livesLostBy` in the match debrief has a `fromSends` flag that was always false. Lost lives are now split by unit and by origin, so kobolds leaking from the neutral wave and kobolds sent by the opponent appear as separate lines.

**Consistent ranks.** "Unranked until five ranked matches" was decided in three places and skipped in the agent's leaderboard tool. One function now decides it everywhere.

## Left for your decision

These change the rules of the ladder or the game, so I did not make them.

1. **Ranked results against house bots move Elo in full.** The bots are deterministic and can be learned, so an agent can climb by farming them when nobody else is queued. Options: count bot matches at a reduced rate, or cap the rating a bot win can lift you to at that bot's rating. I'd cap it.
2. **Mirror matches draw.** Two copies of the same bot on the same seed play identically and draw. It only shows up in bot-against-bot data, but it suggests adding a small per-seat difference if real agents ever converge on one script.
3. **No direct challenge.** Two friends can only meet through the ranked queue, and only within 300 rating points. A "challenge @handle" mode, unranked to prevent win trading, would serve the agent-against-agent goal directly.
4. **A stale ranked search can cost a loss.** If an agent's client drops while it is queued, the search still seats a bot, and three unanswered turns forfeit the match. Cancelling the search when the request ends would avoid it.
5. **Sign-in has no rate limit**, and the session cookie is marked secure whenever the server runs in production mode, which some browsers (Safari in particular) may refuse over plain `http://localhost` when running `pnpm start`. I did not test this in Safari.
6. **The replay page announces the winner above the board** before you watch. That is what was asked for, but a "hide result" option would suit people who want to watch a replay unspoiled.
