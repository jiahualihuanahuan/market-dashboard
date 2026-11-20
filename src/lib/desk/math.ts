import type { Bar, StatPack } from "./types.ts";

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function median(xs: number[]): number | null {
  const a = xs.filter((x) => Number.isFinite(x)).slice().sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  if (m == null) return null;
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  return Math.sqrt(v / (xs.length - 1));
}

export function lastReturn(closes: number[], n: number): number | null {
  if (closes.length <= n) return null;
  const prev = closes[closes.length - 1 - n];
  const now = closes[closes.length - 1];
  if (!prev || now == null) return null;
  return now / prev - 1;
}

export function drawdown(closes: number[], n: number): number | null {
  if (!closes.length) return null;
  const w = closes.slice(-n);
  let hi = -Infinity;
  for (const x of w) if (x > hi) hi = x;
  const last = closes[closes.length - 1];
  if (!Number.isFinite(hi) || hi === 0 || last == null) return null;
  return last / hi - 1;
}

export function sma(closes: number[], n: number): number | null {
  if (closes.length < n || n < 1) return null;
  let s = 0;
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i]!;
  return s / n;
}

export function smaSlope(closes: number[], n: number, lookback: number): number | null {
  if (closes.length < n + lookback) return null;
  const now = sma(closes, n);
  const prev = sma(closes.slice(0, closes.length - lookback), n);
  if (now == null || prev == null || prev === 0) return null;
  return now / prev - 1;
}

export function returnZ(closes: number[], window = 252): { ret: number | null; z: number | null } {
  if (closes.length < 40) return { ret: null, z: null };
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const p = closes[i - 1]!;
    if (p) rets.push(closes[i]! / p - 1);
  }
  const today = rets[rets.length - 1];
  if (today == null) return { ret: null, z: null };
  const hist = rets.slice(Math.max(0, rets.length - 1 - window), rets.length - 1);
  const m = mean(hist);
  const s = stdev(hist);
  if (m == null || s == null || s === 0) return { ret: today, z: null };
  return { ret: today, z: (today - m) / s };
}

export type AnalogRow = {
  date: string;
  ret: number;
  fwd5: number | null;
  fwd21: number | null;
  fwd126: number | null;
};

function forward(closes: number[], i: number, n: number): number | null {
  if (i + n >= closes.length) return null;
  const base = closes[i];
  const nxt = closes[i + n];
  if (!base || nxt == null) return null;
  return nxt / base - 1;
}

export function studyAnalogs(bars: Bar[], todayRet: number | null) {
  const closes = bars.map((b) => b.c);
  const threshold = todayRet != null && todayRet <= -0.02 ? todayRet : -0.02;
  const rows: AnalogRow[] = [];
  const last = closes.length - 1;
  for (let i = 252; i < last; i++) {
    const prev = closes[i - 1]!;
    if (!prev) continue;
    const ret = closes[i]! / prev - 1;
    let hi = -Infinity;
    for (let k = i - 251; k <= i; k++) if (closes[k]! > hi) hi = closes[k]!;
    if (!hi || closes[i]! / hi - 1 < -0.08) continue;
    if (ret > threshold) continue;
    rows.push({
      date: bars[i]!.date,
      ret,
      fwd5: forward(closes, i, 5),
      fwd21: forward(closes, i, 21),
      fwd126: forward(closes, i, 126),
    });
  }
  const pack = (pick: (r: AnalogRow) => number | null) => {
    const xs = rows.map(pick).filter((x): x is number => x != null);
    const ups = xs.filter((x) => x > 0).length;
    return {
      med: median(xs),
      up: xs.length ? ups / xs.length : null,
    };
  };
  return {
    threshold,
    n: rows.length,
    d5: pack((r) => r.fwd5),
    d21: pack((r) => r.fwd21),
    d126: pack((r) => r.fwd126),
    recent: rows.slice(-8).reverse(),
  };
}

function packEvents(
  events: { fwd20: number | null; fwd60: number | null }[],
): StatPack {
  const f20 = events.map((e) => e.fwd20).filter((x): x is number => x != null);
  const f60 = events.map((e) => e.fwd60).filter((x): x is number => x != null);
  const ups = f60.filter((x) => x > 0).length;
  return {
    n: events.length,
    med20: median(f20),
    med60: median(f60),
    up60: f60.length ? ups / f60.length : null,
  };
}

export function studyLine(bars: Bar[], period = 200): { touch: StatPack; break: StatPack } {
  const closes = bars.map((b) => b.c);
  const empty = { n: 0, med20: null, med60: null, up60: null };
  if (closes.length < period + 5) return { touch: empty, break: empty };
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i]!;
  let prevMa = sum / period;
  let prevClose = closes[period - 1]!;
  const touches: { fwd20: number | null; fwd60: number | null }[] = [];
  const breaks: { fwd20: number | null; fwd60: number | null }[] = [];
  let lastTouch = -999;
  let lastBreak = -999;
  for (let i = period; i < closes.length; i++) {
    sum += closes[i]! - closes[i - period]!;
    const ma = sum / period;
    const close = closes[i]!;
    const low = bars[i]!.l;
    const high = bars[i]!.h;
    if (i - lastBreak >= 10 && prevClose > prevMa && close < ma) {
      breaks.push({ fwd20: forward(closes, i, 20), fwd60: forward(closes, i, 60) });
      lastBreak = i;
    } else if (
      i - lastTouch >= 10 &&
      prevClose > prevMa &&
      close > ma &&
      low <= ma * 1.012 &&
      high >= ma * 0.988
    ) {
      touches.push({ fwd20: forward(closes, i, 20), fwd60: forward(closes, i, 60) });
      lastTouch = i;
    }
    prevMa = ma;
    prevClose = close;
  }
  return { touch: packEvents(touches), break: packEvents(breaks) };
}

