export type ChainId = "gold" | "silver" | "copper" | "energy" | "ag" | "uranium";

export type SectorId =
  | "banks-us"
  | "banks-ca"
  | "reit"
  | "mreit"
  | "utilities"
  | "industrials"
  | "discretionary"
  | "health"
  | "staples"
  | "tech";

export type GroupId = "index" | "vol" | "fx" | "commodity" | "rates" | "equity";

export type UniverseItem = {
  symbol: string;
  label: string;
  group: GroupId;
  chain?: ChainId;
  role?: "spot" | "miner" | "etf" | "physical";
  sector?: SectorId;
  note?: string;
};

export const CHAINS: { id: ChainId; label: string; spot: string; blurb: string }[] = [
  {
    id: "gold",
    label: "Gold",
    spot: "GC=F",
    blurb: "Spot versus senior miners and the GDX complex.",
  },
  {
    id: "silver",
    label: "Silver",
    spot: "SI=F",
    blurb: "Spot versus primary silver miners and SIL.",
  },
  {
    id: "copper",
    label: "Copper",
    spot: "HG=F",
    blurb: "Spot versus FCX, SCCO, and COPX.",
  },
  {
    id: "energy",
    label: "Energy",
    spot: "CL=F",
    blurb: "WTI versus majors, XLE, and USO.",
  },
  {
    id: "ag",
    label: "Agriculture",
    spot: "DBA",
    blurb: "DBA as the basket benchmark, plus grain futures and processors.",
  },
  {
    id: "uranium",
    label: "Uranium",
    spot: "URNM",
    blurb: "Miners ETF as the liquid benchmark, plus physical SRUUF.",
  },
];

export const SECTORS: { id: SectorId; label: string; note: string }[] = [
  {
    id: "banks-us",
    label: "US banks",
    note: "A steeper curve usually widens net interest margin. A hiking-cycle flatten, like 2015–18, can still help banks that fund on retail deposits.",
  },
  {
    id: "banks-ca",
    label: "Canada banks",
    note: "The Big Five rhyme with US money-centers, with a housing-and-deposit mix of their own.",
  },
  {
    id: "reit",
    label: "REITs",
    note: "Long-duration cash flows. Higher long yields raise the discount rate.",
  },
  {
    id: "mreit",
    label: "Mortgage REITs",
    note: "More like banks than property REITs: they live on the spread, not the building.",
  },
  {
    id: "utilities",
    label: "Utilities",
    note: "Bond proxies. Rising real yields compete with the dividend.",
  },
  {
    id: "industrials",
    label: "Industrials",
    note: "Prefer a steep curve with open credit and growing volumes.",
  },
  {
    id: "discretionary",
    label: "Discretionary",
    note: "Same growth impulse as industrials, more sensitive to the household.",
  },
  {
    id: "health",
    label: "Health",
    note: "Defensive. Tends to lag a steepening risk rally and hold up when credit cracks.",
  },
  {
    id: "staples",
    label: "Staples",
    note: "Low-vol ballast. Not where idle cash goes in a panic, and not the leader in a melt-up.",
  },
  {
    id: "tech",
    label: "Tech",
    note: "Duration in equity form. Real yields and the multiple do more work than the 2s10s slope.",
  },
];

