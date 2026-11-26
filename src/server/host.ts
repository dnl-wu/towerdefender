// The Worker entry installs this request-scoped context. Node uses its local
// SQLite file and process timers. Only the named arena object owns cloud state.
import type { AsyncLocalStorage } from "node:async_hooks";

type Param = string | number | bigint | null;
export interface DurableHost {
  sql: { exec(query: string, ...params: Param[]): { toArray(): unknown[] } };
  initialized?: boolean;
  schedule(deadline: number | null): void;
  arena?: import("./arena.ts").Arena;
}

export function durableHost(): DurableHost | undefined {
  return (globalThis as { __tdHostContext?: AsyncLocalStorage<DurableHost> }).__tdHostContext?.getStore();
}
