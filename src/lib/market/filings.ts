export type FilingSource = "edgar" | "ir" | "sedar";

export type WatchName = {
  ticker: string;
  name: string;
  market: "US" | "CA";
  /** Optional investor-relations RSS. SEDAR+ has no public JSON feed. */
  irRss?: string;
};

export type FilingItem = {
  id: string;
  ticker: string;
  name: string;
  source: FilingSource;
  form: string;
  title: string;
  filedAt: string;
  url: string;
  excerpt: string;
  isNew: boolean;
  summary: string;
  material: "high" | "medium" | "low" | "unknown";
  model: string | null;
};

export type FilingsDigest = {
  checkedAt: string;
  host: string;
  model: string;
  error: string | null;
  items: FilingItem[];
  notes: string[];
};

export const DEFAULT_WATCH: WatchName[] = [
  { ticker: "AAPL", name: "Apple", market: "US" },
  { ticker: "MSFT", name: "Microsoft", market: "US" },
  { ticker: "NVDA", name: "NVIDIA", market: "US" },
  { ticker: "GOOGL", name: "Alphabet", market: "US" },
  { ticker: "COST", name: "Costco", market: "US" },
  { ticker: "RY", name: "Royal Bank of Canada", market: "CA", irRss: "https://www.rbc.com/newsroom/rss.xml" },
  { ticker: "TD", name: "Toronto-Dominion Bank", market: "CA" },
  { ticker: "SHOP", name: "Shopify", market: "US" },
  { ticker: "ENB", name: "Enbridge", market: "CA" },
  { ticker: "CNQ", name: "Canadian Natural Resources", market: "CA" },
];

export function sedarSearch(name: string): string {
  return `https://www.sedarplus.ca/csa-party/service/create.html?targetAppCode=csa-party&service=searchDocuments&_locale=en&company=${encodeURIComponent(name)}`;
}
