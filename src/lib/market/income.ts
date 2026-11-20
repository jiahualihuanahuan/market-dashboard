/** Income ETF math (ideas from pii-income-etf-dashboard). All percentages are in percent units, e.g. 12.3 = 12.3%. */

export const DEFAULT_INCOME_TICKERS = ["JEPQ", "JEPI", "SPYI", "QQQI", "GPIQ", "GPIX", "HYLD.TO", "HDIV.TO"];
/** Her portfolio volatility ceiling: under 18% is fine, 18–20% is the edge, over 20% is too much. */
export const VOL_OK = 18;
export const VOL_CEILING = 20;
const DAY = 86_400_000;

export type Bar = { t: number; close: number };
export type Payout = { t: number; amount: number };

export type IncomeRow = {
  symbol: string;
  price: number | null;
  currency: string;
  /** Last 12 months of distributions over today's price. */
  ttmYield: number | null;
  /** 1-year return with every distribution reinvested on its ex-date. */
  totalReturn: number | null;
  /** 1-year price change alone; the gap to totalReturn is the income. */
  priceReturn: number | null;
  /** Annualised daily volatility of the total-return line, last year. */
  vol: number | null;
  volTone: "ok" | "edge" | "over" | "unknown";
  /** Worst peak-to-trough fall of the total-return line over the data loaded (up to 3 years). */
  maxDrawdown: number | null;
  drawdownYears: number;
  lastPayout: Payout | null;
  /** Average payout in the 3 months to the latest ex-date versus the 3 months before, percent change. */
  payoutChange: number | null;
  cut: boolean;
  error: string | null;
};

export function incomeTickers(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): string[] {
  const raw = env["INCOME_TICKERS"];
  const list = (raw ?? "").split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9.^-]{1,15}$/.test(s));
  return list.length ? [...new Set(list)] : DEFAULT_INCOME_TICKERS;
}

export function cutThreshold(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): number {
  const value = Number(env["INCOME_CUT_PCT"]);
  return Number.isFinite(value) && value > 0 && value < 100 ? value : 25;
}

/**
 * Variable monthly payers (JEPQ, JEPI) swing 10–20% from one month to the next, so one payout against the last is noisy.
 * Compare the average payout in the 3 months ending at the latest ex-date with the 3 months before that, and flag only a drop
 * larger than `thresholdPct`. Anchoring on the latest ex-date keeps quarterly payers at one payout per window.
 */
export function payoutTrend(payouts: Payout[], thresholdPct: number): { change: number | null; cut: boolean } {
  const sorted = [...payouts].sort((a, b) => a.t - b.t);
  const last = sorted.at(-1);
  if (!last) return { change: null, cut: false };
  // 80 days holds the last 3 monthly payouts (or 1 quarterly one) without catching the 4th, even with ex-date jitter.
  const window = 80 * DAY;
  // Average payout per ex-date, so a window that happens to hold 4 monthly payouts instead of 3 does not skew it.
  const avg = (from: number, to: number) => {
    const hits = sorted.filter((p) => p.t > from && p.t <= to);
    return hits.length ? hits.reduce((s, p) => s + p.amount, 0) / hits.length : 0;
  };
  const recent = avg(last.t - window, last.t);
  const prior = avg(last.t - 2 * window, last.t - window);
  if (prior <= 0 || recent <= 0) return { change: null, cut: false };
  const change = (recent / prior - 1) * 100;
  return { change, cut: change <= -thresholdPct };
}

export function incomeRow(symbol: string, barsIn: Bar[], payoutsIn: Payout[], currency: string, now: number, thresholdPct = 25): IncomeRow {
  const bars = barsIn.filter((b) => Number.isFinite(b.close) && b.close > 0).sort((a, b) => a.t - b.t);
  const payouts = payoutsIn.filter((p) => p.amount > 0).sort((a, b) => a.t - b.t);
  const empty: IncomeRow = {
    symbol, price: null, currency, ttmYield: null, totalReturn: null, priceReturn: null, vol: null, volTone: "unknown",
    maxDrawdown: null, drawdownYears: 0, lastPayout: payouts.at(-1) ?? null, payoutChange: null, cut: false, error: "No price history.",
  };
  if (bars.length < 30) return empty;

  // Total-return index: shares grow by distribution / close on each ex-date.
  const byDay = new Map<number, number>();
  for (const p of payouts) byDay.set(Math.floor(p.t / DAY), (byDay.get(Math.floor(p.t / DAY)) ?? 0) + p.amount);
  let shares = 1;
  const tr = bars.map((b) => {
    const div = byDay.get(Math.floor(b.t / DAY));
    if (div) shares *= 1 + div / b.close;
    return { t: b.t, close: b.close, value: shares * b.close };
  });

  const last = tr[tr.length - 1];
  const yearAgo = now - 365 * DAY;
  const startIdx = tr.findIndex((p) => p.t >= yearAgo);
  const fullYear = tr[0].t <= yearAgo + 7 * DAY;
  const start = startIdx >= 0 ? tr[startIdx] : null;
  const totalReturn = start && fullYear ? (last.value / start.value - 1) * 100 : null;
  const priceReturn = start && fullYear ? (last.close / start.close - 1) * 100 : null;

  const year = tr.slice(Math.max(startIdx, 0));
  const rets = year.slice(1).map((p, i) => Math.log(p.value / year[i].value));
  const mean = rets.reduce((s, r) => s + r, 0) / (rets.length || 1);
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(rets.length - 1, 1);
  const vol = rets.length >= 20 ? Math.sqrt(variance * 252) * 100 : null;

  let peak = -Infinity;
  let worst = 0;
  for (const p of tr) {
    peak = Math.max(peak, p.value);
    worst = Math.min(worst, p.value / peak - 1);
  }

  const ttm = payouts.filter((p) => p.t > yearAgo).reduce((s, p) => s + p.amount, 0);
  const trend = payoutTrend(payouts, thresholdPct);
  return {
    symbol,
    price: last.close,
    currency,
    ttmYield: payouts.length ? (ttm / last.close) * 100 : 0,
    totalReturn,
    priceReturn,
    vol,
    volTone: vol == null ? "unknown" : vol < VOL_OK ? "ok" : vol <= VOL_CEILING ? "edge" : "over",
    maxDrawdown: worst * 100,
    drawdownYears: Math.round(((last.t - tr[0].t) / (365 * DAY)) * 10) / 10,
    lastPayout: payouts.at(-1) ?? null,
    payoutChange: trend.change,
    cut: trend.cut,
    error: fullYear ? null : "Less than a year of history.",
  };
}
