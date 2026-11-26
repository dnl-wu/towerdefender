import { strict as assert } from "node:assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { agentState, createUser, ensureBots, noteAgentSeen, playbookRecords, rotateApiKey, savePlaybook, userByApiKey, userById } from "../src/server/accounts.ts";
import { activeMatch, expireDueMatches, findMatch, recentlyFinished, resign, submit } from "../src/server/arena.ts";
import { run } from "../src/server/db.ts";
import { latestReplays, matchesFor, ratingHistory } from "../src/server/feed.ts";
import { BOT_CEILING } from "../src/server/rating.ts";
import type { DurableHost } from "../src/server/host.ts";

/** Run against a fresh in-memory arena, hosted the way the Durable Object hosts it. */
async function withArena(run: (host: DurableHost, alarm: () => number | null) => Promise<void>): Promise<void> {
  const db = new DatabaseSync(":memory:");
  const context = new AsyncLocalStorage<DurableHost>();
  const globals = globalThis as { __tdHostContext?: typeof context };
  const prior = globals.__tdHostContext;
  globals.__tdHostContext = context;
  let alarm: number | null = null;
  const host: DurableHost = {
    sql: { exec(query, ...params) {
      if (query.startsWith("\nCREATE TABLE")) { db.exec(query); return { toArray: () => [] }; }
      const rows = db.prepare(query).all(...params);
      return { toArray: () => rows };
    } },
    schedule(deadline) { alarm = deadline; },
  };
  try {
    await context.run(host, () => run(host, () => alarm));
  } finally {
    globals.__tdHostContext = prior;
    db.close();
  }
}

test("durable arena resumes committed turns and processes a retried alarm only once", async () => {
    await withArena(async (host, alarm) => {
      ensureBots();
      const a = createUser("alpha", "alpha-password");
      const b = createUser("bravo", "bravo-password");
      const [one, retry, two] = await Promise.all([a, a, b].map(user => findMatch(user, { mode: "ranked" })));
      assert.equal(one.match.id, retry.match.id);
      assert.equal(two.match.id, one.match.id);
      const { match } = one;
      submit(match, 0, [{ type: "send", unit: "kobold" }], true);
      const deadline = match.deadline;
      assert.equal(alarm(), deadline);

      // Eviction discards every JS object. Only SQL and the scheduled deadline survive.
      delete host.arena;
      const restored = activeMatch(b.id)!;
      assert.equal(restored.id, match.id);
      assert.equal(restored.deadline, deadline);
      assert.equal(restored.state.lanes[0].committed, true);
      assert.deepEqual(restored.state.lanes[0].sends, match.state.lanes[0].sends);
      expireDueMatches();
      assert.equal(restored.state.history.length, 0);

      restored.deadline = Date.now() - 1;
      expireDueMatches();
      assert.equal(restored.state.history.length, 1);
      assert.equal(restored.misses[1], 1);
      expireDueMatches();
      assert.equal(restored.state.history.length, 1);
      resign(restored, 1);
      delete host.arena;
      expireDueMatches();
      assert.equal(alarm(), null);
      assert.equal(userById(a.id)?.games, 1);
      assert.equal(recentlyFinished(a.id)?.state.winner, 0);
    });
});

test("match listings carry the result, how it ended and the rating change, and each playbook version keeps its own record", async () => {
  await withArena(async () => {
    ensureBots();
    const a = createUser("alpha", "alpha-password");
    savePlaybook(a.id, "Open with a cannon.", "human");

    // Nobody else is searching, so a ranked search that will not wait is seated against a house bot.
    const ranked = await findMatch(a, { mode: "ranked", waitMs: 0 });
    resign(ranked.match, 0);
    savePlaybook(a.id, "Open with a cannon. Add flak.", "agent");
    const practice = await findMatch(userById(a.id)!, { mode: "practice", opponent: "rustbucket" });
    resign(practice.match, 0);

    const [second, first] = matchesFor(a.id);
    assert.deepEqual([first.id, second.id], [ranked.match.id, practice.match.id]);
    assert.equal(first.winner, 1);
    assert.equal(first.end, "resigned");
    assert.ok(first.ratingChange[0]! < 0, "a ranked loss costs rating");
    assert.equal(first.ratingChange[1], null, "a house bot's rating never moves");
    assert.deepEqual(second.ratingChange, [null, null], "practice moves nobody");
    assert.equal(latestReplays().length, 2);

    const after = userById(a.id)!;
    assert.deepEqual(ratingHistory(a), [1000, after.rating]);
    // Rows come back from SQLite without a prototype, so copy them before comparing.
    assert.deepEqual(playbookRecords(a.id).map((r) => ({ ...r })), [
      { version: 1, games: 1, wins: 0, losses: 1, draws: 0 },
      { version: 2, games: 1, wins: 0, losses: 1, draws: 0 },
    ]);
  });
});

test("a win over a house bot cannot lift a rating more than the ceiling above the bot", async () => {
  await withArena(async () => {
    ensureBots();
    const a = createUser("climber", "climber-password");
    // Already well above the weakest bot: beating it earns nothing more.
    run("UPDATE users SET rating = 1000, games = 20 WHERE id = ?", a.id);
    const { match } = await findMatch(userById(a.id)!, { mode: "ranked", waitMs: 0 });
    const bot = userById(match.users[1])!;
    assert.ok(bot.bot_level !== null);
    run("UPDATE users SET rating = ? WHERE id = ?", bot.rating + BOT_CEILING - 2, a.id);
    resign(match, 1);
    assert.equal(userById(a.id)!.rating, bot.rating + BOT_CEILING, "the gain stops at the ceiling");
  });
});

test("an account's agent shows as waiting for a new key, connected once it calls, and idle when it goes quiet", async () => {
  await withArena(async () => {
    const user = createUser("wired", "password123");
    assert.equal(agentState(userById(user.id)!), "none");

    const key = rotateApiKey(user.id);
    const issued = userByApiKey(key)!;
    assert.equal(agentState(issued), "waiting");

    noteAgentSeen(issued, "claude-code");
    const seen = userById(user.id)!;
    assert.equal(seen.agent_client, "claude-code");
    assert.equal(agentState(seen), "active");
    assert.equal(agentState(seen, seen.agent_seen_at! + 10 * 60_000), "idle");

    // Calls without a client name keep the name from the opening message.
    noteAgentSeen({ ...seen, agent_seen_at: 0 });
    assert.equal(userById(user.id)!.agent_client, "claude-code");

    rotateApiKey(user.id);
    const fresh = userById(user.id)!;
    assert.equal(agentState(fresh), "waiting", "a replaced key has to be connected again");
    assert.equal(fresh.agent_client, "");
  });
});
