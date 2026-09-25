import { execFile } from "node:child_process";
import { membersOf } from "@/lib/market/breadth.server";
import type { HeatCell, Heatmap } from "@/lib/market/types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let cache: { key: string; at: number; data: Heatmap } | null = null;
let spxCache: { at: number; rows: Map<string, { name: string; sector: string; industry: string }> } | null = null;
let nasdaqCache: { at: number; rows: Map<string, { name: string; sector: string; industry: string; cap: number }> } | null = null;
let session: { crumb: string; at: number } | null = null;
const sectorCache = new Map<string, { at: number; sector: string; industry: string; name: string }>();
const bookCache = new Map<string, { at: number; rows: Map<string, LocalMeta> }>();

type LocalMeta = { name: string; sector: string; industry: string; cap: number; currency: string };

export async function loadHeatmap(index: string, live = false): Promise<Heatmap> {
  if (!live && cache && cache.key === index && Date.now() - cache.at < 8 * 60 * 1000) return cache.data;
  const members = await membersOf(index);
  if (!members) throw new Error("That index is not on this desk.");
  const priced = await sparkCells(members.symbols);
  const cells = await withFundamentals(index, priced);
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
    const byKey = new Map(Object.entries(json).map(([key, value]) => [key.toUpperCase(), value]));
    return batch.flatMap((symbol) => {
      const row = json[symbol] ?? byKey.get(symbol.toUpperCase());
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

async function withFundamentals(index: string, cells: HeatCell[]): Promise<HeatCell[]> {
  const [book, listed, local] = await Promise.all([nasdaqBook(), spxMeta(), localBook(index)]);
  const next = cells.map((cell) => {
    const row = book.get(norm(cell.symbol));
    const gics = listed.get(norm(cell.symbol));
    const home = local.get(cell.symbol);
    const cap = row?.cap || home?.cap || 0;
    return {
      ...cell,
      name: home?.name || gics?.name || row?.name || cell.symbol,
      sector: home?.sector || canonSector(gics?.sector ?? "") || row?.sector || "",
      industry: home?.industry || gics?.industry || row?.industry || "",
      cap,
      currency: row?.cap ? "USD" : cap > 0 ? home?.currency || cell.currency : cell.currency,
    };
  });
  const quoteTargets = local.size > 0 ? next : next.filter((cell) => !(cell.cap > 0));
  if (quoteTargets.length) {
    const quotes = await yahooQuotes(quoteTargets.map((cell) => cell.symbol));
    for (const cell of next) {
      const quote = quotes.get(cell.symbol);
      if (!quote) continue;
      if (quote.cap > 0) {
        cell.cap = quote.cap;
        if (quote.currency) cell.currency = quote.currency;
      }
      if (quote.name && (cell.name === cell.symbol || !cell.name)) cell.name = quote.name;
    }
  }
  const needSector = next.filter((cell) => !cell.sector);
  const profileTargets = index === "^N225" ? next : needSector;
  await mapPool(profileTargets, 8, async (cell) => {
    const saved = sectorCache.get(cell.symbol);
    if (saved && Date.now() - saved.at < 24 * 60 * 60 * 1000) {
      if (saved.sector && saved.sector !== "Other") cell.sector = saved.sector;
      else if (!cell.sector) cell.sector = saved.sector || "Other";
      if (saved.industry) cell.industry = saved.industry;
      if (saved.name && cell.name === cell.symbol) cell.name = saved.name;
      return;
    }
    const profile = await yahooProfile(cell.symbol);
    if (profile.sector && profile.sector !== "Other") {
      cell.sector = profile.sector;
      if (profile.industry) cell.industry = profile.industry;
    } else if (!cell.sector) cell.sector = "Other";
    if (profile.name && cell.name === cell.symbol) cell.name = profile.name;
    sectorCache.set(cell.symbol, { at: Date.now(), sector: cell.sector, industry: cell.industry, name: cell.name });
  });
  for (const cell of next) {
    if (!cell.sector) cell.sector = "Other";
    if (!(cell.cap > 0)) cell.cap = 0;
  }
  return next;
}

async function localBook(index: string): Promise<Map<string, LocalMeta>> {
  const saved = bookCache.get(index);
  if (saved && Date.now() - saved.at < 12 * 60 * 60 * 1000) return saved.rows;
  let rows = new Map<string, LocalMeta>();
  try {
    if (index === "^FTSE") rows = await suffixedBook("FTSE 100 Index", ".L");
    else if (index === "^GDAXI") rows = await suffixedBook("DAX", "");
    else if (index === "^STOXX50E") rows = await suffixedBook("EURO STOXX 50", "");
    else if (index === "^GSPTSE") rows = await suffixedBook("S&P/TSX Composite Index", ".TO");
    else if (index === "^AXJO") rows = await suffixedBook("S&P/ASX 200", ".AX");
    else if (index === "^N225") rows = await nikkeiBook();
  } catch {
    rows = new Map();
  }
  if (rows.size >= 10) bookCache.set(index, { at: Date.now(), rows });
  return rows;
}

async function suffixedBook(page: string, suffix: string): Promise<Map<string, LocalMeta>> {
  const html = await wikiHtml(page);
  let best = new Map<string, LocalMeta>();
  for (const table of htmlTables(html)) {
    const header = table[0].map((cell) => cell.toLowerCase());
    const tickerAt = header.findIndex((cell) => cell.includes("ticker") || cell === "code" || cell.startsWith("code"));
    const sectorAt = header.findIndex((cell) => cell.includes("sector"));
    const nameAt = header.findIndex((cell) => cell.includes("company") || cell === "name");
    const industryAt = header.findIndex((cell) => cell.includes("industry"));
    const capAt = header.findIndex((cell) => cell.includes("capitalisation") || cell.includes("capitalization") || cell.includes("market cap"));
    if (tickerAt < 0 || sectorAt < 0) continue;
    const rows = new Map<string, LocalMeta>();
    for (const record of table.slice(1)) {
      const symbol = withSuffix(record[tickerAt] ?? "", suffix);
      const rawSector = record[sectorAt] ?? "";
      if (!symbol || !rawSector) continue;
      const cap = capAt >= 0 ? parseCap(record[capAt] ?? "") : 0;
      rows.set(symbol, {
        name: cleanName(record[nameAt] ?? "") || symbol,
        sector: canonSector(rawSector),
        industry: cleanName(record[industryAt] ?? "") || rawSector,
        cap,
        currency: cap > 0 && suffix === ".AX" ? "AUD" : cap > 0 && suffix === ".L" ? "GBP" : cap > 0 && suffix === ".TO" ? "CAD" : "",
      });
    }
    if (rows.size > best.size) best = rows;
  }
  return best;
}

async function nikkeiBook(): Promise<Map<string, LocalMeta>> {
  const text = await wikiRaw("Nikkei 225");
  const rows = new Map<string, LocalMeta>();
  let section = "";
  for (const line of text.split("\n")) {
    const heading = line.match(/^===([^=]+)===\s*$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    if (/^==[^=]/.test(line)) section = "";
    if (!section) continue;
    const sector = NIKKEI_SECTOR[section.toLowerCase()] ?? canonSector(section);
    for (const match of line.matchAll(/\{\{tyo2\|([^}]+)\}\}/g)) {
      const code = match[1].trim().toUpperCase();
      if (!/^[0-9]{3}[0-9A-Z]$/.test(code)) continue;
      const linked = line.match(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/)?.[1] ?? code;
      rows.set(`${code}.T`, {
        name: cleanName(linked.replace(/'''/g, "")),
        sector,
        industry: section,
        cap: 0,
        currency: "",
      });
    }
  }
  return rows;
}

const NIKKEI_SECTOR: Record<string, string> = {
  "air transport": "Industrials",
  automotive: "Consumer discretionary",
  banking: "Financials",
  chemicals: "Materials",
  communications: "Communication",
  construction: "Industrials",
  "electric machinery": "Industrials",
  "electric power": "Utilities",
  fishery: "Consumer staples",
  foods: "Consumer staples",
  gas: "Utilities",
  "glass & ceramics": "Materials",
  insurance: "Financials",
  "land transport": "Industrials",
  machinery: "Industrials",
  "marine transport": "Industrials",
  mining: "Materials",
  "nonferrous metals": "Materials",
  "other financial services": "Financials",
  "other manufacturing": "Industrials",
  petroleum: "Energy",
  pharmaceuticals: "Health care",
  "precision instruments": "Health care",
  "pulp & paper": "Materials",
  "railway/bus": "Industrials",
  "real estate": "Real estate",
  retail: "Consumer discretionary",
  rubber: "Materials",
  securities: "Financials",
  services: "Industrials",
  shipbuilding: "Industrials",
  steel: "Materials",
  "textiles & apparel": "Consumer discretionary",
  "trading companies": "Industrials",
};

const EXCHANGES = new Set(["DE", "PA", "AS", "BR", "MC", "MI", "HE", "SW", "ST", "OL", "CO", "LS", "L", "TO", "AX", "T", "HK", "VI"]);

function withSuffix(ticker: string, suffix: string): string {
  const raw = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  const parts = raw.split(".").filter(Boolean);
  if (!parts.length || parts[0] === "TICKER" || parts[0] === "CODE") return "";
  if (parts.length >= 2 && EXCHANGES.has(parts[parts.length - 1])) return `${parts.slice(0, -1).join("-")}.${parts[parts.length - 1]}`;
  const head = raw.replace(/\./g, "-");
  return suffix ? `${head}${suffix}` : head;
}

function parseCap(raw: string): number {
  const text = raw.replace(/,/g, "").replace(/[$£€¥]/g, "").trim();
  const match = text.match(/([0-9]*\.?[0-9]+)\s*(trillion|billion|million|tn|bn|m)?/i);
  if (!match) return 0;
  let value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const unit = (match[2] ?? "").toLowerCase();
  if (unit.startsWith("t")) value *= 1e12;
  else if (unit.startsWith("b")) value *= 1e9;
  else if (unit === "m" || unit.startsWith("million")) value *= 1e6;
  return value;
}

async function wikiHtml(page: string): Promise<string> {
  const json = await wikiApi(page, "text");
  const html = json?.parse?.text?.["*"];
  if (typeof html !== "string" || html.length < 500) throw new Error(`No Wikipedia page for ${page}`);
  return html;
}

async function wikiRaw(page: string): Promise<string> {
  const json = await wikiApi(page, "wikitext");
  const text = json?.parse?.wikitext?.["*"];
  if (typeof text !== "string" || text.length < 500) throw new Error(`No Wikipedia text for ${page}`);
  return text;
}

async function wikiApi(page: string, prop: string): Promise<{ parse?: { text?: { "*"?: string }; wikitext?: { "*"?: string } } }> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=${prop}&format=json`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    if (response.status === 429 || text.startsWith("You are making")) {
      await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${page}`);
    return JSON.parse(text) as { parse?: { text?: { "*"?: string }; wikitext?: { "*"?: string } } };
  }
  throw new Error(`Rate limited ${page}`);
}

function htmlTables(html: string): string[][][] {
  const tables: string[][][] = [];
  for (const part of html.split("<table").slice(1)) {
    const chunk = part.split("</table>")[0];
    const rows: string[][] = [];
    for (const tr of chunk.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
      const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((match) => cleanCell(match[1]));
      if (cells.some(Boolean)) rows.push(cells);
    }
    if (rows.length > 1) tables.push(rows);
  }
  return tables;
}

function cleanCell(raw: string): string {
  let text = raw.replace(/<[^>]+>/g, " ");
  for (let pass = 0; pass < 3; pass += 1) {
    const next = text
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&/gi, "&")
      .replace(/&#38;/gi, "&")
      .replace(/&#39;|'/gi, "'")
      .replace(/"/gi, '"');
    if (next === text) break;
    text = next;
  }
  return text.replace(/\s+/g, " ").trim();
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
  let crumb = await yahooCrumb();
  if (!crumb) return out;
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 40) batches.push(symbols.slice(i, i + 40));
  await mapPool(batches, 4, async (batch) => {
    const pull = async (token: string) => {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(batch.join(","))}&crumb=${encodeURIComponent(token)}`;
      return curl(url, 5_000_000);
    };
    let response = await pull(crumb!);
    if (response.status === 401) {
      session = null;
      crumb = await yahooCrumb();
      if (!crumb) return;
      response = await pull(crumb);
    }
    if (response.status !== 200) return;
    try {
      const json = JSON.parse(response.body) as {
        quoteResponse?: { result?: Array<Record<string, unknown>> };
      };
      const wanted = new Map(batch.map((symbol) => [symbol.toUpperCase(), symbol]));
      for (const row of json.quoteResponse?.result ?? []) {
        const returned = String(row.symbol ?? "");
        const symbol = wanted.get(returned.toUpperCase()) ?? returned;
        if (!symbol) continue;
        const currency = majorCurrency(String(row.currency ?? ""));
        out.set(symbol, {
          name: cleanName(String(row.shortName ?? "")),
          cap: capFromQuote(row),
          currency,
        });
      }
    } catch {
      return;
    }
  });
  return out;
}

function capFromQuote(row: Record<string, unknown>): number {
  const quoted = Number(row.marketCap);
  if (Number.isFinite(quoted) && quoted > 0) return quoted;
  const shares = Number(row.sharesOutstanding ?? row.impliedSharesOutstanding);
  const price = Number(row.regularMarketPrice);
  if (!(shares > 0 && price > 0)) return 0;
  const currency = String(row.currency ?? "");
  const minor = currency === "GBp" || currency === "GBX" || currency === "ZAc" || currency === "ILA";
  return (shares * price) / (minor ? 100 : 1);
}

function majorCurrency(code: string): string {
  if (code === "GBp" || code === "GBX") return "GBP";
  if (code === "ZAc") return "ZAR";
  if (code === "ILA") return "ILS";
  return code;
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
    await new Promise<void>((resolve) => {
      execFile(
        "curl",
        ["-sS", "-c", COOKIE_JAR, "-b", COOKIE_JAR, "-A", UA, "-o", "/dev/null", "--max-redirs", "5", "--max-time", "15", "https://fc.yahoo.com"],
        () => resolve(),
      );
    });
    const page = await curl("https://finance.yahoo.com/quote/AAPL", 4_000_000, true);
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
  const text = raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text === "consumer goods") return "Consumer staples";
  if (text.includes("real estate") || text.includes("reit")) return "Real estate";
  if (text.includes("investment trust") || text.includes("collective investment")) return "Financials";
  if (text.includes("staple") || text.includes("grocery") || text.includes("food") || text.includes("beverage") || text.includes("tobacco") || text.includes("personal care") || text.includes("household") || text.includes("fishery") || text.includes("defensive")) return "Consumer staples";
  if (text.includes("health") || text.includes("pharma") || text.includes("biotech") || text.includes("medical")) return "Health care";
  if ((text.includes("energy") && !text.includes("information")) || text.includes("oil") || text.includes("petroleum") || text.includes("gas producer")) return "Energy";
  if (text.includes("electronic") || text.includes("tech") || text.includes("software") || text.includes("semiconductor") || text.includes("information")) return "Technology";
  if (text.includes("discretion") || text.includes("cyclical") || text.includes("apparel") || text.includes("auto") || text.includes("e-commerce") || text.includes("ecommerce") || text.includes("retail") || text.includes("luxury") || text.includes("textile") || text.includes("travel") || text.includes("leisure") || text.includes("personal good") || text.includes("consumer")) return "Consumer discretionary";
  if (text.includes("bank") || text.includes("financ") || text.includes("insurance") || text.includes("securit")) return "Financials";
  if (text.includes("telecom") || text.includes("communicat") || text.includes("media")) return "Communication";
  if (text.includes("utilit") || text.includes("electric power")) return "Utilities";
  if (text.includes("material") || text.includes("mining") || text.includes("metal") || text.includes("chem") || text.includes("steel") || text.includes("pulp") || text.includes("paper") || text.includes("glass") || text.includes("ceramic") || text.includes("rubber") || text.includes("basic resource")) return "Materials";
  if (text.includes("industrial") || text.includes("transport") || text.includes("aerospace") || text.includes("defence") || text.includes("defense") || text.includes("construction") || text.includes("machinery") || text.includes("logistic") || text.includes("engineering") || text.includes("shipbuild") || text.includes("distribut") || text.includes("support service")) return "Industrials";
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
