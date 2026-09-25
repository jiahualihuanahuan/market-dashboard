export type TenorPoint = { label: string; years: number; value: number };

export type Curve = { id: string; label: string; points: TenorPoint[] };

export type Spark = { d: string; v: number };

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  d1: number | null;
  w1: number | null;
  m1: number | null;
  y1: number | null;
  high52: number | null;
  low52: number | null;
  volume: number | null;
  avgVol20: number | null;
  spark: Spark[];
  divergence: number | null;
};

export type IndexBreadth = {
  symbol: string;
  label: string;
  up: number;
  down: number;
  flat: number;
  covered: number;
  listed: number;
};

export type Breadth = {
  up: number;
  down: number;
  flat: number;
  nearHigh: number;
  nearLow: number;
  universe: number;
  /** spx means up/down are the S&P 500. sample is the hand-picked book, used only if the index feed fails. */
  source: "spx" | "sample";
  indexes: IndexBreadth[];
};

export type MacroPrint = {
  region: "US" | "Canada";
  name: string;
  actual: string;
  prior: string;
  asOf: string;
  cadence: string;
  next: string;
};

export type SpreadPath = {
  d: string;
  curve: number | null;
  hy: number | null;
  real: number | null;
};

export type RatioPoint = {
  d: string;
  spot: number;
  /** Miner-ETF / spot, as a percent gap versus the latest 60-session average. */
  gap: number | null;
};

export type ChainRatio = {
  chain: string;
  spot: string;
  spotLabel: string;
  etf: string;
  etfLabel: string;
  /** Latest gap, percent. Positive means the ETF is rich versus spot. */
  gap: number | null;
  /** Latest 60-session z-score of the ratio. */
  z: number | null;
  /** Percent gap that equals 1.5 standard deviations. */
  band: number | null;
  points: RatioPoint[];
};

export type CnnPart = { id: string; score: number; rating: string };

export type CnnFear = {
  score: number;
  rating: string;
  previousClose: number | null;
  week: number | null;
  month: number | null;
  year: number | null;
  asOf: string;
  history: { d: string; v: number }[];
  parts: CnnPart[];
};

export type Board = {
  asOf: string;
  fetchedAt: string;
  quotes: Quote[];
  breadth: Breadth;
  curves: Curve[];
  months: Curve[];
  spreadPath: SpreadPath[];
  ratios: ChainRatio[];
  t10y2y: number | null;
  t10y3m: number | null;
  hyOas: number | null;
  hyAsOf: string | null;
  ted: { value: number; date: string } | null;
  yieldVol: number | null;
  real10: number | null;
  fearCrypto: { value: number; label: string } | null;
  fearEquity: { value: number; label: string } | null;
  fearCnn: CnnFear | null;
  crossCheck: string;
  macro: MacroPrint[];
  warnings: string[];
};

export type Holding = { issuer: string; value: number; shares: number };

export type ManagerBook = {
  name: string;
  who: string;
  filed: string;
  period: string;
  url: string;
  holdings: Holding[];
  error: string | null;
};

export type InsiderFiling = {
  filed: string;
  names: string[];
  url: string;
};

export type Overlap = { issuer: string; managers: string[]; value: number };

export type SmartMoney = {
  books: ManagerBook[];
  insiders: InsiderFiling[];
  overlap: Overlap[];
  note: string;
};
