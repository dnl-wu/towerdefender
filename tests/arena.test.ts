import { strict as assert } from "node:assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createUser, ensureBots, userById } from "../src/server/accounts.ts";
import { activeMatch, expireDueMatches, findMatch, recentlyFinished, resign, submit } from "../src/server/arena.ts";
import type { DurableHost } from "../src/server/host.ts";

test("durable arena resumes committed turns and processes a retried alarm only once", async () => {
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
    await context.run(host, async () => {
      ensureBots();
      const a = createUser("alpha", "alpha-password");
      const b = createUser("bravo", "bravo-password");
      const [one, retry, two] = await Promise.all([a, a, b].map(user => findMatch(user, { mode: "ranked" })));
      assert.equal(one.match.id, retry.match.id);
      assert.equal(two.match.id, one.match.id);
      const { match } = one;
      submit(match, 0, [{ type: "send", unit: "kobold" }], true);
      const deadline = match.deadline;
      assert.equal(alarm, deadline);

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
      assert.equal(alarm, null);
      assert.equal(userById(a.id)?.games, 1);
      assert.equal(recentlyFinished(a.id)?.state.winner, 0);
    });
  } finally {
    globals.__tdHostContext = prior;
    db.close();
  }
});
