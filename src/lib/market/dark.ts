export type DarkRow = {
  symbol: string;
  name: string;
  notional: number[];
  shares: number[];
  trades: number;
  otherNotional: number | null;
  otherShares: number | null;
};

export type DarkFlag = {
  symbol: string;
  name: string;
  label: string;
  detail: string;
};

export type DarkDaily = {
  symbol: string;
  offShares: number;
  dollars: number | null;
  shortPct: number | null;
};

export type DarkBook = {
  weeks: string[];
  published: string;
  rows: DarkRow[];
  flags: DarkFlag[];
  daily: { asOf: string; offShares: number; shortPct: number | null; rows: DarkDaily[] } | null;
  note: string;
};

export function latestOf(row: DarkRow): number {
  return row.notional[row.notional.length - 1] ?? 0;
}

export function priorOf(row: DarkRow): number {
  return row.notional.length >= 2 ? row.notional[row.notional.length - 2] : 0;
}

export function avgSize(row: DarkRow): number {
  const shares = row.shares[row.shares.length - 1] ?? 0;
  return row.trades > 0 ? shares / row.trades : 0;
}

export function darkShare(row: DarkRow): number | null {
  if (row.otherNotional == null) return null;
  const total = latestOf(row) + row.otherNotional;
  if (!(total > 0)) return null;
  return (latestOf(row) / total) * 100;
}
