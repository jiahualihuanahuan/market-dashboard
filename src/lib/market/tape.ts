export const RANGES = [
  ["day", "Day"],
  ["week", "Week"],
  ["month", "Month"],
  ["quarter", "Quarter"],
  ["half", "Half year"],
  ["ytd", "YTD"],
  ["y1", "1Y"],
  ["y3", "3Y"],
  ["y5", "5Y"],
  ["y10", "10Y"],
] as const;

export type RangeId = (typeof RANGES)[number][0];

const SESSIONS: Record<RangeId, number> = {
  day: 1,
  week: 5,
  month: 21,
  quarter: 63,
  half: 126,
  ytd: 0,
  y1: 252,
  y3: 756,
  y5: 1260,
  y10: 2520,
};

export type TapeIndex = {
  symbol: string;
  label: string;
  price: number;
  changes: Record<RangeId, number | null>;
  note?: string;
};

export type TapePoint = { d: string; v: number };

export type BreadthPoint = { d: string; net: number; cum: number; up: number; down: number; covered: number };

export type Tape = {
  asOf: string;
  indexes: TapeIndex[];
  spx: TapePoint[];
  spxDay: TapePoint[];
  breadth: BreadthPoint[];
  members: number;
  note: string;
  quoteTime: string | null;
};

export function percentChange(closes: number[], dates: string[], range: RangeId): number | null {
  if (closes.length < 2) return null;
  const last = closes[closes.length - 1];
  const prev = previousClose(closes, dates, range);
  if (prev == null || !(prev > 0) || !(last > 0)) return null;
  return Math.round((last / prev - 1) * 10000) / 100;
}

function previousClose(closes: number[], dates: string[], range: RangeId): number | null {
  if (range === "ytd") {
    const year = dates[dates.length - 1]?.slice(0, 4) ?? "";
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      if (dates[i].slice(0, 4) < year) return closes[i];
    }
    return null;
  }
  const back = SESSIONS[range];
  if (closes.length > back) return closes[closes.length - 1 - back];
  if ((range === "y5" || range === "y10") && closes.length > 200) {
    const span = yearSpan(dates[0] ?? "", dates[dates.length - 1] ?? "");
    const need = range === "y10" ? 9.5 : 4.5;
    if (span >= need) return closes[0];
  }
  return null;
}

function yearSpan(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return (to - from) / (365.25 * 86400000);
}

export function sliceSeries<T extends { d: string }>(points: T[], range: RangeId): T[] {
  if (!points.length) return [];
  if (range === "ytd") {
    const year = points[points.length - 1].d.slice(0, 4);
    let start = points.findIndex((point) => point.d.slice(0, 4) === year);
    if (start > 0) start -= 1;
    return start > 0 ? points.slice(start) : points.slice(Math.max(0, start));
  }
  const keep = SESSIONS[range] + 1;
  return points.slice(Math.max(0, points.length - keep));
}

export function windowBreadth(points: BreadthPoint[], range: RangeId): { d: string; cum: number; net: number }[] {
  const sliced = sliceSeries(points, range);
  if (sliced.length < 2) return sliced.map((point) => ({ d: point.d, cum: 0, net: point.net }));
  const base = sliced[0].cum;
  return sliced.slice(1).map((point) => ({ d: point.d, cum: point.cum - base, net: point.net }));
}
