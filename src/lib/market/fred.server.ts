import { readCache, writeCache } from "./store.server.ts";
import { fetchTextRetry, singleFlight } from "./fetch-util.ts";
import { mergeTail, parseFredCsv, planFred, sliceFrom, type FredEntry, type Obs } from "./fred.ts";

/**
 * One FRED cache for every tab (board, stability, panic, frontier). Series are kept in memory and on disk,
 * so a container restart doesn't re-download decades of history, and an update only asks FRED for the
 * recent tail (with an overlap for revisions). The full history is re-read once a week.
 */

const CACHE_NAME = "fred-series";
const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";
let book: Record<string, FredEntry> | null = null;
// FRED's graph CSV endpoint is free and keyless; keep a modest ceiling so a cold start stays polite.
const MAX_PARALLEL = 8;
let active = 0;
const waiting: Array<() => void> = [];

function entries(): Record<string, FredEntry> {
  book ??= readCache<Record<string, FredEntry>>(CACHE_NAME) ?? {};
  return book;
}

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

function csvUrl(id: string, cosd: string): string {
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}${cosd ? `&cosd=${cosd}` : ""}`;
}

/** Observations for `id` from `start` (YYYY-MM-DD, or "" for the full history). */
export async function fredObs(id: string, start = "", options: { fresh?: boolean; timeoutMs?: number } = {}): Promise<Obs[]> {
  const all = entries();
  const plan = planFred(all[id], start, Date.now(), options.fresh === true);
  if (plan.kind === "hit") return sliceFrom(all[id].obs, start);
  const key = `${id}|${plan.kind}|${plan.kind === "tail" ? plan.cosd : plan.from}`;
  return singleFlight(key, async () => {
    const now = Date.now();
    const current = entries()[id];
    try {
      if (plan.kind === "full") {
        const obs = parseFredCsv(await limited(() => fetchTextRetry(csvUrl(id, plan.from), { headers: { "User-Agent": UA }, timeoutMs: options.timeoutMs ?? 20000 })));
        if (!obs.length) throw new Error(`${id} returned no rows`);
        entries()[id] = { from: plan.from, checkedAt: now, fullAt: now, obs };
      } else {
        const tail = parseFredCsv(await limited(() => fetchTextRetry(csvUrl(id, plan.cosd), { headers: { "User-Agent": UA }, timeoutMs: options.timeoutMs ?? 20000 })));
        entries()[id] = { ...current, checkedAt: now, obs: mergeTail(current.obs, tail) };
      }
      writeCache(CACHE_NAME, entries());
    } catch (error) {
      // Serve what we have rather than nothing; throw only when there is no usable copy.
      if (!current?.obs.length) throw error;
    }
    return sliceFrom(entries()[id].obs, start);
  });
}

/** Latest value of a series, or null. */
export async function fredLast(id: string): Promise<number | null> {
  try {
    const obs = await fredObs(id, "");
    return obs.at(-1)?.value ?? null;
  } catch {
    return null;
  }
}
