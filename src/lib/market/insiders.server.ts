import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

const SEC_UA = "MarketDesk research research@marketdesk.app";
const WEB_UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";
const POLITICIAN_URL = "https://huggingface.co/datasets/austin-starks/congressional-stock-trades/resolve/main/data/political_trades/2026-00000-of-00001.parquet";
const FORM_CAP = 240;
const DAY = 86400000;

export type InsiderPrint = {
  person: string;
  role: string;
  symbol: string;
  name: string;
  side: "buy" | "sell";
  value: number;
  high: number | null;
  shares: number | null;
  traded: string;
  filed: string;
  url: string;
};

export type InsiderName = {
  symbol: string;
  name: string;
  value: number;
  high: number | null;
  trades: number;
  people: string[];
  peopleCount: number;
};

export type InsiderSide = {
  buys: InsiderName[];
  sells: InsiderName[];
  prints: InsiderPrint[];
};

export type InsiderPin = {
  id: string;
  name: string;
  office: string;
  note: string;
  count: number;
  prints: InsiderPrint[];
  error: string | null;
};

export type InsiderBook = {
  executives: InsiderSide;
  politicians: InsiderSide;
  pins: InsiderPin[];
  executiveWindow: string;
  politicianWindow: string;
  executiveCount: number;
  politicianCount: number;
  note: string;
  error: string | null;
};

let cache: { at: number; data: InsiderBook } | null = null;

export async function loadInsiders(fresh = false): Promise<InsiderBook> {
  if (!fresh && cache && Date.now() - cache.at < 30 * 60 * 1000) return cache.data;
  const [executives, politicians, pins] = await Promise.all([
    loadExecutives().catch((error: unknown) => ({ side: emptySide(), count: 0, window: "", error: message(error) })),
    loadPoliticians().catch((error: unknown) => ({ side: emptySide(), count: 0, window: "", error: message(error) })),
    loadPins(),
  ]);
  const problems = [executives.error, politicians.error, ...pins.map((pin) => pin.error)].filter(Boolean);
  const data: InsiderBook = {
    executives: executives.side,
    politicians: politicians.side,
    pins,
    executiveWindow: executives.window,
    politicianWindow: politicians.window,
    executiveCount: executives.count,
    politicianCount: politicians.count,
    note: "An executive Form 4 is the SEC notice when an officer, director, or large owner buys or sells their own company’s stock. A politician line is a STOCK Act disclosure. Members report a dollar range, not a fill, and the notice can arrive as late as 45 days after the trade. Neither one is a forecast.",
    error: problems.length ? problems.join(" ") : null,
  };
  if (data.executiveCount || data.politicianCount) cache = { at: Date.now(), data };
  return data;
}

async function loadExecutives(): Promise<{ side: InsiderSide; count: number; window: string; error: string | null }> {
  const end = new Date();
  const start = new Date(Date.now() - 14 * DAY);
  const hits = await searchForms(start, end);
  const prints: InsiderPrint[] = [];
  await mapPool(hits, 4, async (hit) => {
    try {
      const xml = await fetchText(hit.xml, SEC_UA, 12000);
      prints.push(...readForm(xml, hit));
    } catch {
      /* one filing can fail without dropping the rest */
    }
  });
  const window = `${iso(start)} to ${iso(end)}`;
  return {
    side: rank(prints),
    count: prints.length,
    window,
    error: hits.length ? null : "The SEC Form 4 search did not return filings.",
  };
}

async function loadPoliticians(): Promise<{ side: InsiderSide; count: number; window: string; error: string | null }> {
  const response = await fetch(POLITICIAN_URL, { headers: { "user-agent": WEB_UA }, signal: AbortSignal.timeout(25000), redirect: "follow" });
  if (!response.ok) throw new Error(`Politician disclosures returned ${response.status}.`);
  const buffer = await response.arrayBuffer();
  const rows = await parquetReadObjects({
    file: { byteLength: buffer.byteLength, slice: (start, end) => buffer.slice(start, end ?? buffer.byteLength) },
    compressors,
    columns: ["action", "transactionDate", "filingDate", "resolvedTicker", "printedTicker", "assetDescription", "amountLow", "amountHigh", "amountBracket", "displayName", "chamber", "owner", "sourceUrl", "resolutionStatus"],
  });
  const cutoff = iso(new Date(Date.now() - 90 * DAY));
  const prints: InsiderPrint[] = [];
  let newest = "";
  for (const row of rows) {
    const traded = dayText(row.transactionDate);
    if (traded > newest) newest = traded;
    if (!traded || traded < cutoff) continue;
    if (row.resolutionStatus && row.resolutionStatus !== "resolved") continue;
    const side = sideOf(String(row.action ?? ""));
    const symbol = ticker(row.resolvedTicker) || ticker(row.printedTicker);
    const low = num(row.amountLow);
    if (!side || !symbol || low == null) continue;
    const high = num(row.amountHigh);
    prints.push({
      person: String(row.displayName || "Unnamed member"),
      role: [titleCase(String(row.chamber || "")), titleCase(String(row.owner || ""))].filter(Boolean).join(" · "),
      symbol,
      name: cleanName(String(row.assetDescription || symbol)),
      side,
      value: low,
      high,
      shares: null,
      traded,
      filed: dayText(row.filingDate),
      url: String(row.sourceUrl || "https://disclosures-clerk.house.gov/"),
    });
  }
  const window = newest ? `${cutoff} to ${newest}` : cutoff;
  return { side: rank(prints), count: prints.length, window, error: null };
}

