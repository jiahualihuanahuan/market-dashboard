import { execFile } from "node:child_process";
import { buildFrontier, type FrontierAnchor, type FrontierModel } from "@/lib/market/frontier";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";

export const FRONTIER_ASSETS = [
  { symbol: "BTC-USD", label: "Bitcoin" },
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq-100" },
  { symbol: "GLD", label: "Gold" },
  { symbol: "BIL", label: "Short-term Treasuries" },
];

const MODEL = 3;
const GOLD_TONNES = 216_265;
const OZ_PER_TONNE = 32_150.7466;
const REAL_GROWTH = 2;

let cache: { at: number; model: number; data: FrontierModel } | null = null;

export async function loadFrontier(live = false): Promise<FrontierModel> {
  if (!live && cache && cache.model === MODEL && Date.now() - cache.at < 6 * 60 * 60 * 1000) return cache.data;
  const [series, priors] = await Promise.all([loadReturnSeries(), loadAnchors()]);
  const data = buildFrontier({ ...series, ...priors });
  cache = { at: Date.now(), model: MODEL, data };
  return data;
}

async function loadReturnSeries(): Promise<{ start: string; end: string; assets: { symbol: string; label: string }[]; dates: string[]; returns: number[][] }> {
  const series = await Promise.all(FRONTIER_ASSETS.map((asset) => loadCloses(asset.symbol)));
  const common = intersect(series);
  if (common.length < 260) throw new Error("Not enough overlapping history to build a frontier.");
  const maps = series.map((bars) => new Map(bars.map((bar) => [bar.d, bar.c])));
  const dates: string[] = [];
  const returns = series.map(() => [] as number[]);
  for (let index = 1; index < common.length; index += 1) {
    const prev = maps.map((bars) => bars.get(common[index - 1]));
    const next = maps.map((bars) => bars.get(common[index]));
    if (prev.some((value) => value == null || value <= 0) || next.some((value) => value == null || value <= 0)) continue;
    dates.push(common[index]);
    for (let asset = 0; asset < series.length; asset += 1) {
      returns[asset].push((next[asset] as number) / (prev[asset] as number) - 1);
    }
  }
  if (dates.length < 260) throw new Error("Not enough overlapping history to build a frontier.");
  return {
    start: dates[0] ?? common[0],
    end: dates[dates.length - 1] ?? common[common.length - 1],
    assets: FRONTIER_ASSETS.map((asset) => ({ symbol: asset.symbol, label: asset.label })),
    dates,
    returns,
  };
}

async function loadAnchors(): Promise<{ anchors: FrontierAnchor[]; inflation: number; billYield: number }> {
  const [book, spx, ndx, quotes, yields, gold] = await Promise.all([
    loadCapBook(),
    loadSpx(),
    loadNdx(),
    loadQuotes(),
    loadYields(),
    loadGold(),
  ]);
  const spxSet = new Set(spx);
  const overlap = ndx.filter((symbol) => spxSet.has(symbol));
  const spxCap = sumCaps(spx, book);
  const overlapCap = sumCaps(overlap, book);
  const ndxCap = sumCaps(ndx, book);
  if (spxCap.hit < spx.length * 0.7) throw new Error("S&P 500 market cap did not cover enough names.");
  const anchors: FrontierAnchor[] = [
    {
      forward: round(yields.inflation + 4),
      marketCap: quotes.bitcoinCap,
      confidence: 8,
      note: "No earnings and no dividend. The view is only inflation plus 4 points, and it is given little weight.",
    },
    {
      forward: round(quotes.spyYield + yields.inflation + REAL_GROWTH),
      marketCap: Math.max(spxCap.total - overlapCap.total, 0),
      confidence: 1,
      note: `S&P 500 outside the Nasdaq-100. Dividend yield ${quotes.spyYield.toFixed(2)}% plus inflation plus ${REAL_GROWTH}% real growth. The valuation multiple is assumed not to change.`,
    },
    {
      forward: round(quotes.qqqYield + yields.inflation + REAL_GROWTH),
      marketCap: ndxCap.total,
      confidence: 1,
      note: `Nasdaq-100. Dividend yield ${quotes.qqqYield.toFixed(2)}% plus inflation plus ${REAL_GROWTH}% real growth. Its recent outperformance is not used.`,
    },
    {
      forward: round(yields.inflation),
      marketCap: GOLD_TONNES * OZ_PER_TONNE * gold,
      confidence: 1,
      note: `No yield, so the view is inflation only and the real return is zero. Size is ${GOLD_TONNES.toLocaleString("en-US")} tonnes times the gold futures price.`,
    },
    {
      forward: round(yields.bill),
      marketCap: yields.billsMillions * 1e6,
      confidence: 0.25,
      note: "The 3-month Treasury yield. The view is tight because that yield already is the expected return.",
    },
  ];
  if (anchors.some((anchor) => !(anchor.marketCap > 0) || !Number.isFinite(anchor.forward))) {
    throw new Error("Forward inputs for the frontier were incomplete.");
  }
  return { anchors, inflation: yields.inflation, billYield: yields.bill };
}

