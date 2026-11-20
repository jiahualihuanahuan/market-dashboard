export type HolderManager = {
  cik: string;
  name: string;
  value: number;
  positions: number;
  period: string;
  filed: string;
};

export type HolderAggregate = {
  issuer: string;
  cusip: string;
  value: number;
  managers: number;
  shares: number;
};

export type HolderSearch = {
  quarter: string;
  source: string;
  managerCount: number;
  issuerCount: number;
  managerTotal: number;
  stockTotal: number;
  managers: HolderManager[];
  aggregate: HolderAggregate[];
  widelyHeld: HolderAggregate[];
};

export type HolderBook = {
  cik: string;
  name: string;
  filed: string;
  period: string;
  url: string;
  value: number;
  count: number;
  holdings: { issuer: string; value: number; shares: number }[];
  error: string | null;
};
