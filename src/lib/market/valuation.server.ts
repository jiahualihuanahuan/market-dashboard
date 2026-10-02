import https from "node:https";
import { scoreBook, type ValuationBook, type ValuationInput } from "@/lib/market/valuation";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const NAMES = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "AVGO", "ORCL", "CRM", "AMD", "CSCO", "ADBE",
  "JPM", "BAC", "WFC", "GS", "MS", "V", "MA",
  "UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV",
  "WMT", "COST", "HD", "PG", "KO", "PEP", "MCD", "NKE", "DIS",
  "CAT", "HON", "GE", "UNP",
  "XOM", "CVX", "COP",
  "NFLX", "T", "VZ",
];

let cache: { at: number; inputs: ValuationInput[]; discount: number } | null = null;
const jar = new Map<string, string>();
let crumbCache: { value: string; at: number } | null = null;

export async function loadValuation(symbol = "", fresh = false): Promise<ValuationBook> {
  const extra = cleanSymbol(symbol);
  if (!fresh && cache && Date.now() - cache.at < 6 * 60 * 60 * 1000 && !extra) return publish(cache.inputs, cache.discount);
  const base = !fresh && cache && Date.now() - cache.at < 6 * 60 * 60 * 1000 ? cache : await loadBase();
  cache = base;
  if (!extra || base.inputs.some((row) => row.symbol === extra)) return publish(base.inputs, base.discount);
  const one = await loadOne(extra);
  return publish(one ? [...base.inputs, one] : base.inputs, base.discount);
}

async function loadBase(): Promise<{ at: number; inputs: ValuationInput[]; discount: number }> {
  const discount = await discountRate();
  const inputs: ValuationInput[] = [];
  await mapPool(NAMES, 4, async (symbol) => {
    const row = await loadOne(symbol);
    if (row) inputs.push(row);
  });
  if (inputs.length < 12) throw new Error("Valuation data did not load for enough companies.");
  return { at: Date.now(), inputs, discount };
}

function publish(inputs: ValuationInput[], discount: number): ValuationBook {
  return {
    asOf: new Date().toISOString(),
    discount,
    rows: scoreBook(inputs, discount),
    note: "The rank blends two ideas. Intrinsic value asks what the cash or the dividend is worth if it keeps growing slowly. Relative value asks whether the price is high or low next to the other companies on this page. Sorted from most undervalued. A high rank is not a buy order, and a low rank is not a sell order.",
  };
}

async function discountRate(): Promise<number> {
  try {
    const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=5d", {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(12000),
    });
    if (response.ok) {
      const json = (await response.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
      const yieldPct = json.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (yieldPct && yieldPct > 0 && yieldPct < 20) return yieldPct / 100 + 0.045;
    }
  } catch {
    // A missing Treasury yield falls back to a plain 9% hurdle.
  }
  return 0.09;
}

async function loadOne(symbol: string): Promise<ValuationInput | null> {
  try {
    const crumb = await yahooCrumb();
    const body = await yahooText(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,summaryDetail,defaultKeyStatistics,financialData,price&crumb=${encodeURIComponent(crumb)}`);
    const json = JSON.parse(body) as { quoteSummary?: { result?: Array<Record<string, Record<string, unknown>>> } };
    const result = json.quoteSummary?.result?.[0];
    if (!result) return null;
    const stats = result.defaultKeyStatistics ?? {};
    const detail = result.summaryDetail ?? {};
    const finance = result.financialData ?? {};
    const profile = result.assetProfile ?? {};
    const priceBlock = result.price ?? {};
    const price = num(priceBlock.regularMarketPrice) ?? num(finance.currentPrice);
    const shares = num(stats.sharesOutstanding);
    const eps = num(stats.trailingEps);
    const debt = num(finance.debtToEquity);
    return {
      symbol,
      name: String(priceBlock.longName || priceBlock.shortName || symbol),
      sector: String(profile.sector || "Unclassified"),
      price,
      marketCap: num(detail.marketCap) ?? num(priceBlock.marketCap),
      pe: num(stats.trailingPE) ?? num(detail.trailingPE),
      forwardPe: num(stats.forwardPE) ?? num(detail.forwardPE),
      pb: num(stats.priceToBook),
      evEbitda: num(stats.enterpriseToEbitda),
      peg: num(stats.pegRatio),
      fcf: num(finance.freeCashflow),
      operatingCashflow: num(finance.operatingCashflow),
      earnings: eps != null && shares != null ? eps * shares : null,
      dividend: num(detail.trailingAnnualDividendRate) ?? num(stats.trailingAnnualDividendRate),
      debtToEquity: debt == null ? null : debt > 10 ? debt / 100 : debt,
      growth: num(finance.earningsGrowth) ?? num(finance.revenueGrowth),
    };
  } catch {
    return null;
  }
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw?: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function cleanSymbol(value: string): string {
  const symbol = value.trim().toUpperCase().replace(/^\$/, "").replace(/\./g, "-");
  return /^[A-Z]{1,5}(?:-[A-Z])?$/.test(symbol) ? symbol : "";
}

async function yahooCrumb(): Promise<string> {
  if (crumbCache && Date.now() - crumbCache.at < 10 * 60 * 1000) return crumbCache.value;
  await yahooText("https://fc.yahoo.com");
  const html = await yahooText("https://finance.yahoo.com/quote/AAPL");
  const crumb = html.match(/"crumb":"([^"]+)"/)?.[1];
  if (!crumb) throw new Error("Valuation session did not start.");
  crumbCache = { value: crumb, at: Date.now() };
  return crumb;
}

function yahooText(url: string): Promise<string> {
  return readYahoo(url).then(({ status, body }) => {
    if (status >= 400 && status !== 404) throw new Error(`Valuation feed returned ${status}`);
    return body;
  });
}

function readYahoo(url: string, redirects = 0): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: {
          "user-agent": UA,
          accept: "text/html,application/json",
          cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
        },
        timeout: 20000,
        maxHeaderSize: 256 * 1024,
      },
      (res) => {
        const setCookie = res.headers["set-cookie"];
        const lines = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
        for (const line of lines) {
          const pair = line.split(";")[0] ?? "";
          const index = pair.indexOf("=");
          if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
        }
        const location = res.headers.location;
        if (location && res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && redirects < 5) {
          res.resume();
          resolve(readYahoo(new URL(location, url).toString(), redirects + 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Valuation feed timed out.")));
    req.end();
  });
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}
