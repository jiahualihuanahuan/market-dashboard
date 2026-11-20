import { readCache, writeCache } from "../market/store.server.ts";
import { fredObs } from "../market/fred.server.ts";
import { cachedSeries, refreshSeries } from "./bars.server.ts";
import { buildDesk } from "./build.ts";
import { schedule, usMarketOpen } from "./schedule.ts";
import { allSymbols, FRED_IDS, FRED_START, incomeTickers } from "./universe.ts";
import type { DeskData, Obs } from "./types.ts";

/**
 * The one data path for the page. Answers from the last built desk at once (memory, then disk) and refreshes
 * behind it when anything is due, so a page load never waits on Yahoo or FRED unless there is no copy at all.
 */

let desk: { at: number; data: DeskData } | null = null;
let flight: Promise<DeskData> | null = null;
/** Rebuild check interval: cheap, because every source has its own schedule underneath. */
const CHECK_MS = 60_000;

function income(): string[] {
  return incomeTickers(typeof process === "undefined" ? undefined : process.env["INCOME_TICKERS"]);
}

async function rebuild(fresh: boolean): Promise<DeskData> {
  const inc = income();
  const symbols = allSymbols(inc);
  const fredPromise = Promise.all(
    FRED_IDS.map(async (id) => [id, await fredObs(id, FRED_START, { fresh }).catch(() => [] as Obs[])] as const),
  );
  const missing = await refreshSeries(symbols, fresh);
  const fred = new Map<string, Obs[]>(await fredPromise);
  const now = Date.now();
  const data = { ...buildDesk({ series: cachedSeries(symbols), fred, income: inc, now, missing }), marketState: usMarketOpen(now) ? "open" : "closed" };
  if (!data.map.length) throw new Error("Market prices are unavailable right now.");
  desk = { at: Date.now(), data };
  writeCache("desk", desk);
  return data;
}

function start(fresh: boolean): Promise<DeskData> {
  flight ??= rebuild(fresh).finally(() => {
    flight = null;
  });
  return flight;
}

export function loadDesk(fresh = false): Promise<DeskData> {
  desk ??= readCache<{ at: number; data: DeskData }>("desk");
  if (fresh || !desk) return start(fresh);
  if (Date.now() - desk.at >= Math.min(CHECK_MS, schedule().priceMs)) start(false).catch(() => undefined);
  return Promise.resolve(desk.data);
}
