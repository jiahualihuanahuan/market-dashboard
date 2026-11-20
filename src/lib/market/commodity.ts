export const COMMODITY_CHARTS = [
  { symbol: "GC=F", label: "Gold" },
  { symbol: "SI=F", label: "Silver" },
  { symbol: "HG=F", label: "Copper" },
  { symbol: "CL=F", label: "WTI" },
  { symbol: "BZ=F", label: "Brent" },
  { symbol: "NG=F", label: "Natural gas" },
  { symbol: "DX-Y.NYB", label: "Dollar index" },
  { symbol: "DBA", label: "Agriculture" },
  { symbol: "URNM", label: "Uranium" },
] as const;

export const COMMODITY_RATIOS = [
  { chain: "gold", spot: "GC=F", spotLabel: "Gold", etf: "GDX", etfLabel: "GDX" },
  { chain: "silver", spot: "SI=F", spotLabel: "Silver", etf: "SIL", etfLabel: "SIL" },
  { chain: "copper", spot: "HG=F", spotLabel: "Copper", etf: "COPX", etfLabel: "COPX" },
  { chain: "energy", spot: "CL=F", spotLabel: "WTI", etf: "XLE", etfLabel: "XLE" },
  { chain: "uranium", spot: "SRUUF", spotLabel: "Sprott physical", etf: "URNM", etfLabel: "URNM" },
] as const;