async function loadCapBook(): Promise<Map<string, number>> {
  const response = await fetch("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&download=true", {
    headers: { "user-agent": UA, accept: "application/json", origin: "https://www.nasdaq.com", referer: "https://www.nasdaq.com/" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Market-cap list did not load.");
  const json = (await response.json()) as { data?: { rows?: Array<{ symbol?: string; marketCap?: string }> } };
  const book = new Map<string, number>();
  for (const row of json.data?.rows ?? []) {
    const symbol = norm(String(row.symbol ?? ""));
    const cap = Number(row.marketCap);
    if (symbol && cap > 0) book.set(symbol, cap);
  }
  return book;
}

async function loadSpx(): Promise<string[]> {
  const response = await fetch("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv", { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("S&P 500 membership did not load.");
  return (await response.text()).trim().split(/\r?\n/).slice(1).map((line) => norm(line.split(",")[0] ?? "")).filter(Boolean);
}

async function loadNdx(): Promise<string[]> {
  const response = await fetch("https://api.nasdaq.com/api/quote/list-type/nasdaq100", {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Nasdaq-100 membership did not load.");
  const json = (await response.json()) as { data?: { data?: { rows?: Array<{ symbol?: string }> } } };
  return (json.data?.data?.rows ?? []).map((row) => norm(String(row.symbol ?? ""))).filter(Boolean);
}

const YAHOO_JAR = "/tmp/frontier-yahoo.txt";
let crumbCache: { value: string; at: number } | null = null;

async function loadQuotes(): Promise<{ bitcoinCap: number; spyYield: number; qqqYield: number }> {
  const crumb = await yahooCrumb();
  const body = await curlText(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=BTC-USD&crumb=${encodeURIComponent(crumb)}`, true);
  const json = JSON.parse(body) as { quoteResponse?: { result?: Array<{ marketCap?: number }> } };
  const bitcoinCap = Number(json.quoteResponse?.result?.[0]?.marketCap);
  const spyYield = await fundYield("SPY", crumb);
  const qqqYield = await fundYield("QQQ", crumb);
  if (!(bitcoinCap > 0) || !(spyYield >= 0) || !(qqqYield >= 0)) throw new Error("Dividend yields or bitcoin's size did not load.");
  return { bitcoinCap, spyYield: spyYield * 100, qqqYield: qqqYield * 100 };
}

async function fundYield(symbol: string, crumb: string): Promise<number> {
  const body = await curlText(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail&crumb=${encodeURIComponent(crumb)}`, true);
  const json = JSON.parse(body) as { quoteSummary?: { result?: Array<{ summaryDetail?: { yield?: { raw?: number }; trailingAnnualDividendYield?: { raw?: number } } }> } };
  const detail = json.quoteSummary?.result?.[0]?.summaryDetail;
  const value = detail?.yield?.raw ?? detail?.trailingAnnualDividendYield?.raw;
  return typeof value === "number" ? value : Number.NaN;
}

async function yahooCrumb(): Promise<string> {
  if (crumbCache && Date.now() - crumbCache.at < 10 * 60 * 1000) return crumbCache.value;
  await curlText("https://fc.yahoo.com", false, true);
  const html = await curlText("https://finance.yahoo.com/quote/SPY", true);
  const crumb = html.match(/"crumb":"([^"]+)"/)?.[1];
  if (!crumb) throw new Error("Valuation session did not start.");
  crumbCache = { value: crumb, at: Date.now() };
  return crumb;
}

function curlText(url: string, sendCookie: boolean, saveCookie = false): Promise<string> {
  const args = ["-sS", "-L", "--max-redirs", "5", "-A", UA, "--max-time", "25", "-w", "\n%{http_code}", url];
  if (sendCookie || saveCookie) args.splice(1, 0, "-b", YAHOO_JAR);
  if (saveCookie) args.splice(1, 0, "-c", YAHOO_JAR);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { maxBuffer: 4_000_000 }, (error, stdout) => {
      if (error && !stdout) {
        reject(error);
        return;
      }
      const text = String(stdout);
      const match = text.match(/\n(\d{3})$/);
      const status = match ? Number(match[1]) : 0;
      const body = match ? text.slice(0, match.index) : text;
      if (status >= 400 && status !== 404) {
        reject(new Error(`Valuation feed returned ${status}`));
        return;
      }
      resolve(body);
    });
  });
}

async function loadYields(): Promise<{ bill: number; inflation: number; billsMillions: number }> {
  const [bill, inflation, bills] = await Promise.all([
    lastFred("DGS3MO"),
    lastFred("T10YIE"),
    lastFred("BOGZ1FL313161110Q"),
  ]);
  if (bill == null || inflation == null || bills == null) throw new Error("Treasury yield or bill stock did not load.");
  return { bill, inflation, billsMillions: bills };
}

async function loadGold(): Promise<number> {
  const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=5d", {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Gold price did not load.");
  const json = (await response.json()) as { chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  const price = [...closes].reverse().find((value) => value != null && value > 0);
  if (price == null) throw new Error("Gold price did not load.");
  return price;
}

async function lastFred(id: string): Promise<number | null> {
  const response = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) return null;
  const lines = (await response.text()).trim().split(/\r?\n/);
  for (let index = lines.length - 1; index >= 1; index -= 1) {
    const value = Number(lines[index]?.split(",")[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function sumCaps(symbols: string[], book: Map<string, number>): { total: number; hit: number } {
  let total = 0;
  let hit = 0;
  for (const symbol of symbols) {
    const cap = book.get(symbol) ?? 0;
    if (cap > 0) {
      total += cap;
      hit += 1;
    }
  }
  return { total, hit };
}

function norm(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[./]/g, "-");
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

async function loadCloses(symbol: string): Promise<{ d: string; c: number }[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5y&includeAdjustedClose=true`;
  const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${symbol} history did not load`);
  const json = (await response.json()) as {
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { adjclose?: { adjclose?: Array<number | null> }[]; quote?: { close?: Array<number | null> }[] } }> };
  };
  const result = json.chart?.result?.[0];
  const stamps = result?.timestamp ?? [];
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const bars: { d: string; c: number }[] = [];
  for (let index = 0; index < stamps.length; index += 1) {
    const close = adjusted?.[index] ?? closes[index];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    bars.push({ d: etDate(stamps[index]), c: close });
  }
  return bars;
}

function intersect(series: { d: string; c: number }[][]): string[] {
  const counts = new Map<string, number>();
  for (const bars of series) {
    for (const bar of new Set(bars.map((item) => item.d))) counts.set(bar, (counts.get(bar) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter((entry) => entry[1] === series.length)
    .map((entry) => entry[0])
    .sort();
}

function etDate(unix: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unix * 1000));
}