const PINNED = [
  {
    id: "house_nancy_pelosi",
    name: "Nancy Pelosi",
    office: "House",
    note: "A House disclosure. Spouse means the trade was made by her husband. She still has to report it. Amounts are ranges, not an exact fill.",
  },
  {
    id: "oge_donald_trump",
    name: "Donald J. Trump",
    office: "President",
    note: "Periodic transaction reports filed with the Office of Government Ethics. Amounts are ranges. These are the latest stock trades, not the whole filing.",
  },
  {
    id: "oge_jd_vance",
    name: "JD Vance",
    office: "Vice president",
    note: "The public executive-branch trade file this desk reads has no stock trades under the vice president’s name.",
  },
] as const;

async function loadPins(): Promise<InsiderPin[]> {
  return Promise.all(PINNED.map((pin) => loadPin(pin)));
}

async function loadPin(pin: (typeof PINNED)[number]): Promise<InsiderPin> {
  const empty: InsiderPin = { ...pin, count: 0, prints: [], error: null };
  try {
    const response = await fetch(`https://raw.githubusercontent.com/kadoa-org/congress-trading-monitor/main/public/data/filer/${pin.id}.json`, {
      headers: { "user-agent": WEB_UA },
      signal: AbortSignal.timeout(25000),
    });
    if (response.status === 404) return empty;
    if (!response.ok) return { ...empty, error: `${pin.name} returned ${response.status}.` };
    const json = (await response.json()) as { trades?: Record<string, unknown>[] };
    const cutoff = iso(new Date(Date.now() - 90 * DAY));
    const prints = (json.trades ?? [])
      .map(readPinTrade)
      .filter((print): print is InsiderPrint => print != null && print.traded >= cutoff)
      .sort((a, b) => b.traded.localeCompare(a.traded) || b.value - a.value);
    return { ...empty, count: prints.length, prints: prints.slice(0, 8) };
  } catch (error) {
    return { ...empty, error: message(error) };
  }
}

function readPinTrade(row: Record<string, unknown>): InsiderPrint | null {
  const side = pinSide(String(row.transaction_type ?? ""));
  const symbol = ticker(row.ticker);
  const low = num(row.amount_range_low);
  if (!side || !symbol || low == null) return null;
  return {
    person: "",
    role: ownerRole(row.owner),
    symbol,
    name: cleanName(String(row.asset_name || symbol)),
    side,
    value: low,
    high: num(row.amount_range_high),
    shares: null,
    traded: dayText(row.transaction_date),
    filed: dayText(row.filing_date),
    url: String(row.doc_url || ""),
  };
}

function pinSide(value: string): "buy" | "sell" | null {
  if (/^purchase/i.test(value)) return "buy";
  if (/^sale/i.test(value)) return "sell";
  return null;
}

function ownerRole(value: unknown): string {
  const code = String(value ?? "").toUpperCase();
  if (code === "SP") return "Spouse";
  if (code === "JT") return "Joint";
  if (code === "DC") return "Dependent child";
  return "";
}

