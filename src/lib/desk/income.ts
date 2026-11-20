import type { Bar, Dividend } from "./types.ts";

/** Total-return index with each distribution reinvested at the ex-date close (PII's DRIP approximation). */
export function totalReturnIndex(bars: Bar[], divs: Dividend[]): number[] {
  const byDate = new Map<string, number>();
  for (const d of divs) byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.amount);
  const out: number[] = [];
  let idx = 1;
  for (let i = 0; i < bars.length; i++) {
    if (i > 0) {
      const prev = bars[i - 1]!.c;
      const div = byDate.get(bars[i]!.date) ?? 0;
      if (prev > 0) idx *= (bars[i]!.c + div) / prev;
    }
    out.push(idx);
  }
  return out;
}

export function windowStart(bars: Bar[], days: number): number {
  if (!bars.length) return 0;
  const last = new Date(`${bars[bars.length - 1]!.date}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - days);
  const cut = last.toISOString().slice(0, 10);
  let i = bars.length - 1;
  while (i > 0 && bars[i - 1]!.date >= cut) i--;
  return i;
}

export function annualVol(series: number[]): number | null {
  if (series.length < 30) return null;
  const rets: number[] = [];
  for (let i = 1; i < series.length; i++) if (series[i - 1]! > 0) rets.push(Math.log(series[i]! / series[i - 1]!));
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

export function maxDrawdown(series: number[]): number | null {
  if (series.length < 2) return null;
  let peak = series[0]!;
  let worst = 0;
  for (const x of series) {
    if (x > peak) peak = x;
    if (peak > 0) worst = Math.min(worst, x / peak - 1);
  }
  return worst;
}

/** Distributions in the last 365 days ÷ latest close. Null with under ~11 months of history. */
export function ttmYield(bars: Bar[], divs: Dividend[]): number | null {
  if (!bars.length) return null;
  const last = bars[bars.length - 1]!;
  const firstDate = bars[0]!.date;
  const cut = new Date(`${last.date}T00:00:00Z`);
  cut.setUTCDate(cut.getUTCDate() - 365);
  const cutIso = cut.toISOString().slice(0, 10);
  if (firstDate > cutIso) return null;
  const sum = divs.filter((d) => d.date > cutIso && d.date <= last.date).reduce((s, d) => s + d.amount, 0);
  return last.c > 0 ? sum / last.c : null;
}

/** A cut: latest distribution at least 10% below the median of the previous three. */
export function distributionCut(divs: Dividend[]): boolean {
  if (divs.length < 4) return false;
  const latest = divs[divs.length - 1]!.amount;
  const prior = divs.slice(-4, -1).map((d) => d.amount).sort((a, b) => a - b);
  const med = prior[1]!;
  return med > 0 && latest < med * 0.9;
}
