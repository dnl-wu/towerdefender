// The MCP surface: everything an agent can do. One server instance is built
// per request, bound to the authenticated player.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RULES, TARGETINGS, TOWER_TYPES, UNIT_TYPES, scannerPrice } from "../engine/data.ts";
import { towerAliases, unitAliases } from "../engine/match-log.ts";
import type { Action } from "../engine/duel.ts";
import { roundReport } from "../engine/report.ts";
import { rulesHandbook } from "../engine/rules.ts";
import { mapView, scoutView, stateView } from "../engine/view.ts";
import { PLAYBOOK_LIMIT, latestPlaybook, leaderboard, savePlaybook, userById, type User } from "./accounts.ts";
import {
  CLOCK, activeMatch, countCall, findMatch, recentlyFinished, matchDebrief, matchRow, playerIndex, recentMatches, resign, submit, waitForRound,
  type LiveMatch,
} from "./arena.ts";
import { PLACEMENT_GAMES, rankFor, rankLabel } from "./rating.ts";

const INSTRUCTIONS = `TOWERDEFENDER is a ranked tower-defence duel played by AI agents. You are the player.

Loop:
1. get_playbook — notes from your operator and from your past matches. Read them first.
2. get_rules — once per session. Every number in the game is in there.
3. find_match — starts or resumes a match and returns the map and your opening state.
4. Each round: decide, then call take_turn with all your actions in one call. It ends your turn, waits for the round to resolve and returns a report plus your new state. Their board, gold and income are hidden (fog of war): scout_opponent lists what your raiders and Scanners have revealed, and deploy_scanner buys a full look at their base as this round opened, leaving your turn open.
5. When the match ends, read get_debrief and save what you learned with save_playbook.

Planning is on a clock. Batch your actions; do not spend a call per tower.`;

type Content = { type: "text"; text: string };
const ok = (data: unknown, ...texts: string[]) => ({ content: [{ type: "text", text: JSON.stringify(data) }, ...texts.map((t) => ({ type: "text", text: t }))] as Content[] });
const fail = (message: string) => ({ content: [{ type: "text", text: message }] as Content[], isError: true });

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("build"), tower: z.enum([...TOWER_TYPES, ...Object.keys(towerAliases)] as [string, ...string[]]), x: z.number().int(), y: z.number().int(),
    targeting: z.enum(TARGETINGS as [string, ...string[]]).optional().describe("Defaults to first."),
  }),
  z.object({ type: z.literal("upgrade"), id: z.number().int().describe("Tower id."), spec: z.enum(["a", "b"]).optional().describe("Required only when upgrading a level 3 tower.") }),
  z.object({ type: z.literal("sell"), id: z.number().int() }),
  z.object({ type: z.literal("target"), id: z.number().int(), mode: z.enum(TARGETINGS as [string, ...string[]]) }),
  z.object({ type: z.literal("send"), unit: z.enum([...UNIT_TYPES, ...Object.keys(unitAliases)] as [string, ...string[]]), orders: z.number().int().min(1).optional().describe("Number of orders, default 1.") }),
]);

function clock(m: LiveMatch) {
  return { secondsLeftThisRound: Math.max(0, Math.round((m.deadline - Date.now()) / 1000)) };
}

function profileView(u: User) {
  const rank = rankFor(u.rating);
  return {
    handle: u.handle, rating: Math.round(u.rating), rank: u.games < PLACEMENT_GAMES ? `Unranked (placement ${u.games}/${PLACEMENT_GAMES})` : rank.label,
    nextRankAt: rank.next, peakRating: Math.round(u.peak_rating),
    record: { games: u.games, wins: u.wins, losses: u.losses, draws: u.draws, streak: u.streak },
  };
}

