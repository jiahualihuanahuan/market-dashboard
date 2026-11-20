import { sectorOf } from "./catalog.ts";
import { applyAlias, issuerKey } from "./tickers.ts";
import type { HoldingLine } from "./types.ts";

/** US tickers that collide with TSX symbols (TELUS, Keyera, Hydro One). */
const US_DISAMBIGUATE = new Set(["T", "KEY", "H"]);

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

export type ParsedHoldings = {
  holdings: HoldingLine[];
  asOf?: string;
};

export function decodeEntities(html: string): string {
  return html
    .replace(/&/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/"/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseWeight(raw: string | number): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    const w = Math.abs(raw) > 1.5 ? raw / 100 : raw;
    return Math.round(w * 1e8) / 1e8;
  }
  const original = String(raw).trim();
  if (!original) return null;
  const hadPct = /%/.test(original);
  const parenNeg = /\(.*\)/.test(original);
  const s = original.replace(/,/g, "").replace(/[()%]/g, "").trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  let w = hadPct || Math.abs(n) > 1.5 ? n / 100 : n;
  if (parenNeg && w > 0) w = -w;
  return Math.round(w * 1e8) / 1e8;
}

export function parseAsOf(text: string): string | undefined {
  const iso = text.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }
  const long = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  );
  if (long) {
    const mm = MONTHS[(long[1] ?? "").toLowerCase()];
    if (mm) return `${long[3]}-${mm}-${String(long[2]).padStart(2, "0")}`;
  }
  return undefined;
}

export function nameLooksLikeFund(name: string): boolean {
  return /\b(ETF|ETP|ETN|INDEX FUND|MUTUAL FUND|YIELD MAXIMIZER|DAYMAX|COVERED CALL|ENHANCED YIELD)\b/i.test(
    name,
  );
}

export function holdingsAreUsable(holdings: HoldingLine[] | null | undefined): boolean {
  if (!holdings || holdings.length === 0) return false;
  const named = holdings.filter((h) => h.symbol && h.symbol !== "OTHER");
  const coverage = holdings.reduce((s, h) => s + Math.max(h.weight, 0), 0);
  if (named.length >= 3 && coverage >= 0.15) return true;
  if (named.length >= 1 && coverage >= 0.5) return true;
  return false;
}

function isCashName(name: string): boolean {
  return /\b(cash|t-?bill|treasury|money market|cash equivalent|foreign currency|currency forward|fx forward|assets and liabilities|other assets)\b/i.test(
    name,
  );
}

function isOptionName(name: string): boolean {
  return /\b(written options?|call options?|put options?|options overlay|covered call options?)\b/i.test(
    name,
  );
}

function isOptionTicker(ticker: string): boolean {
  return /\d{2}\/\d{2}\/\d{2}/.test(ticker) || /\s[CP]\d{1,5}(?:\s|$)/.test(ticker);
}

/**
 * Bloomberg-style ids (`NVDA US EQUITY`, `SLF CN`, `HTA CN EQUITY`) and
 * option rows (`BMO CN 09/18/26 C248 EQUITY`) → Lookthru tickers.
 */
export function fromBloomberg(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/_/g, " ").replace(/\s+/g, " ");
  if (!s) return "";
  if (isOptionTicker(s) || /\b(CALL|PUT)\s+OPTION\b/.test(s)) return "OPTIONS";
  if (/^(CAD|USD|EUR|GBP|JPY)(\s+CASH)?$/.test(s) || (/\bCASH\b/.test(s) && !/\b(US|CN|CT)\b/.test(s))) {
    return "CASH";
  }
  const body = s.replace(/\s+(EQUITY|CORP|INDEX|CURNCY|GOVT)$/i, "").trim();
  const pair = body.match(/^([A-Z0-9./-]+)\s+(US|UN|CN|CT|CA|LN|GY|FP|IM|JT|AU|HK)$/i);
  const root = (pair ? pair[1] : body.split(/\s+/)[0] ?? "").replace(/\//g, ".");
  const ex = (pair?.[2] ?? "").toUpperCase();
  if (!root || root === "CASH") return root === "CASH" ? "CASH" : "";
  if (ex === "CN" || ex === "CT" || ex === "CA") return applyAlias(`${root}.TO`);
  if (ex === "US" || ex === "UN") {
    if (US_DISAMBIGUATE.has(root)) return `${root}.US`;
    return applyAlias(root);
  }
  return applyAlias(root);
}

