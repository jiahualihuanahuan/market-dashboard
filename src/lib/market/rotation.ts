export const ROTATION_SECTORS = [
  { symbol: "XLK", label: "Technology", color: "#5b8def" },
  { symbol: "XLF", label: "Financials", color: "#3dd68c" },
  { symbol: "XLV", label: "Health", color: "#f0b429" },
  { symbol: "XLY", label: "Discretionary", color: "#ef6f6c" },
  { symbol: "XLP", label: "Staples", color: "#c084fc" },
  { symbol: "XLE", label: "Energy", color: "#fb923c" },
  { symbol: "XLI", label: "Industrials", color: "#22d3ee" },
  { symbol: "XLB", label: "Materials", color: "#a3e635" },
  { symbol: "XLRE", label: "Real estate", color: "#f472b6" },
  { symbol: "XLU", label: "Utilities", color: "#94a3b8" },
  { symbol: "XLC", label: "Communication", color: "#facc15" },
] as const;

export const LOOKBACKS = [
  { id: "m1", label: "1 month", days: 21, smooth: 8 },
  { id: "m3", label: "3 months", days: 63, smooth: 12 },
  { id: "m6", label: "6 months", days: 126, smooth: 16 },
  { id: "y1", label: "1 year", days: 252, smooth: 24 },
] as const;

export type LookbackId = (typeof LOOKBACKS)[number]["id"];

export type SectorBook = {
  asOf: string;
  dates: string[];
  benchmark: number[];
  sectors: { symbol: string; label: string; closes: number[] }[];
};

export type TrailPoint = { d: string; ratio: number; momentum: number };

export function lookbackOf(id: LookbackId) {
  return LOOKBACKS.find((item) => item.id === id) ?? LOOKBACKS[1];
}

export function relativeLine(dates: string[], sector: number[], benchmark: number[], days: number): { d: string; v: number }[] {
  const start = Math.max(0, sector.length - days);
  const baseSector = sector[start];
  const baseBench = benchmark[start];
  if (!(baseSector > 0) || !(baseBench > 0)) return [];
  const out: { d: string; v: number }[] = [];
  for (let i = start; i < sector.length; i += 1) {
    out.push({
      d: dates[i],
      v: round((((sector[i] / baseSector) / (benchmark[i] / baseBench)) - 1) * 100),
    });
  }
  return out;
}

export function trail(dates: string[], sector: number[], benchmark: number[], days: number, smooth: number): TrailPoint[] {
  const rs = sector.map((price, index) => price / benchmark[index]);
  const points = rotationPoints(rs, smooth);
  const finite: TrailPoint[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const row = points[i];
    if (!Number.isFinite(row.ratio) || !Number.isFinite(row.momentum)) continue;
    finite.push({ d: dates[i], ratio: round(row.ratio), momentum: round(row.momentum) });
  }
  const windowed = finite.slice(-days);
  if (windowed.length < 2) return windowed;
  return [windowed[0], windowed[windowed.length - 1]];
}

export function quadrant(ratio: number, momentum: number): "Leading" | "Weakening" | "Lagging" | "Improving" {
  if (ratio >= 100 && momentum >= 100) return "Leading";
  if (ratio >= 100) return "Weakening";
  if (momentum >= 100) return "Improving";
  return "Lagging";
}

function rotationPoints(rs: number[], period: number): { ratio: number; momentum: number }[] {
  const first = wma(rs, period);
  const second = wma(first.map((value) => value ?? Number.NaN), period);
  const ratio = first.map((value, index) => {
    const base = second[index];
    return value != null && base != null && base !== 0 ? (100 * value) / base : Number.NaN;
  });
  const momFirst = wma(ratio, period);
  const momSecond = wma(momFirst.map((value) => value ?? Number.NaN), period);
  return ratio.map((value, index) => {
    const base = momSecond[index];
    const level = momFirst[index];
    return {
      ratio: value,
      momentum: level != null && base != null && base !== 0 ? (100 * level) / base : Number.NaN,
    };
  });
}

function wma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i += 1) {
    let sum = 0;
    let ok = true;
    for (let k = 0; k < period; k += 1) {
      const value = values[i - k];
      if (!Number.isFinite(value)) {
        ok = false;
        break;
      }
      sum += value * (period - k);
    }
    if (ok) out[i] = sum / denom;
  }
  return out;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
