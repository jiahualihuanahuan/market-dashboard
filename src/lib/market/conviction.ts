export const TECH_UNIVERSE = [
  { ticker: "AAPL", name: "Apple" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "NVDA", name: "Nvidia" },
  { ticker: "GOOGL", name: "Alphabet" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "META", name: "Meta" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "AVGO", name: "Broadcom" },
  { ticker: "ORCL", name: "Oracle" },
  { ticker: "AMD", name: "AMD" },
  { ticker: "TSM", name: "TSMC" },
  { ticker: "CRM", name: "Salesforce" },
  { ticker: "SHOP", name: "Shopify" },
] as const;

export type TechTicker = (typeof TECH_UNIVERSE)[number]["ticker"];

export function techName(ticker: string): string {
  return TECH_UNIVERSE.find((row) => row.ticker === ticker)?.name ?? ticker;
}

export type ConvictionPoint = {
  claim: string;
  evidence: string;
  confidence: "low" | "medium" | "high";
};

export type ConvictionArticle = {
  id: string;
  source: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
};

export type ConvictionMemo = {
  ticker: string;
  company: string;
  conviction: number | null;
  stance: "constructive" | "mixed" | "cautious" | "unavailable";
  whatChanged: string;
  bullPoints: ConvictionPoint[];
  bearPoints: ConvictionPoint[];
  openQuestions: string[];
  notInSources: string[];
  articles: ConvictionArticle[];
  model: string;
  generatedAt: string;
  error: string | null;
};
