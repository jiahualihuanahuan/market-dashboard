import { execFile } from "node:child_process";
import type { OptBook, OptExpiry, OptQuote } from "@/lib/market/options";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const COOKIE_JAR = "/tmp/market-desk-options.txt";

let session: { crumb: string; at: number } | null = null;
const cache = new Map<string, { at: number; data: OptBook }>();

export async function loadOptions(symbol: string, live = false): Promise<OptBook> {
  const saved = cache.get(symbol);
  if (!live && saved && Date.now() - saved.at < 3 * 60 * 1000) return saved.data;
  const crumb = await yahooCrumb();
  if (!crumb) throw new Error("The option feed did not accept a session. Try refresh.");
  const [first, history] = await Promise.all([yahooOptions(symbol, crumb), spark(symbol)]);
  const dates = first.dates.filter((date) => date !== first.expiry?.ts);
  const rest = await mapPool(dates, 5, async (date) => {
    try {
      return await yahooOptions(symbol, crumb, date);
    } catch {
      return null;
    }
  });
  const expiries = [first.expiry, ...rest.map((item) => item?.expiry ?? null)].filter((item): item is OptExpiry => !!item && (item.calls.length > 0 || item.puts.length > 0));
  expiries.sort((a, b) => a.ts - b.ts);
  if (!expiries.length || !(first.price > 0)) throw new Error("That symbol has no listed options on this feed. Try a US stock or ETF such as SPY or AAPL.");
  const unique: OptExpiry[] = [];
  for (const expiry of expiries) {
    if (!unique.some((item) => item.ts === expiry.ts)) unique.push(expiry);
  }
  const book: OptBook = {
    symbol,
    name: first.name,
    kind: first.kind,
    price: first.price,
    currency: first.currency,
    dividend: first.dividend,
    rate: history.rate,
    rateLabel: history.rateLabel,
    realized20: history.realized20,
    realized60: history.realized60,
    missed: dates.length - rest.filter((item) => item?.expiry).length,
    expiries: unique,
  };
  cache.set(symbol, { at: Date.now(), data: book });
  return book;
}

type Chain = { dates: number[]; expiry: OptExpiry | null; price: number; name: string; kind: string; currency: string; dividend: number };

async function yahooOptions(symbol: string, crumb: string, date?: number): Promise<Chain> {
  const dated = date ? `&date=${date}` : "";
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(crumb)}${dated}`;
  let response = await curl(url, 8_000_000);
  if (response.status === 401) {
    session = null;
    const next = await yahooCrumb();
    if (!next) throw new Error("The option feed refused the request.");
    response = await curl(url.replace(encodeURIComponent(crumb), encodeURIComponent(next)), 8_000_000);
  }
  if (response.status !== 200) throw new Error("The option feed did not answer.");
  const json = JSON.parse(response.body) as {
    optionChain?: { result?: Array<YahooResult> };
  };
  const result = json.optionChain?.result?.[0];
  if (!result) throw new Error("That symbol has no listed options on this feed.");
  const quote = result.quote ?? {};
  const price = Number(quote.regularMarketPrice);
  const block = result.options?.[0];
  const ts = Number(block?.expirationDate);
  const spot = Number.isFinite(price) && price > 0 ? price : 0;
  return {
    dates: (result.expirationDates ?? []).map(Number).filter((item) => item > 0),
    expiry: ts > 0 ? { ts, calls: contracts(block?.calls, spot), puts: contracts(block?.puts, spot) } : null,
    price: spot,
    name: String(quote.longName || quote.shortName || symbol),
    kind: kindOf(String(quote.quoteType ?? "")),
    currency: String(quote.currency || "USD"),
    dividend: dividendOf(quote),
  };
}

function contracts(rows: YahooContract[] | undefined, spot: number): OptQuote[] {
  const out: OptQuote[] = [];
  for (const row of rows ?? []) {
    const strike = Number(row.strike);
    if (!Number.isFinite(strike) || strike <= 0) continue;
    const oi = Math.max(0, Number(row.openInterest) || 0);
    const volume = Math.max(0, Number(row.volume) || 0);
    const near = spot > 0 && Math.abs(strike / spot - 1) <= 0.18;
    if (oi <= 0 && volume <= 0 && !near) continue;
    const iv = Number(row.impliedVolatility);
    out.push({
      strike,
      bid: positive(row.bid),
      ask: positive(row.ask),
      last: positive(row.lastPrice),
      iv: Number.isFinite(iv) && iv > 0 && iv < 5 ? iv : null,
      oi,
      volume,
    });
  }
  return out;
}

function dividendOf(quote: YahooQuote): number {
  const trailing = Number(quote.trailingAnnualDividendYield);
  if (Number.isFinite(trailing) && trailing >= 0 && trailing < 0.2) return trailing;
  const listed = Number(quote.dividendYield);
  if (Number.isFinite(listed) && listed >= 0 && listed < 20) return listed > 0.2 ? listed / 100 : listed;
  return 0;
}

function kindOf(quoteType: string): string {
  if (quoteType === "ETF") return "ETF";
  if (quoteType === "EQUITY") return "Stock";
  if (quoteType === "INDEX") return "Index";
  return "Listed fund";
}

async function spark(symbol: string): Promise<{ rate: number; rateLabel: string; realized20: number | null; realized60: number | null }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(`${symbol},^IRX`)}&range=1y&interval=1d`;
  try {
    const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return fallbackRate(null, null);
    const json = (await response.json()) as Record<string, { close?: number[] }>;
    const closes = (json[symbol]?.close ?? []).filter((value) => value > 0);
    const bill = json["^IRX"]?.close?.filter((value) => value > 0).at(-1);
    const realized20 = realized(closes, 20);
    const realized60 = realized(closes, 60);
    if (bill == null) return fallbackRate(realized20, realized60);
    return { rate: bill / 100, rateLabel: `13-week Treasury bill at ${bill.toFixed(2)}%`, realized20, realized60 };
  } catch {
    return fallbackRate(null, null);
  }
}