export type GapRow = { date: string; kind: "up" | "down"; size: number; filled: boolean };

export function findGaps(bars: Bar[], minSize = 0.0015): GapRow[] {
  const out: GapRow[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!;
    const bar = bars[i]!;
    if (prev.h > 0 && bar.o > prev.h && bar.o / prev.h - 1 >= minSize) {
      let filled = false;
      for (let j = i; j < bars.length; j++) {
        if (bars[j]!.l <= prev.h) {
          filled = true;
          break;
        }
      }
      out.push({ date: bar.date, kind: "up", size: bar.o / prev.h - 1, filled });
    } else if (prev.l > 0 && bar.o < prev.l && prev.l / bar.o - 1 >= minSize) {
      let filled = false;
      for (let j = i; j < bars.length; j++) {
        if (bars[j]!.h >= prev.l) {
          filled = true;
          break;
        }
      }
      out.push({ date: bar.date, kind: "down", size: bar.o / prev.l - 1, filled });
    }
  }
  return out;
}

export function findIslands(bars: Bar[]): { date: string; kind: "top" | "bottom"; span: number }[] {
  const out: { date: string; kind: "top" | "bottom"; span: number }[] = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const prev = bars[i - 1]!;
    const start = bars[i]!;
    if (prev.h > 0 && start.o > prev.h * 1.001) {
      const floor = prev.h;
      let clusterLow = start.l;
      for (let j = i + 1; j < Math.min(bars.length, i + 16); j++) {
        const day = bars[j]!;
        const before = bars[j - 1]!;
        if (day.l <= floor) break;
        if (day.o < before.l && day.h < clusterLow) {
          out.push({ date: day.date, kind: "top", span: j - i });
          break;
        }
        clusterLow = Math.min(clusterLow, day.l);
      }
    }
    if (prev.l > 0 && start.o < prev.l * 0.999) {
      const ceiling = prev.l;
      let clusterHigh = start.h;
      for (let j = i + 1; j < Math.min(bars.length, i + 16); j++) {
        const day = bars[j]!;
        const before = bars[j - 1]!;
        if (day.h >= ceiling) break;
        if (day.o > before.h && day.l > clusterHigh) {
          out.push({ date: day.date, kind: "bottom", span: j - i });
          break;
        }
        clusterHigh = Math.max(clusterHigh, day.h);
      }
    }
  }
  return out.slice(-6).reverse();
}

export function olsBeta(y: number[], x: number[]): number | null {
  const n = Math.min(y.length, x.length);
  if (n < 20) return null;
  const ys = y.slice(-n);
  const xs = x.slice(-n);
  const mx = mean(xs);
  const my = mean(ys);
  if (mx == null || my == null) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    num += dx * (ys[i]! - my);
    den += dx * dx;
  }
  if (!den) return null;
  return num / den;
}

export function alignCloses(a: Bar[], b: Bar[]): { date: string; a: number; b: number }[] {
  const mb = new Map(b.map((bar) => [bar.date, bar.c]));
  const out: { date: string; a: number; b: number }[] = [];
  for (const bar of a) {
    const bc = mb.get(bar.date);
    if (bc != null) out.push({ date: bar.date, a: bar.c, b: bc });
  }
  return out;
}

export function pairZ(gold: Bar[], silver: Bar[], window = 120) {
  const aligned = alignCloses(gold, silver);
  if (aligned.length < window + 5) {
    return { ratio: null as number | null, beta: null as number | null, z: null as number | null, series: [] as { date: string; z: number }[] };
  }
  const slice = aligned.slice(-window);
  const rg: number[] = [];
  const rs: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    rg.push(Math.log(slice[i]!.a / slice[i - 1]!.a));
    rs.push(Math.log(slice[i]!.b / slice[i - 1]!.b));
  }
  const beta = olsBeta(rg, rs);
  if (beta == null) {
    return { ratio: slice[slice.length - 1]!.a / slice[slice.length - 1]!.b, beta: null, z: null, series: [] };
  }
  const spreads = slice.map((p) => Math.log(p.a) - beta * Math.log(p.b));
  const m = mean(spreads);
  const s = stdev(spreads);
  const last = slice[slice.length - 1]!;
  if (m == null || s == null || s === 0) {
    return { ratio: last.a / last.b, beta, z: null, series: [] };
  }
  const series = slice.map((p, i) => ({ date: p.date, z: (spreads[i]! - m) / s }));
  return { ratio: last.a / last.b, beta, z: series[series.length - 1]!.z, series: series.slice(-80) };
}

export function rvol(vols: number[], today: number | null): number | null {
  const hist = vols.filter((v) => v > 0).slice(-21, -1);
  const m = mean(hist.length ? hist : vols.filter((v) => v > 0).slice(-20));
  const use = today ?? vols[vols.length - 1];
  if (m == null || !m || use == null) return null;
  return use / m;
}
