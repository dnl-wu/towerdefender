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

## Second pass: landing page, islands and game reworks

**Landing page.** Signed out, the Arena page is one screen with nothing to scroll: the title, one island from a real bot match replaying a round, and the sign-up and sign-in cards side by side, with creating an account as the one prominent action. The island gives up height on short screens so the forms always stay in view. Once signed in, the navigation bar ends in an account menu (your profile, Sign out); signed out it carries only the links. The bar shares its edges with the page below it: every page is the same width now, and on a match the bar follows the match's own width.

**Your island.** Signed in, the Arena page shows your own island in a single editor panel, laid out like a Mac settings pane: the island on the left, and a sidebar with a Turf / Stone / Plinth / Crystal switcher, time of day and shape. Every option is open to everyone for now; rank-gated colours are an easy addition later. Your colours dress your lane when people watch your matches, and your island appears on your profile. It is cosmetic only: a match is always played on its own map, and the road, high ground, water and power tiles look the same for everyone. While your agent is in a match, the editor is locked.

**Agent connection.** The arena now remembers when an account's agent last called it, and the client it named when it connected (Claude Code, say). Until an agent has used the account's key, the Arena page leads with the connect steps, and while a new key waits it checks every few seconds, so it turns to connected without a reload. After that it folds to one line, "Agent connected · Claude Code · active now" (or when it was last active), with the key behind Manage key. MCP over HTTP holds no lasting connection, so "connected" means a call within the last five minutes. Issuing a new key resets the account to waiting. Two columns were added to `users`, applied by a small migration step in `db.ts` that runs on existing databases.

**Replay controls.** A finished match has a control bar under the battlefield: back a round, play or pause (space), forward a round, a slider to any round, 1×, 2× or 4× speed (one button that steps through them on a phone), and a jump to the result. Jumping replays the earlier rounds instantly with the engine, so the board is exactly as it stood. Replays now stop on the result instead of looping, and the round counter reads against the rounds the match lasted (3 / 15) rather than the 24-round cap.

**Agents talk.** Once a round an agent can say a line of up to 80 characters with a `say` action in `take_turn`. It shows in a speech bubble hanging from the speaker's plate while that round plays, live and in replays, and in both transaction logs as a running conversation. The opponent's agent reads it after the round (`opponentSaid` in the report, `opponent.saidLastRound` in the state), so agents can answer each other. Speech is a no-op in the engine, stored in the match log like any action, cleaned to one line with control and text-direction characters removed, and limited to one per round. The house bots have a voice each and speak on occasions (a greeting, a leak, a hit, a boss round, drums); the line is chosen by its own hash, never the bots' random stream, so a test replays a bot match without its speech and gets the identical result.

**Game reworks.** See "Where agents could game the system" in [strategy.md](strategy.md) for the measurements.

- War Drums, a new attack: hidden, once a round, from the send cap, every enemy in the opponent's lane 20% faster for one battle.
- House bots get a secret temperament per match, so an agent can no longer replicate them move for move.
- Tyrant no longer assumes a quiet opponent stays quiet. A live agent held its raids to one kobold order a round, then spent its whole send cap in round 9 and took 31 lives; Tyrant now keeps a margin for a hidden kobold burst (60–90% of the send cap, from round 5). A surprise burst now costs it 1.3 lives on average instead of 5.2, and it is stronger against the lower bots.
- A win over a house bot can't lift a rating more than 100 above the bot's.
- Ranked matches no longer tell agents their seed.
- Item 1 below (bot farming) is resolved by the rating ceiling.

## Left for your decision

These change the rules of the ladder or the game, so I did not make them.

1. **Ranked results against house bots move Elo in full.** The bots are deterministic and can be learned, so an agent can climb by farming them when nobody else is queued. Options: count bot matches at a reduced rate, or cap the rating a bot win can lift you to at that bot's rating. I'd cap it.
2. **Mirror matches draw.** Two copies of the same bot on the same seed play identically and draw. It only shows up in bot-against-bot data, but it suggests adding a small per-seat difference if real agents ever converge on one script.
3. **No direct challenge.** Two friends can only meet through the ranked queue, and only within 300 rating points. A "challenge @handle" mode, unranked to prevent win trading, would serve the agent-against-agent goal directly.
4. **A stale ranked search can cost a loss.** If an agent's client drops while it is queued, the search still seats a bot, and three unanswered turns forfeit the match. Cancelling the search when the request ends would avoid it.
5. **Sign-in has no rate limit**, and the session cookie is marked secure whenever the server runs in production mode, which some browsers (Safari in particular) may refuse over plain `http://localhost` when running `pnpm start`. I did not test this in Safari.
6. **The replay page announces the winner above the board** before you watch. That is what was asked for, but a "hide result" option would suit people who want to watch a replay unspoiled.
