export type ValuationInput = {
  symbol: string;
  name: string;
  sector: string;
  price: number | null;
  marketCap: number | null;
  pe: number | null;
  forwardPe: number | null;
  pb: number | null;
  evEbitda: number | null;
  peg: number | null;
  fcf: number | null;
  operatingCashflow: number | null;
  earnings: number | null;
  dividend: number | null;
  debtToEquity: number | null;
  growth: number | null;
};

export type ValuationLabel = "Undervalued" | "Roughly fair" | "Overvalued";

export type ValuationRow = ValuationInput & {
  fcfYield: number | null;
  dcfUpside: number | null;
  ddmUpside: number | null;
  earningsQuality: number | null;
  score: number;
  label: ValuationLabel;
  notes: string[];
};

export type ValuationBook = {
  asOf: string;
  discount: number;
  rows: ValuationRow[];
  note: string;
};

const FINANCIAL = /bank|financial|insurance|capital markets/i;

export function scoreBook(rows: ValuationInput[], discount: number): ValuationRow[] {
  const built = rows.map((row) => decorate(row, discount));
  const pe = cheapRank(built, (row) => sane(row.pe, 0, 80), false);
  const forward = cheapRank(built, (row) => sane(row.forwardPe, 0, 80), false);
  const pb = cheapRank(built, (row) => sane(row.pb, 0, 30), false);
  const ev = cheapRank(built, (row) => sane(row.evEbitda, 0, 40), false);
  const peg = cheapRank(built, (row) => sane(row.peg, 0, 4), false);
  const fcf = cheapRank(built, (row) => row.fcfYield, true);
  const dcf = cheapRank(built, (row) => row.dcfUpside, true);
  const ddm = cheapRank(built, (row) => row.ddmUpside, true);
  return built
    .map((row) => {
      const parts = [pe.get(row.symbol), forward.get(row.symbol), pb.get(row.symbol), ev.get(row.symbol), peg.get(row.symbol), fcf.get(row.symbol), dcf.get(row.symbol), ddm.get(row.symbol)].filter((value): value is number => value != null);
      let score = parts.length ? parts.reduce((sum, value) => sum + value, 0) / parts.length : 0;
      if (row.earningsQuality != null && row.earningsQuality < 0.5) score *= 0.85;
      if (row.debtToEquity != null && row.debtToEquity > 2) score *= 0.9;
      score = Math.round(score);
      return { ...row, score, label: labelFor(score), notes: notesFor(row, parts.length) };
    })
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}

function decorate(row: ValuationInput, discount: number): Omit<ValuationRow, "score" | "label" | "notes"> {
  const fcfYield = row.fcf != null && row.marketCap != null && row.marketCap > 0 ? (row.fcf / row.marketCap) * 100 : null;
  return {
    ...row,
    fcfYield,
    dcfUpside: dcf(row, discount),
    ddmUpside: ddm(row, discount),
    earningsQuality: row.operatingCashflow != null && row.earnings != null && row.earnings > 0 ? row.operatingCashflow / row.earnings : null,
  };
}

function dcf(row: ValuationInput, discount: number): number | null {
  if (FINANCIAL.test(row.sector)) return null;
  if (row.fcf == null || !(row.fcf > 0) || row.marketCap == null || !(row.marketCap > 0)) return null;
  const growth = clamp(row.growth ?? 0.03, 0, 0.05);
  const rate = Math.max(discount, growth + 0.025);
  const g = Math.min(growth, rate - 0.02);
  const value = (row.fcf * (1 + g)) / (rate - g);
  return (value / row.marketCap - 1) * 100;
}

function ddm(row: ValuationInput, discount: number): number | null {
  if (row.dividend == null || !(row.dividend > 0) || row.price == null || !(row.price > 0)) return null;
  const growth = clamp(row.growth ?? 0.02, 0, 0.04);
  const rate = Math.max(discount, growth + 0.025);
  const g = Math.min(growth, rate - 0.02);
  const value = (row.dividend * (1 + g)) / (rate - g);
  return (value / row.price - 1) * 100;
}

function cheapRank(rows: Omit<ValuationRow, "score" | "label" | "notes">[], read: (row: Omit<ValuationRow, "score" | "label" | "notes">) => number | null, higherIsCheaper: boolean): Map<string, number> {
  const ready = rows
    .map((row) => ({ symbol: row.symbol, value: read(row) }))
    .filter((row): row is { symbol: string; value: number } => row.value != null && Number.isFinite(row.value));
  const out = new Map<string, number>();
  if (ready.length < 4) return out;
  const sorted = [...ready].sort((a, b) => a.value - b.value);
  const last = sorted.length - 1;
  for (let i = 0; i < sorted.length; i += 1) {
    const pct = (i / last) * 100;
    out.set(sorted[i].symbol, higherIsCheaper ? pct : 100 - pct);
  }
  return out;
}

function sane(value: number | null, min: number, max: number): number | null {
  if (value == null || !Number.isFinite(value) || value <= min || value > max) return null;
  return value;
}

function labelFor(score: number): ValuationLabel {
  if (score >= 62) return "Undervalued";
  if (score >= 42) return "Roughly fair";
  return "Overvalued";
}

function notesFor(row: Omit<ValuationRow, "score" | "label" | "notes">, parts: number): string[] {
  const notes: string[] = [];
  if (parts < 3) notes.push("Only a few of the measures were available, so the rank is thin.");
  if (row.pe == null) notes.push("Price-to-earnings is missing or not meaningful, often because the company lost money.");
  if (row.earningsQuality != null && row.earningsQuality < 0.7) notes.push("Reported profit is larger than the cash coming in. The earnings may be flattered by accounting.");
  else if (row.earningsQuality != null && row.earningsQuality > 1.2) notes.push("Cash coming in is stronger than the reported profit.");
  if (row.debtToEquity != null && row.debtToEquity > 2) notes.push("Debt is more than twice the net worth. A low price can still be a fragile business.");
  if (FINANCIAL.test(row.sector)) notes.push("For a bank or insurer, the cash-flow model is the wrong tool, so it is left out. Price-to-earnings and price-to-book do the work.");
  if (row.dcfUpside != null && Math.abs(row.dcfUpside) > 80) notes.push("The cash-flow result is extreme. Treat it as a clue, not a price target.");
  notes.push("Leadership, a lasting advantage over rivals, and the industry's future are not in this number.");
  return notes;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