export const UNIVERSE: UniverseItem[] = [
  { symbol: "^GSPC", label: "S&P 500", group: "index" },
  { symbol: "^NDX", label: "Nasdaq-100", group: "index" },
  { symbol: "^DJI", label: "Dow Jones", group: "index", note: "Price-weighted, not cap-weighted." },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50", group: "index" },
  { symbol: "^FTSE", label: "FTSE 100", group: "index" },
  { symbol: "^GDAXI", label: "DAX", group: "index" },
  { symbol: "^N225", label: "Nikkei 225", group: "index" },
  { symbol: "^AXJO", label: "ASX 200", group: "index" },
  { symbol: "^GSPTSE", label: "S&P/TSX", group: "index" },
  { symbol: "^VIX", label: "VIX", group: "vol" },
  { symbol: "DX-Y.NYB", label: "Dollar index", group: "fx" },
  { symbol: "SPY", label: "SPY", group: "equity" },
  { symbol: "QQQ", label: "QQQ", group: "equity", sector: "tech" },
  { symbol: "DIA", label: "DIA", group: "equity" },
  { symbol: "IWM", label: "IWM", group: "equity" },
  { symbol: "XLK", label: "XLK", group: "equity", sector: "tech" },
  { symbol: "GC=F", label: "Gold", group: "commodity", chain: "gold", role: "spot" },
  { symbol: "SI=F", label: "Silver", group: "commodity", chain: "silver", role: "spot" },
  { symbol: "CL=F", label: "WTI", group: "commodity", chain: "energy", role: "spot" },
  { symbol: "BZ=F", label: "Brent", group: "commodity", chain: "energy", role: "spot" },
  { symbol: "NG=F", label: "Natural gas", group: "commodity", chain: "energy" },
  { symbol: "HG=F", label: "Copper", group: "commodity", chain: "copper", role: "spot" },
  { symbol: "PL=F", label: "Platinum", group: "commodity" },
  { symbol: "PA=F", label: "Palladium", group: "commodity" },
  { symbol: "ZC=F", label: "Corn", group: "commodity", chain: "ag" },
  { symbol: "ZS=F", label: "Soybeans", group: "commodity", chain: "ag" },
  { symbol: "KE=F", label: "Wheat", group: "commodity", chain: "ag" },
  { symbol: "KC=F", label: "Coffee", group: "commodity", chain: "ag" },
  { symbol: "CT=F", label: "Cotton", group: "commodity", chain: "ag" },
  { symbol: "SB=F", label: "Sugar", group: "commodity", chain: "ag" },
  { symbol: "ZN=F", label: "10y note", group: "rates" },
  { symbol: "SHY", label: "SHY", group: "rates" },
  { symbol: "IEF", label: "IEF", group: "rates" },
  { symbol: "TLT", label: "TLT", group: "rates" },
  { symbol: "NEM", label: "Newmont", group: "equity", chain: "gold", role: "miner" },
  { symbol: "GOLD", label: "Barrick", group: "equity", chain: "gold", role: "miner" },
  { symbol: "AEM", label: "Agnico", group: "equity", chain: "gold", role: "miner" },
  { symbol: "KGC", label: "Kinross", group: "equity", chain: "gold", role: "miner" },
  { symbol: "GDX", label: "GDX", group: "equity", chain: "gold", role: "etf" },
  { symbol: "GDXJ", label: "GDXJ", group: "equity", chain: "gold", role: "etf" },
  { symbol: "PAAS", label: "Pan American", group: "equity", chain: "silver", role: "miner" },
  { symbol: "HL", label: "Hecla", group: "equity", chain: "silver", role: "miner" },
  { symbol: "SIL", label: "SIL", group: "equity", chain: "silver", role: "etf" },
  { symbol: "FCX", label: "Freeport", group: "equity", chain: "copper", role: "miner" },
  { symbol: "SCCO", label: "Southern Copper", group: "equity", chain: "copper", role: "miner" },
  { symbol: "COPX", label: "COPX", group: "equity", chain: "copper", role: "etf" },
  { symbol: "XOM", label: "Exxon", group: "equity", chain: "energy", role: "miner" },
  { symbol: "CVX", label: "Chevron", group: "equity", chain: "energy", role: "miner" },
  { symbol: "COP", label: "Conoco", group: "equity", chain: "energy", role: "miner" },
  { symbol: "XLE", label: "XLE", group: "equity", chain: "energy", role: "etf" },
  { symbol: "USO", label: "USO", group: "equity", chain: "energy", role: "etf" },
  { symbol: "DE", label: "Deere", group: "equity", chain: "ag", role: "miner" },
  { symbol: "ADM", label: "ADM", group: "equity", chain: "ag", role: "miner" },
  { symbol: "BG", label: "Bunge", group: "equity", chain: "ag", role: "miner" },
  { symbol: "DBA", label: "DBA", group: "equity", chain: "ag", role: "etf" },
  { symbol: "CCJ", label: "Cameco", group: "equity", chain: "uranium", role: "miner" },
  { symbol: "NXE", label: "NexGen", group: "equity", chain: "uranium", role: "miner" },
  { symbol: "UEC", label: "Uranium Energy", group: "equity", chain: "uranium", role: "miner" },
  { symbol: "DNN", label: "Denison", group: "equity", chain: "uranium", role: "miner" },
  { symbol: "URNM", label: "URNM", group: "equity", chain: "uranium", role: "etf" },
  { symbol: "URA", label: "URA", group: "equity", chain: "uranium", role: "etf" },
  { symbol: "SRUUF", label: "Sprott physical", group: "equity", chain: "uranium", role: "physical" },
  { symbol: "JPM", label: "JPMorgan", group: "equity", sector: "banks-us" },
  { symbol: "BAC", label: "Bank of America", group: "equity", sector: "banks-us" },
  { symbol: "WFC", label: "Wells Fargo", group: "equity", sector: "banks-us" },
  { symbol: "C", label: "Citigroup", group: "equity", sector: "banks-us" },
  { symbol: "GS", label: "Goldman", group: "equity", sector: "banks-us" },
  { symbol: "XLF", label: "XLF", group: "equity", sector: "banks-us" },
  { symbol: "KRE", label: "KRE", group: "equity", sector: "banks-us" },
  { symbol: "RY", label: "Royal Bank", group: "equity", sector: "banks-ca" },
  { symbol: "TD", label: "TD", group: "equity", sector: "banks-ca" },
  { symbol: "BNS", label: "Scotiabank", group: "equity", sector: "banks-ca" },
  { symbol: "BMO", label: "BMO", group: "equity", sector: "banks-ca" },
  { symbol: "CM", label: "CIBC", group: "equity", sector: "banks-ca" },
  { symbol: "VNQ", label: "VNQ", group: "equity", sector: "reit" },
  { symbol: "O", label: "Realty Income", group: "equity", sector: "reit" },
  { symbol: "PLD", label: "Prologis", group: "equity", sector: "reit" },
  { symbol: "AMT", label: "American Tower", group: "equity", sector: "reit" },
  { symbol: "NLY", label: "Annaly", group: "equity", sector: "mreit" },
  { symbol: "AGNC", label: "AGNC", group: "equity", sector: "mreit" },
  { symbol: "XLU", label: "XLU", group: "equity", sector: "utilities" },
  { symbol: "NEE", label: "NextEra", group: "equity", sector: "utilities" },
  { symbol: "DUK", label: "Duke", group: "equity", sector: "utilities" },
  { symbol: "XLI", label: "XLI", group: "equity", sector: "industrials" },
  { symbol: "CAT", label: "Caterpillar", group: "equity", sector: "industrials" },
  { symbol: "HON", label: "Honeywell", group: "equity", sector: "industrials" },
  { symbol: "XLY", label: "XLY", group: "equity", sector: "discretionary" },
  { symbol: "AMZN", label: "Amazon", group: "equity", sector: "discretionary" },
  { symbol: "HD", label: "Home Depot", group: "equity", sector: "discretionary" },
  { symbol: "XLV", label: "XLV", group: "equity", sector: "health" },
  { symbol: "UNH", label: "UnitedHealth", group: "equity", sector: "health" },
  { symbol: "JNJ", label: "J&J", group: "equity", sector: "health" },
  { symbol: "XLP", label: "XLP", group: "equity", sector: "staples" },
  { symbol: "COST", label: "Costco", group: "equity", sector: "staples" },
  { symbol: "PG", label: "P&G", group: "equity", sector: "staples" },
  { symbol: "GOOGL", label: "Alphabet", group: "equity", sector: "tech" },
  { symbol: "NVDA", label: "Nvidia", group: "equity", sector: "tech" },
];

export const UNIVERSE_BY_SYMBOL = new Map(UNIVERSE.map((item) => [item.symbol, item]));

export function spotFor(symbol: string): string | null {
  const item = UNIVERSE_BY_SYMBOL.get(symbol);
  if (!item?.chain || item.role === "spot") return null;
  return CHAINS.find((chain) => chain.id === item.chain)?.spot ?? null;
}
