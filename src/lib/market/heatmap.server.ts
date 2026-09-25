import { execFile } from "node:child_process";
import { membersOf } from "@/lib/market/breadth.server";
import type { HeatCell, Heatmap } from "@/lib/market/types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let cache: { key: string; at: number; data: Heatmap } | null = null;
let spxCache: { at: number; rows: Map<string, { name: string; sector: string; industry: string }> } | null = null;
let nasdaqCache: { at: number; rows: Map<string, { name: string; sector: string; industry: string; cap: number }> } | null = null;
let session: { crumb: string; at: number } | null = null;
const sectorCache = new Map<string, { at: number; sector: string; industry: string; name: string }>();

export async function loadHeatmap(index: string, live = false): Promise<Heatmap> {
  if (!live && cache && cache.key === index && Date.now() - cache.at < 8 * 60 * 1000) return cache.data;
  const members = await membersOf(index);
  if (!members) throw new Error("That index is not on this desk.");
  const priced = await sparkCells(members.symbols);
  const cells = await withFundamentals(priced);
  const data: Heatmap = { index, label: members.label, listed: members.symbols.length, cells };
  cache = { key: index, at: Date.now(), data };
  return data;
}

async function sparkCells(symbols: string[]): Promise<HeatCell[]> {
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));
  const rows = await mapPool(batches, 5, async (batch) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(batch.join(","))}&range=1y&interval=1d`;
    const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) return [] as HeatCell[];
    const json = (await response.json()) as Record<string, { close?: number[]; fulldayChangePercent?: number }>;
    return batch.flatMap((symbol) => {
      const row = json[symbol];
      if (!row) return [];
      const closes = (row.close ?? []).filter((value) => typeof value === "number" && value > 0);
      const day = row.fulldayChangePercent;
      return [{
        symbol,
        name: symbol,
        sector: "",
        industry: "",
        cap: 0,
        currency: "",
        d1: typeof day === "number" && Number.isFinite(day) ? round(day) : move(closes, 1),
        w1: move(closes, 5),
        m1: move(closes, 21),
        y1: move(closes, 252),
      }];
    });
  });
  return rows.flat();
}

async function withFundamentals(cells: HeatCell[]): Promise<HeatCell[]> {
  const [book, listed] = await Promise.all([nasdaqBook(), spxMeta()]);
  const next = cells.map((cell) => {
    const row = book.get(norm(cell.symbol));
    const gics = listed.get(norm(cell.symbol));
    return {
      ...cell,
      name: gics?.name || row?.name || cell.symbol,
      sector: canonSector(gics?.sector ?? "") || row?.sector || "",
      industry: gics?.industry || row?.industry || "",
      cap: row?.cap ?? 0,
      currency: row?.cap ? "USD" : cell.currency,
    };
  });
  const needCap = next.filter((cell) => !(cell.cap > 0));
  if (needCap.length) {
    const quotes = await yahooQuotes(needCap.map((cell) => cell.symbol));
    for (const cell of next) {
      const quote = quotes.get(cell.symbol);
      if (!quote) continue;
      if (!(cell.cap > 0) && quote.cap > 0) cell.cap = quote.cap;
      if (quote.name) cell.name = quote.name;
      if (quote.currency) cell.currency = quote.currency;
    }
  }
  const needSector = next.filter((cell) => !cell.sector);
  await mapPool(needSector, 6, async (cell) => {
    const saved = sectorCache.get(cell.symbol);
    if (saved && Date.now() - saved.at < 24 * 60 * 60 * 1000) {
      cell.sector = saved.sector;
      cell.industry = saved.industry || cell.industry;
      if (saved.name) cell.name = saved.name;
      return;
    }
    const profile = await yahooProfile(cell.symbol);
    cell.sector = profile.sector;
    cell.industry = profile.industry || cell.industry;
    if (profile.name) cell.name = profile.name;
    sectorCache.set(cell.symbol, { at: Date.now(), ...profile });
  });
  for (const cell of next) {
    if (!cell.sector) cell.sector = "Other";
    if (!(cell.cap > 0)) cell.cap = 0;
  }
  return next;
}

async function nasdaqBook() {
  if (nasdaqCache && Date.now() - nasdaqCache.at < 12 * 60 * 60 * 1000) return nasdaqCache.rows;
  const rows = new Map<string, { name: string; sector: string; industry: string; cap: number }>();
  try {
    const response = await fetch("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&download=true", {
      headers: { "user-agent": UA, accept: "application/json", origin: "https://www.nasdaq.com", referer: "https://www.nasdaq.com/" },
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) {
      const json = (await response.json()) as { data?: { rows?: Array<Record<string, string>> } };
      for (const row of json.data?.rows ?? []) {
        const symbol = norm(String(row.symbol ?? ""));
        const cap = Number(row.marketCap);
        const sector = canonSector(String(row.sector ?? ""));
        if (!symbol) continue;
        rows.set(symbol, {
          name: cleanName(String(row.name ?? "")),
          sector,
          industry: cleanName(String(row.industry ?? "")),
          cap: Number.isFinite(cap) && cap > 0 ? cap : 0,
        });
      }
    }
  } catch {
    // Sector and size fall back to Yahoo for the names this list missed.
  }
  nasdaqCache = { at: Date.now(), rows };
  return rows;
}

async function spxMeta() {
  if (spxCache && Date.now() - spxCache.at < 12 * 60 * 60 * 1000) return spxCache.rows;
  const rows = new Map<string, { name: string; sector: string; industry: string }>();
  try {
    const response = await fetch("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv", {
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const table = parseCsv(await response.text());
      const header = table[0]?.map((cell) => cell.toLowerCase()) ?? [];
      const symbolAt = header.indexOf("symbol");
      const nameAt = header.findIndex((cell) => cell.includes("security") || cell === "name");
      const sectorAt = header.findIndex((cell) => cell.includes("sector"));
      const industryAt = header.findIndex((cell) => cell.includes("industry"));
      for (const record of table.slice(1)) {
        const symbol = norm(record[symbolAt] ?? "");
        if (!symbol) continue;
        rows.set(symbol, {
          name: cleanName(record[nameAt] ?? ""),
          sector: record[sectorAt] ?? "",
          industry: record[industryAt] ?? "",
        });
      }
    }
  } catch {
    // Index members still group by the Nasdaq sector list.
  }
  spxCache = { at: Date.now(), rows };
  return rows;
}

async function yahooQuotes(symbols: string[]): Promise<Map<string, { name: string; cap: number; currency: string }>> {
  const out = new Map<string, { name: string; cap: number; currency: string }>();
  const crumb = await yahooCrumb();
  if (!crumb) return out;
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 40) batches.push(symbols.slice(i, i + 40));
  await mapPool(batches, 4, async (batch) => {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(batch.join(","))}&crumb=${encodeURIComponent(crumb)}`;
    const response = await curl(url, 1_500_000);
    if (response.status === 401) session = null;
    if (response.status !== 200) return;
    try {
      const json = JSON.parse(response.body) as {
        quoteResponse?: { result?: Array<{ symbol?: string; shortName?: string; marketCap?: number; currency?: string }> };
      };
    for (const row of json.quoteResponse?.result ?? []) {
      const symbol = String(row.symbol ?? "");
      const cap = Number(row.marketCap);
      if (!symbol) continue;
      out.set(symbol, {
        name: cleanName(String(row.shortName ?? "")),
        cap: Number.isFinite(cap) && cap > 0 ? cap : 0,
        currency: String(row.currency ?? ""),
      });
    }
    } catch {
      return;
    }
  });
  return out;
}

