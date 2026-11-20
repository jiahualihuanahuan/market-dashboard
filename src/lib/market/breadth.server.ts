import type { IndexBreadth } from "@/lib/market/types";
import { readCache, writeCache } from "./store.server.ts";
import { fetchTextRetry, serialQueue } from "./fetch-util.ts";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0; research)";

const DOW = [
  "MMM", "GOOGL", "AMZN", "AXP", "AMGN", "AAPL", "BA", "CAT", "CVX", "CSCO",
  "KO", "DIS", "GS", "HD", "HON", "IBM", "JNJ", "JPM", "MCD", "MRK",
  "MSFT", "NKE", "NVDA", "PG", "CRM", "SHW", "TRV", "UNH", "V", "WMT",
];

type Spec = { symbol: string; label: string; load: () => Promise<string[]> };

const INDEXES: Spec[] = [
  { symbol: "^GSPC", label: "S&P 500", load: loadSpx },
  { symbol: "^NDX", label: "Nasdaq-100", load: loadNdx },
  { symbol: "^DJI", label: "Dow Jones", load: async () => DOW },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50", load: () => wikiTickers("EURO STOXX 50", "Ticker") },
  { symbol: "^FTSE", label: "FTSE 100", load: loadFtse },
  { symbol: "^GDAXI", label: "DAX", load: () => wikiTickers("DAX", "Ticker") },
  { symbol: "^N225", label: "Nikkei 225", load: loadNikkei },
  { symbol: "^AXJO", label: "ASX 200", load: loadAsx },
  { symbol: "^GSPTSE", label: "S&P/TSX", load: loadTsx },
];

let memberCache: { at: number; lists: Map<string, string[]> } | null = null;

export const HEAT_INDEXES: { symbol: string; label: string }[] = INDEXES.map((spec) => ({
  symbol: spec.symbol,
  label: spec.label,
}));

export async function membersOf(indexSymbol: string): Promise<{ label: string; symbols: string[] } | null> {
  const spec = INDEXES.find((item) => item.symbol === indexSymbol);
  if (!spec) return null;
  const lists = await membership();
  return { label: spec.label, symbols: lists.get(spec.symbol) ?? [] };
}

export async function loadIndexBreadth(): Promise<IndexBreadth[]> {
  const lists = await membership();
  // Members overlap (Dow and most of the Nasdaq-100 are in the S&P 500): fetch each symbol once.
  const wanted = unique(INDEXES.flatMap((spec) => {
    const symbols = lists.get(spec.symbol) ?? [];
    return symbols.length < 10 ? [] : symbols;
  }));
  const all = await sparkChanges(wanted);
  const rows = INDEXES.map((spec) => {
    const symbols = lists.get(spec.symbol) ?? [];
    if (symbols.length < 10) {
      return { symbol: spec.symbol, label: spec.label, up: 0, down: 0, flat: 0, covered: 0, listed: symbols.length };
    }
    const changes = new Map<string, number>();
    for (const symbol of symbols) {
      const pct = all.get(symbol.trim().toUpperCase());
      if (pct !== undefined) changes.set(symbol, pct);
    }
    let up = 0;
    let down = 0;
    let flat = 0;
    for (const pct of changes.values()) {
      if (Math.abs(pct) < 0.05) flat += 1;
      else if (pct > 0) up += 1;
      else down += 1;
    }
    return { symbol: spec.symbol, label: spec.label, up, down, flat, covered: changes.size, listed: symbols.length };
  });
  return rows;
}

const MEMBER_MS = 12 * 60 * 60 * 1000;
let memberFlight: Promise<Map<string, string[]>> | null = null;

function membership(): Promise<Map<string, string[]>> {
  if (!memberCache) {
    // Index lists change a few times a year; keep them across restarts.
    const saved = readCache<{ at: number; lists: Record<string, string[]> }>("index-members");
    if (saved?.lists) memberCache = { at: saved.at, lists: new Map(Object.entries(saved.lists)) };
  }
  if (memberCache && Date.now() - memberCache.at < MEMBER_MS && INDEXES.every((spec) => (memberCache?.lists.get(spec.symbol)?.length ?? 0) >= 10)) {
    return Promise.resolve(memberCache.lists);
  }
  memberFlight ??= refreshMembership().finally(() => {
    memberFlight = null;
  });
  return memberFlight;
}

async function refreshMembership(): Promise<Map<string, string[]>> {
  const fresh = memberCache && Date.now() - memberCache.at < MEMBER_MS;
  const lists = new Map(memberCache?.lists ?? []);
  // Different hosts load in parallel; Wikipedia calls still go one at a time (see `wiki`).
  await Promise.all(INDEXES.map(async (spec) => {
    const have = lists.get(spec.symbol);
    if (fresh && have && have.length >= 10) return;
    try {
      const symbols = unique(await spec.load());
      if (symbols.length >= 10 || !have?.length) lists.set(spec.symbol, symbols);
    } catch {
      if (!lists.has(spec.symbol)) lists.set(spec.symbol, []);
    }
  }));
  memberCache = { at: Date.now(), lists };
  writeCache("index-members", { at: memberCache.at, lists: Object.fromEntries(lists) });
  return lists;
}

