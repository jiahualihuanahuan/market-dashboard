import { tickerFromCompanyName } from "./catalog";
import {
  holdingsAreUsable,
  parseEvolveCsv,
  parseHamiltonHtml,
  parseHarvestHtml,
  parsePurposeHoldings,
  type ParsedHoldings,
} from "./holdings-parse";
import { issuerKey, stripShareClass } from "./tickers";
import type { HoldingLine } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_MS = 8000;

const HARVEST = new Set([
  "HHL",
  "HTA",
  "HBF",
  "HDIF",
  "HRIF",
  "HUTL",
  "HUBL",
  "HIND",
  "TRVI",
  "HLIF",
  "HHIH",
  "HHIS",
  "HPYG",
  "HHLE",
  "HTAE",
  "HBFE",
  "HUTE",
  "HVOL",
  "HVOI",
  "HPF",
  "HGR",
  "HGGG",
  "HBIG",
  "TBIL",
  "HBIX",
  "HBTE",
  "MSTE",
  "MSTY",
  "NVHE",
  "NVDH",
  "APLE",
  "MSHE",
  "LLHE",
  "AMHE",
  "GOGY",
  "PLTE",
  "AVGY",
  "CRWY",
  "AMDY",
  "TSLY",
  "COSY",
  "METE",
  "HODY",
  "SOFY",
  "SPXE",
  "RDDY",
  "CNYE",
  "CRCY",
  "NFLY",
  "LLYH",
  "AMZH",
  "MSFH",
  "CONY",
  "HHIC",
  "SHPE",
  "RYHE",
  "TDHE",
  "ENBE",
  "CNQE",
  "AEME",
  "CCOE",
  "SUHE",
]);

const HAMILTON = new Set([
  "QDAY",
  "SDAY",
  "CDAY",
  "BDAY",
  "HYLD",
  "SMAX",
  "QMAX",
  "QMVP",
  "FMAX",
  "LMAX",
  "AMAX",
  "EMAX",
  "RMAX",
  "SMVP",
  "HMAX",
  "HDIV",
  "HFIN",
  "UMAX",
  "HUTS",
  "HFN",
  "UMVP",
  "CMVP",
  "CMAX",
  "IMAX",
]);

const EVOLVE = new Set([
  "LIFE",
  "BANK",
  "CALL",
  "UTES",
  "BASE",
  "TECH",
  "QQQY",
  "ESPX",
  "ETSX",
  "SIXY",
  "HERD",
  "CYBR",
  "BOND",
  "CARS",
  "ETC",
  "ETHR",
  "BTCY",
  "MESH",
  "DATA",
  "WILD",
  "BIGY",
  "SIXY",
  "CANY",
  "INTY",
  "EASY",
  "TECY",
  "OILY",
]);

const PURPOSE = new Set(["PDF", "PYF", "PAYF", "PDIV", "PID", "REM", "PSA", "BTCC", "KILO"]);

export type IssuerName = "harvest" | "hamilton" | "evolve" | "purpose";

export type IssuerHoldings = {
  holdings: HoldingLine[];
  asOf?: string;
  issuer: IssuerName;
};

type CacheEntry = { at: number; value: IssuerHoldings | null };
const cache = new Map<string, CacheEntry>();

let purposeIndex: Map<string, string> | null = null;
let purposeIndexAt = 0;

export function issuerFamily(symbol: string): IssuerName | null {
  const base = stripShareClass(symbol);
  if (HARVEST.has(base)) return "harvest";
  if (HAMILTON.has(base)) return "hamilton";
  if (EVOLVE.has(base)) return "evolve";
  if (PURPOSE.has(base)) return "purpose";
  return null;
}

export function isIssuerFundTicker(symbol: string): boolean {
  return issuerFamily(symbol) !== null;
}

function isCanadianListed(symbol: string, currency?: string): boolean {
  if (/\.(TO|NE|V|CN)$/i.test(symbol)) return true;
  if (currency === "CAD") return true;
  return false;
}

async function fetchText(url: string, accept = "*/*"): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: accept,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function usable(parsed: ParsedHoldings | null, issuer: IssuerName): IssuerHoldings | null {
  if (!parsed || !holdingsAreUsable(parsed.holdings)) return null;
  return { holdings: parsed.holdings, asOf: parsed.asOf, issuer };
}

async function fetchHarvest(base: string): Promise<IssuerHoldings | null> {
  const slug = base.toLowerCase();
  const urls = [
    `https://harvestportfolios.com/etf/${slug}/`,
    `https://harvestportfolios.com/high-income-shares/${slug}/`,
  ];
  for (const url of urls) {
    const html = await fetchText(url, "text/html,*/*");
    if (!html) continue;
    const parsed = parseHarvestHtml(html);
    const hit = usable(parsed, "harvest");
    if (hit) return hit;
  }
  return null;
}

async function fetchHamilton(base: string): Promise<IssuerHoldings | null> {
  const html = await fetchText(`https://hamiltonetfs.com/etf/${base.toLowerCase()}/`, "text/html,*/*");
  if (!html) return null;
  return usable(parseHamiltonHtml(html), "hamilton");
}