async function yahooProfile(symbol: string): Promise<{ sector: string; industry: string; name: string }> {
  const empty = { sector: "Other", industry: "", name: "" };
  const crumb = await yahooCrumb();
  if (!crumb) return empty;
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile&crumb=${encodeURIComponent(crumb)}`;
  try {
    const response = await curl(url, 400_000);
    if (response.status === 401) session = null;
    if (response.status !== 200) return empty;
    const json = JSON.parse(response.body) as {
      quoteSummary?: { result?: Array<{ assetProfile?: { sector?: string; industry?: string; longName?: string } }> };
    };
    const profile = json.quoteSummary?.result?.[0]?.assetProfile;
    return {
      sector: canonSector(profile?.sector ?? "") || "Other",
      industry: profile?.industry ?? "",
      name: cleanName(profile?.longName ?? ""),
    };
  } catch {
    return empty;
  }
}

const COOKIE_JAR = "/tmp/market-desk-yahoo.txt";

async function yahooCrumb(): Promise<string | null> {
  if (session && Date.now() - session.at < 10 * 60 * 1000) return session.crumb;
  try {
    await execFile("curl", ["-sS", "-c", COOKIE_JAR, "-b", COOKIE_JAR, "-A", UA, "-o", "/dev/null", "--max-redirs", "0", "--max-time", "15", "https://fc.yahoo.com"]);
    const page = await curl("https://finance.yahoo.com/quote/AAPL", 3_000_000, true);
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
      const status = match ? Number(match[1]) : 0;
      resolve({ status, body: match ? text.slice(0, match.index) : text });
    });
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function canonSector(raw: string): string {
  const text = raw.toLowerCase();
  if (!text.trim()) return "";
  if (text.includes("tech")) return "Technology";
  if (text.includes("financ") || text.includes("bank")) return "Financials";
  if (text.includes("health")) return "Health care";
  if (text.includes("discretion") || text.includes("cyclical")) return "Consumer discretionary";
  if (text.includes("staple") || text.includes("defensive")) return "Consumer staples";
  if (text.includes("industrial")) return "Industrials";
  if (text.includes("energy")) return "Energy";
  if (text.includes("material")) return "Materials";
  if (text.includes("utilit")) return "Utilities";
  if (text.includes("real estate") || text.includes("reit")) return "Real estate";
  if (text.includes("telecom") || text.includes("communicat")) return "Communication";
  if (text.includes("misc")) return "Other";
  return raw.trim();
}

function cleanName(name: string): string {
  return name
    .replace(/\s+(Common Stock|Ordinary Shares|American Depositary Shares|Depositary Shares|Class [A-Z].*)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(symbol: string): string {
  return symbol.toUpperCase().replace(/[./]/g, "-");
}

function move(closes: number[], sessions: number): number | null {
  if (closes.length <= sessions) {
    if (sessions >= 200 && closes.length > 200) return move(closes, closes.length - 1);
    return null;
  }
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 1 - sessions];
  if (!prev || prev <= 0) return null;
  return round((last / prev - 1) * 100);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
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