export function buildMcpServer(user: User): McpServer {
  const server = new McpServer({ name: "towerdefender", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  /** The caller's current match, or a clear error. */
  const current = (): { m: LiveMatch; p: 0 | 1 } | string => {
    const m = activeMatch(user.id);
    if (!m) return "You are not in a match. Call find_match to start one.";
    const p = playerIndex(m, user.id);
    if (p === null) return "You are not a player in that match.";
    countCall(m, p);
    return { m, p };
  };

  const stateResponse = (m: LiveMatch, p: 0 | 1, extra: Record<string, unknown> = {}) => {
    const { board, ...view } = stateView(m.state, p);
    return ok({ matchId: m.id, mode: m.mode, ...extra, ...clock(m), ...view }, `Your board:\n${board}`);
  };

  const finalResult = (m: LiveMatch, p: 0 | 1) => {
    const me = userById(user.id)!;
    const row = matchRow(m.id);
    const before = p === 0 ? row?.rating0_before : row?.rating1_before;
    const w = m.state.winner;
    return {
      matchOver: true,
      result: w === "draw" ? "draw" : w === p ? "win" : "loss",
      reason: m.state.endReason,
      rating: m.mode === "ranked" ? { before: Math.round(before ?? me.rating), after: Math.round(me.rating), rank: profileView(me).rank } : "Practice match: rating unchanged.",
      next: "Call get_debrief for the full analysis, then save_playbook with what you learned.",
    };
  };

  server.registerTool("get_rules", {
    title: "Rules handbook",
    description: "The complete rules: towers, units, sends, economy, combat maths and scaling. Read once per session before playing.",
    annotations: { readOnlyHint: true },
  }, async () => ({ content: [{ type: "text", text: rulesHandbook(activeMatch(user.id)?.state.map.rulesVersion) }] }));

  server.registerTool("get_profile", {
    title: "Your profile", description: "Your rating, rank and record.", annotations: { readOnlyHint: true },
  }, async () => ok(profileView(userById(user.id)!)));

  server.registerTool("get_playbook", {
    title: "Read your playbook",
    description: "Your persistent strategy notes. Your operator edits these between matches and you can update them with save_playbook. Read before every match.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const pb = latestPlaybook(user.id);
    if (!pb) return ok({ version: 0, content: "", note: "No playbook yet. After a match, save what you learned with save_playbook." });
    return ok({ version: pb.version, lastEditedBy: pb.author, changeNote: pb.note }, pb.content);
  });

  server.registerTool("save_playbook", {
    title: "Save your playbook",
    description: `Replace your playbook with new content (max ${PLAYBOOK_LIMIT} characters). This creates a new version; results are tracked per version and shown to your operator on the website's Playbook page, so they can see whether a change helped. Keep what works, cut what does not.`,
    inputSchema: {
      content: z.string().describe("The full new playbook text. It replaces the old one."),
      note: z.string().optional().describe("One line on what changed and why."),
    },
  }, async ({ content, note }) => {
    try {
      const pb = savePlaybook(user.id, content, "agent", note ?? "");
      return ok({ saved: true, version: pb.version });
    } catch (e) {
      return fail((e as Error).message);
    }
  });

  server.registerTool("find_match", {
    title: "Find a match",
    description: "Start a match, or resume the one you are already in. Ranked pairs you with a player near your rating who is searching at the same time (a house bot if nobody turns up) and moves your rating. Practice plays a house bot with a longer clock and no rating change. Returns the map and your opening state.",
    inputSchema: {
      mode: z.enum(["ranked", "practice"]).describe("ranked or practice"),
      opponent: z.enum(["rustbucket", "patchwork", "foreman", "overseer", "tyrant"]).optional().describe("Practice only: which house bot, weakest to strongest. Defaults to the one nearest your rating."),
      seed: z.number().int().optional().describe("Practice only: replay a specific map and wave schedule to compare approaches."),
      wait_seconds: z.number().int().min(0).max(CLOCK.maxQueueWait / 1000).optional().describe(`Ranked only: how long to hold out for another player before a house bot takes the seat. Default ${Math.round(CLOCK.queueWait() / 1000)}. Ask for the maximum when your operator has arranged to meet another player's agent.`),
    },
  }, async ({ mode, opponent, seed, wait_seconds }) => {
    const { match: m, resumed } = await findMatch(userById(user.id)!, { mode, opponent, seed, waitMs: wait_seconds === undefined ? undefined : wait_seconds * 1000 });
    const p = playerIndex(m, user.id)!;
    countCall(m, p);
    const opp = userById(m.users[1 - p])!;
    const { grid, pathCellsWithin2_6, ...map } = mapView(m.state.map);
    const { board, ...view } = stateView(m.state, p);
    return ok(
      {
        matchId: m.id, mode: m.mode, resumed, seed: m.state.seed,
        versus: { handle: opp.handle, rating: Math.round(opp.rating), houseBot: opp.bot_level !== null },
        ...clock(m), map, ...view,
      },
      `Map (both players have this same lane):\n${grid}`,
      `Path cells within range 2.6 of each buildable cell (higher is a better spot for short-range towers):\n${pathCellsWithin2_6}`,
      resumed ? `Your board:\n${board}` : "Your board is empty. Use take_turn to build and send.",
    );
  });

  server.registerTool("get_state", {
    title: "Match state",
    description: "Your gold, income, lives, towers, the clock, the next three neutral waves, send prices and a summary of the opponent.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const c = current();
    return typeof c === "string" ? fail(c) : stateResponse(c.m, c.p);
  });

  server.registerTool("scout_opponent", {
    title: "Scout the opponent",
    description: "Everything you know about the opponent's base: towers that struck your raiders, and towers your Scanners saw, each with the round it was last seen. Their gold and income are private. Free.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const c = current();
    if (typeof c === "string") return fail(c);
    const { board, ...view } = scoutView(c.m.state, c.p);
    return ok(view, `Their base as far as you know it:\n${board}`);
  });

  server.registerTool("deploy_scanner", {
    title: "Deploy a Scanner",
    description: `Buy a single-use Scanner (${scannerPrice(1)} gold in round 1, ${scannerPrice(1) - scannerPrice(2)} less each round, ${scannerPrice(RULES.maxRounds)} from round 11). It reveals the opponent's whole base as this round opened and updates your intel. Your turn stays open so you can act on it. One per round.`,
    inputSchema: { round: z.number().int().positive().optional().describe("Optional guard: the round you mean to scan. If the match has moved on, nothing is bought.") },
  }, async ({ round: wanted }) => {
    const c = current();
    if (typeof c === "string") return fail(c);
    const { m, p } = c;
    if (wanted !== undefined && wanted !== m.state.round) return fail(`You asked to scan round ${wanted}, but round ${m.state.round} is being planned. Nothing was bought.`);
    const [res] = submit(m, p, [{ type: "scan" }], false).results;
    if (!res.ok) return fail(res.error);
    const { board, ...view } = scoutView(m.state, p);
    return ok({ result: res.note, goldLeft: m.state.lanes[p].gold, ...view }, `Their base as round ${m.state.round} opened:\n${board}`);
  });

  server.registerTool("take_turn", {
    title: "Take your turn",
    description: "Apply a list of actions in order (build, upgrade, sell, target, send), then end your turn. Selling a tower returns 70% of everything spent on it, rounded down; the quote is resaleGold in your tower list. Each action reports success or a reason for rejection; rejected actions cost nothing. When both players have ended their turn the round is fought, and this returns the round report and your next state. Set end_turn to false to apply actions and keep planning.",
    inputSchema: {
      actions: z.array(actionSchema).max(60).describe("Applied in order. May be empty."),
      end_turn: z.boolean().optional().describe("Default true."),
    },
  }, async ({ actions, end_turn }) => {
    const c = current();
    if (typeof c === "string") return fail(c);
    const { m, p } = c;
    const round = m.state.round;
    const { results } = submit(m, p, actions as Action[], end_turn !== false);
    const outcome = results.map((r) => (r.ok ? `ok: ${r.note}` : `REJECTED: ${r.error}`));
    if (end_turn === false) return stateResponse(m, p, { actions: outcome });
    const moved = await waitForRound(m, round, 25_000);
    if (!moved) return ok({ actions: outcome, waiting: true, message: "Turn ended. The opponent is still planning. Call wait_for_round." });
    const record = m.state.history[round - 1];
    const report = record ? roundReport(m.state, p, record) : null;
    if (m.state.status === "finished") return ok({ actions: outcome, roundReport: report, ...finalResult(m, p) });
    return stateResponse(m, p, { actions: outcome, roundReport: report });
  });

  server.registerTool("wait_for_round", {
    title: "Wait for the round",
    description: "After ending your turn, wait for the opponent and the fight. Returns the round report and your next state, or asks you to call again if they are still planning.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const m = activeMatch(user.id) ?? recentlyFinished(user.id);
    if (!m) return fail("You are not in a match. Call find_match to start one.");
    const p = playerIndex(m, user.id)!;
    if (m.state.status === "planning" && !m.state.lanes[p].committed) return stateResponse(m, p, { message: "It is your turn to plan." });
    const round = m.state.round;
    const moved = m.state.status === "finished" || (await waitForRound(m, round, 25_000));
    if (!moved) return ok({ waiting: true, message: "Still waiting on the opponent. Call wait_for_round again." });
    const last = m.state.history[m.state.history.length - 1];
    const report = last ? roundReport(m.state, p, last) : null;
    if (m.state.status === "finished") return ok({ roundReport: report, ...finalResult(m, p) });
    return stateResponse(m, p, { roundReport: report });
  });

  server.registerTool("get_debrief", {
    title: "Match debrief",
    description: "Analysis of a finished match: the turning point, where your lives went, what your sends achieved, damage per gold by tower type, a round-by-round timeline against the opponent, and findings to act on. Defaults to your most recent finished match.",
    inputSchema: { match_id: z.string().optional() },
    annotations: { readOnlyHint: true },
  }, async ({ match_id }) => {
    const row = match_id ? matchRow(match_id) : recentMatches(user.id, 10).find((r) => r.status === "finished");
    if (!row) return fail("No finished match found.");
    const p = row.p0 === user.id ? 0 : row.p1 === user.id ? 1 : null;
    if (p === null) return fail("You did not play in that match.");
    const d = matchDebrief(row, p);
    if (!d) return fail("That match has not finished yet.");
    return ok({ matchId: row.id, mode: row.mode, seed: row.seed, playbookVersion: p === 0 ? row.playbook0 : row.playbook1, ...d });
  });

  server.registerTool("resign", {
    title: "Resign", description: "Concede your current match. It counts as a loss.",
    annotations: { destructiveHint: true },
  }, async () => {
    const c = current();
    if (typeof c === "string") return fail(c);
    resign(c.m, c.p);
    return ok(finalResult(c.m, c.p));
  });

  server.registerTool("get_leaderboard", {
    title: "Leaderboard", description: "The top of the ranked ladder.", annotations: { readOnlyHint: true },
  }, async () => ok(leaderboard(25).map((u, i) => ({ place: i + 1, handle: u.handle, rating: Math.round(u.rating), rank: rankLabel(u), games: u.games, houseBot: u.bot_level !== null }))));

  server.registerResource("rules", "towerdefender://rules", { title: "Rules handbook", mimeType: "text/markdown" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: rulesHandbook(activeMatch(user.id)?.state.map.rulesVersion) }],
  }));

  server.registerPrompt("play", {
    title: "Play a match",
    description: "Play one full match and update the playbook afterwards.",
    argsSchema: { mode: z.enum(["ranked", "practice"]).optional() },
  }, ({ mode }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Play one ${mode ?? "ranked"} match of TOWERDEFENDER to the end. Read your playbook and the rules first. Their base is hidden: use scout_opponent and, when it is worth the gold, deploy_scanner. Batch each round into a single take_turn call. When the match is over, read the debrief and save an improved playbook with a one-line note on what you changed.`,
      },
    }],
  }));

  return server;
}
