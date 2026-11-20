export type AssetKind = "etf" | "equity" | "cash" | "other";
export type CurrencyCode = "CAD" | "USD";
export type DataSource = "catalog" | "yahoo" | "issuer" | "mixed" | "synthetic";

export type HoldingLine = {
  symbol: string;
  name: string;
  weight: number;
  sector?: string;
};

export type Instrument = {
  symbol: string;
  displaySymbol: string;
  name: string;
  kind: AssetKind;
  currency: string;
  price: number | null;
  changePct: number | null;
  holdings: HoldingLine[] | null;
  sectors: { name: string; weight: number }[];
  source: DataSource;
  asOf?: string;
  coverage: number;
};

export type Position = {
  id: string;
  ticker: string;
  shares: number;
};

export type LeafExposure = {
  symbol: string;
  displaySymbol: string;
  name: string;
  kind: AssetKind;
  sector: string;
  value: number;
  weight: number;
  sources: { from: string; weight: number; value: number }[];
};

export type PositionView = {
  id: string;
  ticker: string;
  resolved: string;
  name: string;
  kind: AssetKind;
  shares: number;
  price: number | null;
  currency: string;
  value: number;
  weight: number;
  changePct: number | null;
  coverage: number;
  source: DataSource;
  asOf?: string;
};

export type TreeNode = {
  symbol: string;
  displaySymbol: string;
  name: string;
  kind: AssetKind;
  weightOfParent: number;
  weightOfNav: number;
  value: number;
  sector?: string;
  children: TreeNode[];
};

export type LookthroughResult = {
  nav: number;
  currency: CurrencyCode;
  equityExposure: number;
  positions: PositionView[];
  leaves: LeafExposure[];
  sectors: { name: string; value: number; weight: number }[];
  trees: TreeNode[];
  unresolved: string[];
  warnings: string[];
  fxUsdCad: number;
};