async function fetchEvolve(base: string): Promise<IssuerHoldings | null> {
  const csv = await fetchText(
    `https://evolveetfs.com/wp-content/uploads/holdings/${base.toUpperCase()}.csv`,
    "text/csv,text/plain,*/*",
  );
  if (!csv || csv.startsWith("<") || !csv.includes("TICKER")) return null;
  return usable(parseEvolveCsv(csv), "evolve");
}

type PurposeFundRow = {
  name?: string;
  weight?: string | number;
  sector?: string;
  geo?: string;
};

async function ensurePurposeIndex(): Promise<Map<string, string>> {
  if (purposeIndex && Date.now() - purposeIndexAt < TTL_MS) return purposeIndex;
  const text = await fetchText("https://www.purposeinvest.com/api/funds", "application/json,*/*");
  const map = new Map<string, string>();
  if (text) {
    try {
      const json = JSON.parse(text) as {
        funds?: Array<{ urlName?: string; code?: string; etf_code?: string; tickers?: string[] }>;
      };
      for (const fund of json.funds ?? []) {
        const url = fund.urlName;
        if (!url) continue;
        const tickers = [
          fund.code,
          fund.etf_code,
          ...(fund.tickers ?? []),
        ].filter(Boolean) as string[];
        for (const t of tickers) {
          const key = stripShareClass(t);
          if (key && !/^\d+$/.test(key) && key.length <= 6) map.set(key, url);
        }
      }
    } catch {
      /* keep empty map */
    }
  }
  purposeIndex = map;
  purposeIndexAt = Date.now();
  return map;
}

async function searchYahooName(name: string, geo?: string): Promise<string | null> {
  const query = /canada/i.test(geo ?? "") ? `${name} TSX` : name;
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0`;
    const text = await fetchText(url, "application/json,*/*");
    if (!text) return null;
    const json = JSON.parse(text) as {
      quotes?: Array<{ symbol?: string; quoteType?: string; exchDisp?: string; shortname?: string }>;
    };
    const quotes = (json.quotes ?? []).filter((q) => {
      const t = (q.quoteType ?? "").toUpperCase();
      return t === "EQUITY" || t === "ETF";
    });
    if (!quotes.length) return null;
    const canada = /canada/i.test(geo ?? "");
    const preferred = canada
      ? quotes.find((q) => /\.(TO|NE|V)$/i.test(q.symbol ?? ""))
      : quotes.find((q) => q.symbol && !/\.(TO|NE|V)$/i.test(q.symbol));
    const symbol = preferred?.symbol ?? quotes[0]?.symbol;
    return symbol ?? null;
  } catch {
    return null;
  }
}

async function fetchPurpose(urlName: string): Promise<IssuerHoldings | null> {
  const text = await fetchText(
    `https://www.purposeinvest.com/api/funds/${encodeURIComponent(urlName)}`,
    "application/json,*/*",
  );
  if (!text) return null;
  try {
    const json = JSON.parse(text) as {
      portfolio?: { dt?: string; Level4?: { holdings?: PurposeFundRow[] } };
      updated?: string;
    };
    const rows = json.portfolio?.Level4?.holdings ?? [];
    if (!rows.length) return null;

    const known = new Map<string, string>();
    const pending: PurposeFundRow[] = [];
    for (const row of rows) {
      const name = row.name ?? "";
      const hit = tickerFromCompanyName(name, row.geo);
      if (hit) known.set(name, hit);
      else pending.push(row);
    }
    for (const row of pending.slice(0, 12)) {
      const found = await searchYahooName(row.name ?? "", row.geo);
      if (found && row.name) known.set(row.name, found);
    }

    const parsed = parsePurposeHoldings(
      rows,
      (name, geo) => known.get(name) ?? tickerFromCompanyName(name, geo),
      json.portfolio?.dt ?? json.updated,
    );
    return usable(parsed, "purpose");
  } catch {
    return null;
  }
}

function score(hit: IssuerHoldings): number {
  const coverage = hit.holdings.reduce((s, h) => s + Math.max(h.weight, 0), 0);
  return hit.holdings.length + coverage;
}

async function probeCanadian(symbol: string): Promise<IssuerHoldings | null> {
  const base = stripShareClass(symbol);
  const index = await ensurePurposeIndex();
  const purposeUrl = index.get(base);
  const tasks: Promise<IssuerHoldings | null>[] = [
    fetchHarvest(base),
    fetchHamilton(base),
    fetchEvolve(base),
  ];
  if (purposeUrl) tasks.push(fetchPurpose(purposeUrl));
  const settled = await Promise.allSettled(tasks);
  const hits: IssuerHoldings[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) hits.push(r.value);
  }
  hits.sort((a, b) => score(b) - score(a));
  return hits[0] ?? null;
}

export async function fetchIssuerHoldings(
  symbol: string,
  currency?: string,
): Promise<IssuerHoldings | null> {
  const key = stripShareClass(symbol);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const family = issuerFamily(symbol);
  let value: IssuerHoldings | null = null;
  try {
    if (family === "harvest") value = await fetchHarvest(key);
    else if (family === "hamilton") value = await fetchHamilton(key);
    else if (family === "evolve") value = await fetchEvolve(key);
    else if (family === "purpose") {
      const index = await ensurePurposeIndex();
      const url = index.get(key) ?? index.get(issuerKey(symbol));
      if (url) value = await fetchPurpose(url);
    } else if (isCanadianListed(symbol, currency)) {
      value = await probeCanadian(symbol);
    }
  } catch {
    value = null;
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}
