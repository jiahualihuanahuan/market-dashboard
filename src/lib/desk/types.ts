export type Bar = { date: string; o: number; h: number; l: number; c: number; v: number };
export type Dividend = { date: string; amount: number };
export type StatPack = { n: number; med20: number | null; med60: number | null; up60: number | null };

/** One symbol's cached daily history (raw, split-adjusted closes; dividends kept separately). */
export type Series = {
  symbol: string;
  name: string;
  currency: string;
  bars: Bar[];
  divs: Dividend[];
  marketState: string;
  /** Last full 5-year download. */
  fullAt: number;
  /** Last incremental (1-month) chart refresh. */
  tailAt: number;
  /** Last live-price patch. */
  liveAt: number;
};

export type Obs = { date: string; value: number };

export type Tone = "calm" | "caution" | "alarm" | "unknown";

export type MapRow = {
  symbol: string;
  name: string;
  last: number;
  d1: number | null;
  m1: number | null;
  fromHigh: number | null;
  vs200: number | null;
  above200: boolean | null;
  slope20: number | null;
  spark: number[];
};

export type RiskRow = { id: string; group: "Credit" | "Volatility" | "Rates" | "Jobs"; label: string; value: string; detail: string; tone: Tone; asOf: string | null };

export type RsRow = { label: string; a: string; b: string; spread20: number | null; spread60: number | null };

export type Alert = { id: string; severity: "high" | "medium"; text: string; source: "Shepherd" | "Shanghao" | "PII" };

export type IncomeRow = {
  symbol: string;
  name: string;
  currency: string;
  last: number;
  ttmYield: number | null;
  tr1y: number | null;
  pr1y: number | null;
  vol1y: number | null;
  mdd1y: number | null;
  lastDist: Dividend | null;
  cut: boolean;
  volFlag: Tone;
};

export type DeskData = {
  asOf: string;
  fetchedAt: string;
  marketState: string;
  regime: { tone: Tone; title: string; lines: string[] };
  alerts: Alert[];
  map: MapRow[];
  risk: RiskRow[];
  rs: RsRow[];
  goldSilver: { ratio: number | null; z: number | null; note: string };
  history: {
    symbol: string;
    todayRet: number | null;
    threshold: number;
    n: number;
    d5: { med: number | null; up: number | null };
    d21: { med: number | null; up: number | null };
    d126: { med: number | null; up: number | null };
    line: { touch: StatPack; break: StatPack };
  };
  income: { rows: IncomeRow[]; volCeiling: number; volWarn: number };
  missing: string[];
};
