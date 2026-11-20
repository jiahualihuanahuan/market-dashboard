import { readCache, writeCache } from "../market/store.server.ts";
import { fetchTextRetry, mapPool } from "../market/fetch-util.ts";
import { barsDue, priceDue, schedule } from "./schedule.ts";
import { mergeBars, parseChart, patchLive } from "./bars.ts";
import type { Series } from "./types.ts";

/**
 * Daily bars for the desk, cached in memory and on disk (MARKET_CACHE_DIR).
 * - Full 5-year history once a week (BARS_FULL_DAYS).
 * - Otherwise a 1-month tail merged onto the cache (daily, and once after each close).
 * - Live prices: Yahoo spark, 20 symbols per request, every PRICE_REFRESH_MIN while the US market is open.
 * Polite by design: one fixed UA, at most 4 parallel requests, retry with backoff on 429/5xx.
 */

const UA = "Mozilla/5.0 (compatible; MarketDesk/2.0)";
const CACHE = "desk-series";
const PARALLEL = 4;
let book: Record<string, Series> | null = null;

function all(): Record<string, Series> {
  book ??= readCache<Record<string, Series>>(CACHE) ?? {};
  return book;
}

export function cachedSeries(symbols: string[]): Map<string, Series> {
  const out = new Map<string, Series>();
  for (const s of symbols) {
    const row = all()[s];
    if (row?.bars.length) out.set(s, row);
  }
  return out;
}

async function chart(symbol: string, range: string): Promise<ReturnType<typeof parseChart>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&events=div`;
  return parseChart(JSON.parse(await fetchTextRetry(url, { headers: { "user-agent": UA }, timeoutMs: 15000 })));
}

/** Bring every symbol up to date according to the schedule. Returns symbols that failed and have no cache. */
export async function refreshSeries(symbols: string[], fresh = false): Promise<string[]> {
  const s = schedule();
  const now = Date.now();
  const missing: string[] = [];
  let dirty = false;
  await mapPool(symbols, PARALLEL, async (symbol) => {
    const have = all()[symbol];
    const needFull = !have?.bars.length || now - have.fullAt >= s.fullMs;
    if (!needFull && !fresh && !barsDue(have.tailAt, now, s)) return;
    try {
      if (needFull) {
        const got = await chart(symbol, "5y");
        if (!got || got.bars.length < 30) throw new Error(`${symbol}: no history`);
        all()[symbol] = { symbol, ...got, fullAt: now, tailAt: now, liveAt: 0 };
      } else {
        const got = await chart(symbol, "1mo");
        if (!got) throw new Error(`${symbol}: no tail`);
        const merged = mergeBars(have.bars, got.bars);
        if (merged == null) {
          // A split (or a vendor correction) changed history: re-read the full window.
          const full = await chart(symbol, "5y");
          if (!full) throw new Error(`${symbol}: no history`);
          all()[symbol] = { symbol, ...full, fullAt: now, tailAt: now, liveAt: 0 };
        } else {
          const divs = [...new Map([...have.divs, ...got.divs].map((d) => [d.date, d])).values()].sort((a, b) => (a.date < b.date ? -1 : 1));
          all()[symbol] = { ...have, name: got.name || have.name, marketState: got.marketState, bars: merged, divs, tailAt: now, liveAt: 0 };
        }
      }
      dirty = true;
    } catch {
      if (!have?.bars.length) missing.push(symbol);
    }
  });
  dirty = (await refreshLive(symbols, fresh)) || dirty;
  if (dirty) writeCache(CACHE, all());
  return missing;
}

/** Patch today's close from Yahoo spark (batched) for symbols whose live price is due. */
async function refreshLive(symbols: string[], fresh: boolean): Promise<boolean> {
  const s = schedule();
  const now = Date.now();
  const due = symbols.filter((sym) => {
    const row = all()[sym];
    return row?.bars.length && (fresh || priceDue(row.liveAt, now, s));
  });
  if (!due.length) return false;
  const batches: string[][] = [];
  for (let i = 0; i < due.length; i += 20) batches.push(due.slice(i, i + 20));
  let changed = false;
  await mapPool(batches, 2, async (batch) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(batch.join(","))}&range=1d&interval=5m`;
    let json: Record<string, { timestamp?: number[]; close?: Array<number | null> } | undefined>;
    try {
      json = JSON.parse(await fetchTextRetry(url, { headers: { "user-agent": UA }, timeoutMs: 15000 }));
    } catch {
      return;
    }
    for (const sym of batch) {
      const row = json[sym];
      const closes = row?.close ?? [];
      const stamps = row?.timestamp ?? [];
      let k = closes.length - 1;
      while (k >= 0 && !(typeof closes[k] === "number" && closes[k]! > 0)) k--;
      if (k < 0 || !stamps[k]) continue;
      const series = all()[sym]!;
      all()[sym] = { ...series, bars: patchLive(series.bars, closes[k]!, stamps[k]!), liveAt: now };
      changed = true;
    }
  });
  return changed;
}
