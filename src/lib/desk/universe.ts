/** Market map (Shepherd's review desk): the few tapes that set the day. */
export const MAP: { symbol: string; name: string }[] = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq-100" },
  { symbol: "RSP", name: "S&P equal weight" },
  { symbol: "IWM", name: "Russell 2000" },
  { symbol: "SMH", name: "Semiconductors" },
  { symbol: "TLT", name: "Long Treasuries" },
  { symbol: "GLD", name: "Gold" },
  { symbol: "USO", name: "Oil" },
];

/** Relative strength pairs (Shepherd). Positive spread = first leg leading. */
export const RS_PAIRS: { label: string; a: string; b: string }[] = [
  { label: "Nasdaq vs semis", a: "QQQ", b: "SMH" },
  { label: "Cap weight vs equal weight", a: "SPY", b: "RSP" },
  { label: "Large vs small caps", a: "SPY", b: "IWM" },
  { label: "Junk vs investment grade", a: "HYG", b: "LQD" },
];

/** Gauges and pair legs that are not shown as map rows. */
export const SUPPORT = ["HYG", "LQD", "JNK", "^VIX", "^VIX3M", "GC=F", "SI=F", "SLV"];

/**
 * Income ETFs (Passive Income Investing). Defaults lean to partial-coverage, US / Canada-listed covered-call funds,
 * no international equity. Override with INCOME_TICKERS=JEPQ,SPYI,... on the server.
 */
export const DEFAULT_INCOME = ["JEPQ", "JEPI", "SPYI", "QQQI", "GPIQ", "GPIX", "HYLD.TO", "HDIV.TO"];

export const FRED_IDS = ["BAMLH0A0HYM2", "BAMLH0A3HYC", "DGS10", "T10Y2Y", "UNRATE", "SAHMREALTIME"] as const;
export const FRED_START = "2018-01-01";

export function incomeTickers(raw: string | undefined): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9^][A-Z0-9.\-=^]{0,14}$/.test(s));
  return list.length ? [...new Set(list)].slice(0, 20) : DEFAULT_INCOME;
}

export function allSymbols(income: string[]): string[] {
  return [...new Set([...MAP.map((m) => m.symbol), ...RS_PAIRS.flatMap((p) => [p.a, p.b]), ...SUPPORT, ...income])];
}