async function loadSpx(): Promise<string[]> {
  const text = await getText("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv");
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",")[0]?.trim().replace(/\./g, "-"))
    .filter((symbol): symbol is string => !!symbol);
}

async function loadNdx(): Promise<string[]> {
  const json = await getJson("https://api.nasdaq.com/api/quote/list-type/nasdaq100");
  const rows = (json?.data?.data?.rows ?? json?.data?.data?.data ?? []) as { symbol?: string }[];
  return rows.map((row) => String(row.symbol ?? "").trim()).filter(Boolean);
}

async function loadFtse(): Promise<string[]> {
  const html = await wiki("FTSE 100 Index");
  const table = html.split('id="constituents"')[1]?.split("</table>")[0] ?? "";
  return cells(table, 1).map((ticker) => `${ticker.replace(/\./g, "-")}.L`);
}

async function loadNikkei(): Promise<string[]> {
  const json = await wikiQueue(() => getJson(
    "https://en.wikipedia.org/w/api.php?action=parse&page=Nikkei%20225&prop=wikitext&format=json",
  ));
  const text = String(json?.parse?.wikitext?.["*"] ?? "");
  const codes = unique([...text.matchAll(/\{\{tyo2\|([^}]+)\}\}/g)].map((match) => match[1].trim().toUpperCase()));
  const symbols = codes.filter((code) => /^[0-9]{3}[0-9A-Z]$/.test(code));
  return symbols.map((code) => `${code}.T`);
}

async function loadTsx(): Promise<string[]> {
  const html = await wiki("S&P/TSX Composite Index");
  const table = sliceTable(html, "Ticker") || tableWith(html, /ticker/i);
  return cells(table, 0)
    .filter((ticker) => /^[A-Z][A-Z0-9.-]{0,8}$/.test(ticker) && !/^(TICKER|SECTOR|INDUSTRY)$/.test(ticker))
    .map((ticker) => `${ticker.replace(/\./g, "-")}.TO`);
}

function tableWith(html: string, pattern: RegExp): string {
  let best = "";
  for (const part of html.split("<table").slice(1)) {
    const table = part.split("</table>")[0];
    if (pattern.test(table.slice(0, 800)) && table.length > best.length) best = table;
  }
  return best;
}

async function loadAsx(): Promise<string[]> {
  const json = await wikiQueue(() => getJson(
    "https://en.wikipedia.org/w/api.php?action=parse&page=S%26P%2FASX%20200&prop=wikitext&format=json",
  ));
  const text = String(json?.parse?.wikitext?.["*"] ?? "");
  const codes = [...text.matchAll(/\|\s*([A-Z0-9]{3})\s*\|/g)].map((match) => match[1]);
  const symbols = unique(codes).filter((code) => code !== "ASX" && code !== "XJO");
  return symbols.length >= 150 ? symbols.map((code) => `${code}.AX`) : [];
}

async function wikiTickers(page: string, header: string): Promise<string[]> {
  const html = await wiki(page);
  return cells(sliceTable(html, header), 0).filter((ticker) => /^[A-Z0-9]{1,6}(?:\.[A-Z]{1,4})+$/.test(ticker));
}

function sliceTable(html: string, header: string): string {
  const patterns = [`>${header}<`, `>${header}</`, `>${header} `];
  let at = -1;
  for (const pattern of patterns) {
    at = html.indexOf(pattern);
    if (at >= 0) break;
  }
  if (at < 0) return "";
  const start = html.lastIndexOf("<table", at);
  return html.slice(Math.max(0, start), html.indexOf("</table>", at));
}

function cells(table: string, index: number): string[] {
  const out: string[] = [];
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const found = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) =>
      match[1].replace(/<[^>]+>/g, "").replace(/&/g, "&").trim(),
    );
    const value = found[index]?.toUpperCase();
    if (value) out.push(value);
  }
  return out;
}

async function sparkChanges(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));
  await mapPool(batches, 5, async (batch) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(batch.join(","))}&range=5d&interval=1d`;
    let json: Record<string, { fulldayChangePercent?: number }>;
    try {
      json = JSON.parse(await fetchTextRetry(url, { headers: { "user-agent": UA }, timeoutMs: 15000, retries: 1 }));
    } catch {
      return;
    }
    for (const symbol of batch) {
      const pct = json[symbol]?.fulldayChangePercent;
      if (typeof pct === "number" && Number.isFinite(pct)) out.set(symbol, pct);
    }
  });
  return out;
}

// One Wikipedia request at a time (Wikimedia API etiquette: serial, not parallel), even when index lists load in parallel.
const wikiQueue = serialQueue(300);

async function wiki(page: string): Promise<string> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json`;
  const json = await wikiQueue(() => getJson(url));
  const html = json?.parse?.text?.["*"];
  if (typeof html !== "string" || html.length < 1000) throw new Error(`No Wikipedia text for ${page}`);
  return html;
}

async function getText(url: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,text/plain,*/*" },
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 429 || response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.text();
  }
  throw new Error(`Rate limited ${url}`);
}

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    if (response.status === 429 || text.startsWith("You are making")) {
      await new Promise((resolve) => setTimeout(resolve, 4000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return JSON.parse(text);
  }
  throw new Error(`Rate limited ${url}`);
}

function unique(symbols: string[]): string[] {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
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