function classifySymbol(ticker: string, name: string): string {
  if (isOptionName(name) || isOptionTicker(ticker)) return "OPTIONS";
  if (isCashName(name)) return "CASH";
  if (!ticker) return "";
  const mapped = fromBloomberg(ticker);
  return mapped || applyAlias(ticker);
}

function toHolding(symbol: string, name: string, weight: number, sectorHint?: string): HoldingLine {
  const key = issuerKey(symbol);
  const sector =
    key === "CASH"
      ? "Cash"
      : key === "OPTIONS" || key === "OTHER"
        ? "Other"
        : nameLooksLikeFund(name)
          ? "Fund"
          : sectorOf(symbol) !== "Other"
            ? sectorOf(symbol)
            : (sectorHint || "Other");
  return {
    symbol: key === "CASH" || key === "OPTIONS" || key === "OTHER" ? key : symbol,
    name: name || symbol,
    weight,
    sector,
  };
}

function collapseSynthetics(rows: HoldingLine[]): HoldingLine[] {
  const byKey = new Map<string, HoldingLine>();
  let cash = 0;
  let cashName = "Cash & other";
  let opts = 0;
  for (const h of rows) {
    const key = issuerKey(h.symbol);
    if (key === "CASH") {
      cash += h.weight;
      if (h.name) cashName = h.name;
      continue;
    }
    if (key === "OPTIONS") {
      opts += h.weight;
      continue;
    }
    const existing = byKey.get(key);
    if (existing) {
      existing.weight += h.weight;
      continue;
    }
    byKey.set(key, { ...h });
  }
  const rest = [...byKey.values()];
  if (opts !== 0) rest.push(toHolding("OPTIONS", "Written call options", opts, "Other"));
  if (cash !== 0) rest.push(toHolding("CASH", cashName, cash, "Cash"));
  return rest.filter((h) => h.symbol && Number.isFinite(h.weight) && h.weight !== 0);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(splitCsvLine);
}

