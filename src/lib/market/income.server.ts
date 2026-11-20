import { fetchTextRetry, mapPool } from "./fetch-util.ts";
import { cutThreshold, incomeRow, incomeTickers, type Bar, type IncomeRow, type Payout } from "./income.ts";
import { readCache, writeCache } from "./store.server.ts";

export type IncomeBook = { at: number; rows: IncomeRow[]; cutPct: number };

const TTL_MS = 12 * 60 * 60 * 1000;
let flight: Promise<IncomeBook> | null = null;

/** Daily closes and distributions change once a day, so a 12h cache (memory + /data volume) is plenty. */
export async function loadIncome(fresh = false): Promise<IncomeBook> {
  const tickers = incomeTickers();
  const key = tickers.join(",");
  const saved = readCache<IncomeBook & { key: string }>("income");
  if (!fresh && saved && saved.key === key && Date.now() - saved.at < TTL_MS) return saved;
  flight ??= build(tickers, key).finally(() => {
    flight = null;
  });
  return flight;
}

async function build(tickers: string[], key: string): Promise<IncomeBook> {
  const cutPct = cutThreshold();
  const now = Date.now();
  const rows = await mapPool(tickers, 4, async (symbol) => {
    try {
      const { bars, payouts, currency } = await history(symbol);
      return incomeRow(symbol, bars, payouts, currency, now, cutPct);
    } catch (error) {
      return { ...incomeRow(symbol, [], [], "", now, cutPct), error: error instanceof Error ? error.message : "Did not load." };
    }
  });
  const book = { at: now, rows, cutPct };
  if (rows.some((r) => r.price != null)) writeCache("income", { ...book, key });
  return book;
}

async function history(symbol: string): Promise<{ bars: Bar[]; payouts: Payout[]; currency: string }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3y&events=div`;
  const json = JSON.parse(await fetchTextRetry(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; MarketDesk/1.0)" }, timeoutMs: 15000 }));
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo returned no chart.");
  const times = (result.timestamp ?? []) as number[];
  const closes = (result.indicators?.quote?.[0]?.close ?? []) as Array<number | null>;
  const bars: Bar[] = [];
  times.forEach((t, i) => {
    const close = closes[i];
    if (typeof close === "number" && close > 0) bars.push({ t: t * 1000, close });
  });
  const divs = Object.values((result.events?.dividends ?? {}) as Record<string, { amount: number; date: number }>);
  const payouts = divs.map((d) => ({ t: d.date * 1000, amount: d.amount }));
  return { bars, payouts, currency: String(result.meta?.currency ?? "") };
}