function rank(prints: InsiderPrint[]): InsiderSide {
  const names = new Map<string, { symbol: string; name: string; value: number; high: number; trades: number; people: Set<string>; open: boolean }>();
  for (const print of prints) {
    const key = `${print.side}|${print.symbol}`;
    const row = names.get(key) ?? { symbol: print.symbol, name: print.name, value: 0, high: 0, trades: 0, people: new Set<string>(), open: false };
    row.value += print.value;
    row.trades += 1;
    row.people.add(print.person);
    if (print.high == null) row.open = true;
    else row.high += print.high;
    if (print.name.length < row.name.length) row.name = print.name;
    names.set(key, row);
  }
  const list = (side: "buy" | "sell"): InsiderName[] => [...names.entries()]
    .filter(([key]) => key.startsWith(`${side}|`))
    .map(([, row]) => ({
      symbol: row.symbol,
      name: row.name,
      value: Math.round(row.value),
      high: row.open ? null : Math.round(row.high),
      trades: row.trades,
      people: [...row.people].slice(0, 3),
      peopleCount: row.people.size,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  const biggest = (side: "buy" | "sell") => prints.filter((print) => print.side === side).sort((a, b) => b.value - a.value).slice(0, 8);
  return { buys: list("buy"), sells: list("sell"), prints: [...biggest("buy"), ...biggest("sell")] };
}

function emptySide(): InsiderSide {
  return { buys: [], sells: [], prints: [] };
}

type FormHit = { xml: string; url: string; filed: string };

async function searchForms(start: Date, end: Date): Promise<FormHit[]> {
  const hits: FormHit[] = [];
  for (let from = 0; from < FORM_CAP; from += 80) {
    const url = `https://efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom&startdt=${iso(start)}&enddt=${iso(end)}&from=${from}&size=80`;
    const json = await fetchJson(url);
    const rows = (json?.hits?.hits ?? []) as { _id?: string; _source?: { ciks?: string[]; file_date?: string } }[];
    if (!rows.length) break;
    for (const row of rows) {
      const [adsh, file] = String(row._id ?? "").split(":");
      const cik = String(Number(row._source?.ciks?.[0] || "0"));
      if (!adsh || !file || cik === "0" || !file.endsWith(".xml")) continue;
      const folder = adsh.replace(/-/g, "");
      hits.push({
        filed: String(row._source?.file_date ?? ""),
        xml: `https://www.sec.gov/Archives/edgar/data/${cik}/${folder}/${file}`,
        url: `https://www.sec.gov/Archives/edgar/data/${cik}/${folder}/${adsh}-index.html`,
      });
      if (hits.length >= FORM_CAP) return hits;
    }
    if (rows.length < 80) break;
  }
  return hits;
}

function readForm(xml: string, hit: FormHit): InsiderPrint[] {
  const symbol = ticker(tag(xml, "issuerTradingSymbol"));
  const name = cleanName(tag(xml, "issuerName"));
  const person = tag(xml, "rptOwnerName");
  const role = officerRole(xml);
  if (!symbol || !person) return [];
  const out: InsiderPrint[] = [];
  for (const block of chunks(xml, "nonDerivativeTransaction")) {
    const code = tag(block, "transactionCode");
    const side = code === "P" ? "buy" : code === "S" ? "sell" : null;
    const shares = num(tag(block, "transactionShares"));
    const price = num(nested(block, "transactionPricePerShare"));
    if (!side || shares == null || price == null || price <= 0 || shares <= 0) continue;
    out.push({
      person: titlePerson(person),
      role,
      symbol,
      name: name || symbol,
      side,
      value: Math.round(shares * price),
      high: null,
      shares: Math.round(shares),
      traded: tag(block, "transactionDate") || "",
      filed: hit.filed,
      url: hit.url,
    });
  }
  return out;
}

function officerRole(xml: string): string {
  const title = tag(xml, "officerTitle");
  if (title) return title;
  if (/<isDirector>\s*true\s*<\/isDirector>/i.test(xml) || /<isDirector>\s*1\s*<\/isDirector>/i.test(xml)) return "Director";
  if (/<isTenPercentOwner>\s*(true|1)\s*<\/isTenPercentOwner>/i.test(xml)) return "Large owner";
  return "Insider";
}

function chunks(xml: string, tagName: string): string[] {
  const matches = xml.match(new RegExp(`<${tagName}\\b[\\s\\S]*?</${tagName}>`, "gi"));
  return matches ?? [];
}

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}\\b[^>]*>\\s*(?:<value>)?([^<]+)`, "i"));
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function nested(xml: string, name: string): string {
  const block = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  const value = block?.[1]?.match(/<value>([^<]+)/i);
  return value?.[1]?.trim() ?? "";
}

function sideOf(action: string): "buy" | "sell" | null {
  const text = action.toLowerCase();
  if (text.startsWith("purchase") || text === "buy" || text === "p") return "buy";
  if (text.startsWith("sale") || text.startsWith("sell") || text === "s") return "sell";
  return null;
}

function ticker(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(text)) return "";
  if (text === "NONE" || text === "N/A") return "";
  return text;
}

function cleanName(value: string): string {
  return value
    .replace(/\s*\/[A-Z]{2,}\/\s*$/i, "")
    .replace(/\s+(CMN|COMMON STOCK|COM|SHS)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titlePerson(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/\b\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function titleCase(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function dayText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "bigint") return dayText(Number(value));
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 10000 && value < 200000) return new Date(value * DAY).toISOString().slice(0, 10);
    if (value > 1e11) return new Date(value).toISOString().slice(0, 10);
  }
  const text = String(value ?? "");
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? "";
}

function num(value: unknown): number | null {
  if (typeof value === "bigint") return Number(value);
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "That feed did not load.";
}

async function fetchJson(url: string): Promise<any> {
  const text = await fetchText(url, SEC_UA, 15000);
  return JSON.parse(text);
}

async function fetchText(url: string, ua: string, ms: number): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": ua, accept: "*/*" }, signal: AbortSignal.timeout(ms) });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.text();
}

async function mapPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index]);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
}