function headerIndex(headers: string[], ...names: string[]): number {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  for (const name of names) {
    const n = name.replace(/[^a-z0-9]+/g, "");
    const i = norm.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

export function parseEvolveCsv(text: string): ParsedHoldings {
  const rows = parseCsv(text);
  if (rows.length < 2) return { holdings: [] };
  const headers = rows[0] ?? [];
  const ti = headerIndex(headers, "ticker", "symbol");
  const wi = headerIndex(headers, "portfolio_mweight", "weight", "portfoliomweight");
  const ni = headerIndex(headers, "security_name", "name", "securityname");
  const si = headerIndex(headers, "gics_sector_name", "sector", "gicssectorname");
  if (ti < 0 || wi < 0) return { holdings: [] };
  const out: HoldingLine[] = [];
  for (const row of rows.slice(1)) {
    const ticker = (row[ti] ?? "").trim();
    const name = (row[ni] ?? "").trim();
    const weight = parseWeight(row[wi] ?? "");
    if (weight == null || !ticker) continue;
    const symbol = classifySymbol(ticker, name);
    if (!symbol) continue;
    out.push(toHolding(symbol, name || symbol, weight, row[si]));
  }
  return { holdings: collapseSynthetics(out), asOf: parseAsOf(text) };
}

function extractTable(html: string, idPattern: RegExp): { table: string; index: number } | null {
  const open = [...html.matchAll(/<table\b[^>]*>/gi)];
  for (const m of open) {
    const tag = m[0] ?? "";
    if (!idPattern.test(tag)) continue;
    const start = m.index ?? 0;
    const end = html.indexOf("</table>", start);
    if (end < 0) continue;
    return { table: html.slice(start, end + 8), index: start };
  }
  return null;
}

function tableRows(tableHtml: string): { headers: string[]; cells: string[][] } {
  const chunks = tableHtml.split(/<tr\b/i).slice(1);
  const rows: string[][] = [];
  for (const chunk of chunks) {
    const cells = [...chunk.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)(?:<\/t[dh]>|$)/gi)].map(
      (m) => m[1] ?? "",
    );
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return { headers: [], cells: [] };
  const headers = rows[0]!.map((c) => stripTags(c).toLowerCase());
  return { headers, cells: rows.slice(1) };
}

function tickerFromCell(html: string): string {
  const alt = html.match(/\balt=["']([^"']+)["']/i);
  if (alt?.[1]) return decodeEntities(alt[1]).trim();
  const href =
    html.match(/\/etf\/([a-z0-9-]+)/i) ??
    html.match(/\/high-income-shares\/([a-z0-9-]+)/i);
  if (href?.[1]) return href[1].toUpperCase();
  return stripTags(html);
}

function columnIndex(headers: string[], ...needles: string[]): number {
  for (const n of needles) {
    const i = headers.findIndex((h) => h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

function holdingsFromTable(
  headers: string[],
  cells: string[][],
  preferCellTicker = false,
): HoldingLine[] {
  const tickerCol = columnIndex(headers, "ticker", "symbol");
  const nameCol = columnIndex(headers, "etf name", "name", "holding", "security");
  const weightCol = columnIndex(headers, "weight", "wt", "%");
  const sectorCol = columnIndex(headers, "sector");
  if (weightCol < 0) return [];
  const out: HoldingLine[] = [];
  for (const row of cells) {
    const rawTickerHtml = tickerCol >= 0 ? (row[tickerCol] ?? "") : preferCellTicker ? (row[0] ?? "") : "";
    const ticker = tickerFromCell(rawTickerHtml);
    const name = stripTags(nameCol >= 0 ? (row[nameCol] ?? "") : tickerCol === 0 ? (row[1] ?? "") : (row[0] ?? ""));
    const weight = parseWeight(stripTags(row[weightCol] ?? ""));
    if (weight == null || weight === 0) continue;
    const symbol = classifySymbol(ticker, name);
    if (!symbol) continue;
    out.push(toHolding(symbol, name || symbol, weight, stripTags(row[sectorCol] ?? "")));
  }
  return collapseSynthetics(out);
}

export function parseHarvestHtml(html: string): ParsedHoldings {
  const found =
    extractTable(html, /id=["']tablepress-[^"']*holdings[^"']*["']/i) ??
    extractTable(html, /tablepress-id-[a-z0-9_]*holdings/i);
  if (!found) return { holdings: [] };
  const { headers, cells } = tableRows(found.table);
  const holdings = holdingsFromTable(headers, cells, true);
  const asOf =
    parseAsOf(html.slice(Math.max(0, found.index - 900), found.index + 80)) ?? parseAsOf(html);
  return { holdings, asOf };
}

export function parseHamiltonHtml(html: string): ParsedHoldings {
  const found = extractTable(html, /id=["']etf-holdings[^"']*["']/i);
  if (!found) return { holdings: [] };
  const { headers, cells } = tableRows(found.table);
  const holdings = holdingsFromTable(headers, cells, true);
  const asOf =
    parseAsOf(html.slice(Math.max(0, found.index - 600), found.index + 80)) ?? parseAsOf(html);
  return { holdings, asOf };
}

export function parsePurposeHoldings(
  rows: Array<{ name?: string; weight?: string | number; sector?: string; geo?: string }>,
  resolveName: (name: string, geo?: string) => string | null,
  asOf?: string,
): ParsedHoldings {
  const out: HoldingLine[] = [];
  let other = 0;
  for (const row of rows) {
    const name = (row.name ?? "").trim();
    const weight = parseWeight(row.weight ?? "");
    if (!name || weight == null || weight === 0) continue;
    if (isCashName(name)) {
      out.push(toHolding("CASH", name, weight, "Cash"));
      continue;
    }
    const symbol = resolveName(name, row.geo);
    if (!symbol) {
      other += weight;
      continue;
    }
    out.push(toHolding(symbol, name, weight, row.sector));
  }
  if (Math.abs(other) > 0.004) {
    out.push(toHolding("OTHER", "Other holdings", other, "Other"));
  }
  return { holdings: collapseSynthetics(out), asOf };
}
