// Wrangler serves static assets directly. Every dynamic request for this arena
// runs against the same SQLite database and the same matchmaking queue.
import { AsyncLocalStorage } from "node:async_hooks";
import { DurableObject } from "cloudflare:workers";
import next from "./.open-next/worker.js";
import { expireDueMatches } from "./src/server/arena.ts";

export * from "./.open-next/worker.js";

const context = new AsyncLocalStorage();
globalThis.__tdHostContext = context;

export class TowerArena extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.host = {
      sql: ctx.storage.sql,
      schedule(deadline) {
        ctx.waitUntil(deadline === null ? ctx.storage.deleteAlarm() : ctx.storage.setAlarm(deadline));
      },
    };
  }

  fetch(request) {
    return context.run(this.host, () => next.fetch(request, this.env, this.ctx));
  }

  alarm() {
    return context.run(this.host, () => expireDueMatches());
  }
}

export default {
  fetch(request, env) {
    return env.ARENA.getByName("public-arena").fetch(request);
  },
};
