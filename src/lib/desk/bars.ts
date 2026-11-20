import type { Bar, Dividend } from "./types.ts";

const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

export function etDate(unixSec: number): string {
  return ET_DATE.format(new Date(unixSec * 1000));
}

type ChartJson = {
  chart?: {
    result?: Array<{
      meta?: { shortName?: string; longName?: string; currency?: string; marketState?: string };
      timestamp?: number[];
      events?: { dividends?: Record<string, { amount?: number; date?: number }> };
      indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> };
    }> | null;
  };
};

/** Raw (split-adjusted, not dividend-adjusted) daily bars plus the dividend list from a Yahoo chart payload. */
export function parseChart(json: unknown): { name: string; currency: string; marketState: string; bars: Bar[]; divs: Dividend[] } | null {
  const result = (json as ChartJson)?.chart?.result?.[0];
  const q = result?.indicators?.quote?.[0];
  if (!result?.timestamp?.length || !q) return null;
  const byDay = new Map<string, Bar>();
  for (let i = 0; i < result.timestamp.length; i++) {
    const c = q.close?.[i];
    if (c == null || !Number.isFinite(c) || c <= 0) continue;
    const date = etDate(result.timestamp[i]!);
    byDay.set(date, { date, o: q.open?.[i] ?? c, h: q.high?.[i] ?? c, l: q.low?.[i] ?? c, c, v: q.volume?.[i] ?? 0 });
  }
  const divs: Dividend[] = Object.values(result.events?.dividends ?? {})
    .filter((d) => typeof d.amount === "number" && d.amount > 0 && typeof d.date === "number")
    .map((d) => ({ date: etDate(d.date!), amount: d.amount! }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const meta = result.meta ?? {};
  return {
    name: String(meta.shortName || meta.longName || ""),
    currency: String(meta.currency || "USD"),
    marketState: String(meta.marketState || "UNKNOWN"),
    bars: [...byDay.values()],
    divs,
  };
}

/**
 * Merge a recent tail onto cached bars. Tail bars replace cached ones from the tail's first date on.
 * Returns null when an overlapping close differs by more than 1% (split or vendor rewrite → re-read history),
 * or when the tail does not reach back to the cache (gap → re-read history).
 */
export function mergeBars(base: Bar[], tail: Bar[]): Bar[] | null {
  if (!tail.length) return base;
  if (!base.length) return tail;
  const first = tail[0]!.date;
  const lastBase = base[base.length - 1]!.date;
  if (first > lastBase) return null;
  const byDate = new Map(base.map((b) => [b.date, b]));
  // Compare settled bars only (skip the newest tail bar, which may still be live).
  for (const bar of tail.slice(0, -1)) {
    const old = byDate.get(bar.date);
    if (old && Math.abs(bar.c / old.c - 1) > 0.01) return null;
  }
  return base.filter((b) => b.date < first).concat(tail);
}

/** Put a live price on today's bar (or append today's bar). Never rewrites a newer bar. */
export function patchLive(bars: Bar[], price: number, unixSec: number): Bar[] {
  const date = etDate(unixSec);
  const last = bars[bars.length - 1];
  if (!last || last.date > date) return bars;
  if (last.date === date) return bars.slice(0, -1).concat({ ...last, c: price, h: Math.max(last.h, price), l: Math.min(last.l, price) });
  return bars.concat({ date, o: price, h: price, l: price, c: price, v: 0 });
}