function fallbackRate(realized20: number | null, realized60: number | null) {
  return { rate: 0.04, rateLabel: "4% stand-in, because the Treasury bill quote did not load", realized20, realized60 };
}

function realized(closes: number[], window: number): number | null {
  const slice = closes.slice(-(window + 1));
  if (slice.length < window + 1) return null;
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i += 1) returns.push(Math.log(slice[i] / slice[i - 1]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

async function yahooCrumb(): Promise<string | null> {
  if (session && Date.now() - session.at < 10 * 60 * 1000) return session.crumb;
  try {
    await new Promise<void>((resolve) => {
      execFile("curl", ["-sS", "-c", COOKIE_JAR, "-b", COOKIE_JAR, "-A", UA, "-o", "/dev/null", "--max-redirs", "5", "--max-time", "15", "https://fc.yahoo.com"], () => resolve());
    });
    const page = await curl("https://finance.yahoo.com/quote/SPY", 4_000_000, true);
    const crumb = page.body.match(/"crumb":"([^"]+)"/)?.[1];
    if (!crumb) return null;
    session = { crumb, at: Date.now() };
    return crumb;
  } catch {
    return null;
  }
}

function curl(url: string, maxBuffer: number, saveCookies = false): Promise<{ status: number; body: string }> {
  const args = ["-sS", "-L", "--max-redirs", "5", "-b", COOKIE_JAR, "-A", UA, "-H", "Accept: application/json,text/html,*/*", "--max-time", "20", "-w", "\n%{http_code}", url];
  if (saveCookies) args.splice(1, 0, "-c", COOKIE_JAR);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { maxBuffer }, (error, stdout) => {
      if (error && !stdout) {
        reject(error);
        return;
      }
      const text = String(stdout);
      const match = text.match(/\n(\d{3})$/);
      resolve({ status: match ? Number(match[1]) : 0, body: match ? text.slice(0, match.index) : text });
    });
  });
}

function positive(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

type YahooContract = { strike?: number; bid?: number; ask?: number; lastPrice?: number; volume?: number; openInterest?: number; impliedVolatility?: number };
type YahooQuote = { regularMarketPrice?: number; longName?: string; shortName?: string; quoteType?: string; currency?: string; trailingAnnualDividendYield?: number; dividendYield?: number };
type YahooResult = { expirationDates?: number[]; quote?: YahooQuote; options?: Array<{ expirationDate?: number; calls?: YahooContract[]; puts?: YahooContract[] }> };
