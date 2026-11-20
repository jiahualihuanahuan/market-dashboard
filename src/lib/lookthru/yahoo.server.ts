import { BOOK_MARKS, catalogInstrument, isSynthetic, sectorOf, syntheticInstrument } from "./catalog";
import { holdingsAreUsable, nameLooksLikeFund } from "./holdings-parse";
import { fetchIssuerHoldings, isIssuerFundTicker } from "./issuers.server";
import { applyAlias, candidateSymbols, displaySymbol, issuerKey, normalizeTicker, stripShareClass } from "./tickers";
import type { AssetKind, DataSource, HoldingLine, Instrument } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const QUOTE_TTL_MS = 5 * 60 * 1000;
const HOLDINGS_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_INSTRUMENTS = 220;
const CONCURRENCY = 6;

type Quote = {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  changePct: number | null;
  kind: AssetKind;
};

type CacheEntry<T> = { at: number; value: T };

const quoteCache = new Map<string, CacheEntry<Quote | null>>();
const holdingsCache = new Map<string, CacheEntry<HoldingLine[] | null>>();

let crumb: string | null = null;
let cookieHeader = "";
let crumbAt = 0;

function cookiesFrom(res: Response, current: string): string {
  const getSet = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const raw = typeof getSet === "function" ? getSet.call(res.headers) : [];
  const incoming = raw.length
    ? raw
    : (() => {
        const single = res.headers.get("set-cookie");
        return single ? [single] : [];
      })();
  const map = new Map<string, string>();
  for (const part of current.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k) map.set(k, rest.join("="));
  }
  for (const line of incoming) {
    const pair = line.split(";")[0];
    if (!pair) continue;
    const [k, ...rest] = pair.split("=");
    if (k) map.set(k.trim(), rest.join("="));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function yahooFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": UA,
      Accept: "application/json,text/plain,*/*",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function ensureCrumb(): Promise<string | null> {
  if (crumb && Date.now() - crumbAt < 10 * 60 * 1000) return crumb;
  try {
    const fc = await yahooFetch("https://fc.yahoo.com", { redirect: "manual" });
    cookieHeader = cookiesFrom(fc, cookieHeader);
    const res = await yahooFetch("https://query1.finance.yahoo.com/v1/test/getcrumb");
    cookieHeader = cookiesFrom(res, cookieHeader);
    const text = (await res.text()).trim();
    if (!text || /too many|unauthorized|invalid/i.test(text)) {
      crumb = null;
      return null;
    }
    crumb = text.replace(/^"|"$/g, "");
    crumbAt = Date.now();
    return crumb;
  } catch {
    crumb = null;
    return null;
  }
}

function rawNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in v) {
    const raw = (v as { raw: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

let forceQuotes = false;

async function fetchQuote(symbol: string): Promise<Quote | null> {
  if (!forceQuotes) {
    const cached = quoteCache.get(symbol);
    if (cached && Date.now() - cached.at < QUOTE_TTL_MS) return cached.value;
  }
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await yahooFetch(url);
    if (!res.ok) {
      quoteCache.set(symbol, { at: Date.now(), value: null });
      return null;
    }
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: Record<string, unknown> }> };
    };
    const meta = json.chart?.result?.[0]?.meta;
    const price = rawNumber(meta?.regularMarketPrice);
    if (!meta || price == null) {
      quoteCache.set(symbol, { at: Date.now(), value: null });
      return null;
    }
    const type = String(meta.instrumentType ?? meta.quoteType ?? "").toUpperCase();
    const kind: AssetKind =
      type.includes("ETF") || type.includes("FUND") || type.includes("MUTUAL")
        ? "etf"
        : "equity";
    const quote: Quote = {
      symbol: String(meta.symbol ?? symbol),
      name: String(meta.longName ?? meta.shortName ?? symbol),
      price,
      currency: String(meta.currency ?? "USD"),
      changePct: rawNumber(meta.regularMarketChangePercent),
      kind,
    };
    quoteCache.set(symbol, { at: Date.now(), value: quote });
    quoteCache.set(quote.symbol, { at: Date.now(), value: quote });
    return quote;
  } catch {
    quoteCache.set(symbol, { at: Date.now(), value: null });
    return null;
  }
}

async function fetchYahooHoldings(symbol: string): Promise<HoldingLine[] | null> {
  const cached = holdingsCache.get(symbol);
  if (cached && Date.now() - cached.at < HOLDINGS_TTL_MS) return cached.value;
  const c = await ensureCrumb();
  if (!c) {
    holdingsCache.set(symbol, { at: Date.now(), value: null });
    return null;
  }
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=topHoldings,fundProfile,quoteType&corsDomain=finance.yahoo.com&crumb=${encodeURIComponent(c)}`;
    const res = await yahooFetch(url);
    if (!res.ok) {
      holdingsCache.set(symbol, { at: Date.now(), value: null });
      return null;
    }
    const json = (await res.json()) as {
      quoteSummary?: {
        result?: Array<{
          topHoldings?: {
            holdings?: Array<{
              symbol?: string;
              holdingName?: string;
              holdingPercent?: { raw?: number };
            }>;
            sectorWeightings?: Array<Record<string, { raw?: number }>>;
          };
        }>;
      };
    };
    const holdings = json.quoteSummary?.result?.[0]?.topHoldings?.holdings ?? [];
    if (!holdings.length) {
      holdingsCache.set(symbol, { at: Date.now(), value: null });
      return null;
    }
    const mapped: HoldingLine[] = holdings.map((h) => {
      const name = h.holdingName ?? "";
      const weight = h.holdingPercent?.raw ?? 0;
      const sym = inferredHoldingSymbol(h.symbol ?? "", name);
      return {
        symbol: sym,
        name: name || sym,
        weight,
        sector: /\betf\b/i.test(name) ? "Fund" : sectorOf(sym),
      };
    });
    const cleaned = cleanYahooHoldings(mapped);
    holdingsCache.set(symbol, { at: Date.now(), value: cleaned });
    return cleaned;
  } catch {
    holdingsCache.set(symbol, { at: Date.now(), value: null });
    return null;
  }
}

async function searchSymbol(query: string): Promise<string | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`;
    const res = await yahooFetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      quotes?: Array<{ symbol?: string; quoteType?: string }>;
    };
    const quotes = json.quotes ?? [];
    const exact = quotes.find(
      (q) => normalizeTicker(q.symbol ?? "") === normalizeTicker(query),
    );
    return exact?.symbol ?? quotes[0]?.symbol ?? null;
  } catch {
    return null;
  }
}

async function resolveQuote(ticker: string): Promise<Quote | null> {
  for (const cand of candidateSymbols(ticker)) {
    const q = await fetchQuote(cand);
    if (q) return q;
  }
  const found = await searchSymbol(ticker);
  if (found) return fetchQuote(found);
  return null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function bookMark(symbol: string): { price: number; currency: string } | undefined {
  const a = applyAlias(symbol);
  return BOOK_MARKS[a] ?? BOOK_MARKS[symbol] ?? BOOK_MARKS[issuerKey(a)];
}

function holdingLooksLikeFund(h: HoldingLine): boolean {
  if (h.sector === "Fund") return true;
  if (nameLooksLikeFund(h.name)) return true;
  if (isIssuerFundTicker(h.symbol)) return true;
  const cat = catalogInstrument(h.symbol);
  return Boolean(cat?.holdings?.length || cat?.kind === "etf");
}

function looksLikeFundInstrument(quote: Quote, catalog?: Instrument): boolean {
  if (quote.kind === "etf") return true;
  if (catalog?.kind === "etf" || (catalog?.holdings && catalog.holdings.length > 0)) return true;
  if (nameLooksLikeFund(quote.name)) return true;
  if (isIssuerFundTicker(quote.symbol)) return true;
  return false;
}

/** Covered-call wrappers often report CAD/USD cash at ~80% instead of the stocks. */
const CURRENCY_NAME =
  /^(canadian dollar|u\.?\s*s\.?\s*dollar|united states dollar|usd cash|cad cash|currency)$/i;

const HOLDING_NAME_TICKERS: Record<string, string> = {
  "harvest tech leaders income etf": "HTA.TO",
  "harvest tech achievers growth & income etf": "HTA.TO",
  "harvest us equity leaders income etf": "HBF.TO",
  "harvest brand leaders plus income etf": "HBF.TO",
  "harvest brand leaders income etf": "HBF.TO",
  "harvest healthcare leaders income etf": "HHL.TO",
  "harvest canadian dividend leaders income etf": "HLIF.TO",
  "harvest canadian equity income leaders etf": "HLIF.TO",
  "harvest high income equity shares etf": "HHIH.TO",
  "harvest utilities leaders income etf": "HUTL.TO",
  "harvest equal weight global utilities income etf": "HUTL.TO",
  "harvest travel & leisure income etf": "TRVI.TO",
  "harvest us bank leaders income etf": "HUBL.TO",
  "harvest industrial leaders income etf": "HIND.TO",
  "harvest premium yield gold etf": "HPYG.TO",
  "harvest low volatility canadian equity etf": "HVOL.TO",
  "harvest low volatility canadian equity income etf": "HVOL.TO",
  "harvest energy leaders income etf": "HPF.TO",
  "harvest reit leaders income etf": "HGR.TO",
  "harvest global gold giants index etf": "HGGG.TO",
  "harvest apple enhanced high income shares etf": "APLE.TO",
  "harvest microsoft enhanced high income shares etf": "MSHE.TO",
  "harvest nvidia enhanced high income shares etf": "NVHE.TO",
  "harvest eli lilly enhanced high income shares etf": "LLHE.TO",
  "harvest amazon enhanced high income shares etf": "AMHE.TO",
  "harvest alphabet enhanced high income shares etf": "GOGY.TO",
  "harvest palantir enhanced high income shares etf": "PLTE.TO",
  "harvest broadcom enhanced high income shares etf": "AVGY.TO",
  "harvest crowdstrike enhanced high income shares etf": "CRWY.TO",
  "harvest amd enhanced high income shares etf": "AMDY.TO",
  "harvest tesla enhanced high income shares etf": "TSLY.TO",
  "harvest costco enhanced high income shares etf": "COSY.TO",
  "harvest meta enhanced high income shares etf": "METE.TO",
  "harvest robinhood enhanced high income shares etf": "HODY.TO",
  "harvest sofi enhanced high income shares etf": "SOFY.TO",
  "harvest spacex enhanced high income shares etf": "SPXE.TO",
  "harvest reddit enhanced high income shares etf": "RDDY.TO",
  "harvest coinbase enhanced high income shares etf": "CNYE.TO",
  "harvest circle enhanced high income shares etf": "CRCY.TO",
  "harvest strategy inc. enhanced high income shares etf": "MSTE.TO",
  "harvest canadian high income shares etf": "HHIC.TO",
};

function inferredHoldingSymbol(symbol: string, name: string): string {
  const sym = normalizeTicker(symbol);
  if (sym && !/^(N\/A|NULL|-)$/i.test(sym) && !CURRENCY_NAME.test(sym)) {
    return applyAlias(sym);
  }
  const cleaned = name
    .toLowerCase()
    .replace(/\s+\d+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  const mapped = HOLDING_NAME_TICKERS[cleaned];
  return mapped ? applyAlias(mapped) : "";
}

function isCurrencyNoise(symbol: string, name: string): boolean {
  const n = name.toLowerCase().trim();
  const s = symbol.replace(/=X$/i, "");
  if (CURRENCY_NAME.test(n)) return true;
  if (/^(cad|usd|cce|gbx|eur)$/i.test(s) && /dollar|currency|cash|cce/i.test(n || s)) return true;
  return false;
}

function cleanYahooHoldings(raw: HoldingLine[]): HoldingLine[] | null {
  const usable = raw.filter((h) => !isCurrencyNoise(h.symbol, h.name) && h.symbol && Math.abs(h.weight) > 0);
  const coverage = usable.reduce((s, h) => s + Math.max(h.weight, 0), 0);
  if (usable.length < 3 || coverage < 0.2) return null;
  return usable;
}

function mergeInstrument(
  quote: Quote,
  catalog?: Instrument,
  yahooHoldings?: HoldingLine[] | null,
  issuer?: { holdings: HoldingLine[]; asOf?: string } | null,
): Instrument {
  const issuerHoldings = issuer && holdingsAreUsable(issuer.holdings) ? issuer.holdings : null;
  const yahoo = yahooHoldings && holdingsAreUsable(yahooHoldings) ? yahooHoldings : null;
  const catHoldings = catalog?.holdings && catalog.holdings.length ? catalog.holdings : null;
  const holdings = issuerHoldings ?? yahoo ?? catHoldings ?? null;
  const kind: AssetKind = catalog?.kind ?? (holdings && holdings.length ? "etf" : quote.kind);
  const coverage = holdings?.reduce((s, h) => s + Math.max(h.weight, 0), 0) ?? catalog?.coverage ?? 0;
  const source: DataSource =
    holdings && issuerHoldings && holdings === issuerHoldings
      ? "issuer"
      : holdings && yahoo && holdings === yahoo
        ? catalog
          ? "mixed"
          : "yahoo"
        : catalog
          ? "catalog"
          : "yahoo";
  return {
    symbol: quote.symbol,
    displaySymbol: displaySymbol(quote.symbol),
    name: catalog?.name ?? quote.name,
    kind,
    currency: quote.currency,
    price: quote.price,
    changePct: quote.changePct,
    holdings,
    sectors: catalog?.sectors ?? [],
    source,
    asOf: issuer?.asOf ?? catalog?.asOf,
    coverage,
  };
}

export async function analyzeTickers(tickers: string[], live = false): Promise<{
  instruments: Record<string, Instrument>;
  aliases: Record<string, string>;
  fxUsdCad: number;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const aliases: Record<string, string> = {};
  const instruments: Record<string, Instrument> = {};
  const previous = forceQuotes;
  forceQuotes = live;
  try {
  const usdCadQuote =
    (await fetchQuote("USDCAD=X")) ?? (await fetchQuote("CAD=X"));
  let fxUsdCad = usdCadQuote?.price && usdCadQuote.price > 0 ? usdCadQuote.price : 1.39;
  if (fxUsdCad < 1) fxUsdCad = 1 / fxUsdCad;

  const queue: { symbol: string; depth: number }[] = [];
  const seen = new Set<string>();
  let processed = 0;

  for (const t of tickers) {
    const a = applyAlias(t);
    queue.push({ symbol: a, depth: 0 });
  }

  while (queue.length && processed < MAX_INSTRUMENTS) {
    const batch: { symbol: string; depth: number }[] = [];
    while (queue.length && batch.length < CONCURRENCY) {
      const next = queue.shift();
      if (!next) break;
      const listing = applyAlias(next.symbol);
      if (seen.has(listing)) continue;
      seen.add(listing);
      batch.push(next);
    }
    if (!batch.length) break;
    processed += batch.length;

    await mapPool(batch, CONCURRENCY, async ({ symbol, depth }) => {
      if (isSynthetic(symbol)) {
        const syn = syntheticInstrument(symbol);
        instruments[syn.symbol] = syn;
        return;
      }
      const catalog = catalogInstrument(symbol);
      const quote = await resolveQuote(symbol);
      if (!quote) {
        const mark = bookMark(symbol) ?? bookMark(catalog?.symbol ?? "");
        if (catalog && (mark?.price || catalog.price != null)) {
          const priced = {
            ...catalog,
            price: mark?.price ?? catalog.price,
            currency: mark?.currency ?? catalog.currency,
          };
          instruments[catalog.symbol] = priced;
          aliases[applyAlias(symbol)] = catalog.symbol;
          warnings.push(`Using 11 Sep 2026 marks where live quotes were missing.`);
        } else if (mark) {
          instruments[symbol] = {
            symbol,
            displaySymbol: displaySymbol(symbol),
            name: catalog?.name ?? displaySymbol(symbol),
            kind: catalog?.kind ?? "equity",
            currency: mark.currency,
            price: mark.price,
            changePct: null,
            holdings: catalog?.holdings ?? null,
            sectors: catalog?.sectors?.length
              ? catalog.sectors
              : [{ name: sectorOf(symbol), weight: 1 }],
            source: catalog ? "catalog" : "yahoo",
            coverage: catalog?.coverage ?? 0,
          };
          aliases[applyAlias(symbol)] = symbol;
          warnings.push(`Using 11 Sep 2026 marks where live quotes were missing.`);
        } else {
          warnings.push(`Could not resolve ${symbol}.`);
        }
        return;
      }
      aliases[applyAlias(symbol)] = quote.symbol;
      aliases[normalizeTicker(symbol)] = quote.symbol;

      let yahooHoldings: HoldingLine[] | null = null;
      let issuer: Awaited<ReturnType<typeof fetchIssuerHoldings>> = null;
      const catalogHoldingsOk = holdingsAreUsable(catalog?.holdings);
      const isFund = looksLikeFundInstrument(quote, catalog) && depth <= 4;
      if (isFund && !catalogHoldingsOk) {
        issuer = await fetchIssuerHoldings(quote.symbol, quote.currency);
      }
      if (isFund && !catalogHoldingsOk && depth <= 3 && !holdingsAreUsable(issuer?.holdings)) {
        yahooHoldings = await fetchYahooHoldings(quote.symbol);
      }

      const inst = mergeInstrument(quote, catalog, yahooHoldings, issuer);
      instruments[inst.symbol] = inst;
      instruments[issuerKey(inst.symbol)] ??= inst;
      if (catalog) {
        instruments[catalog.symbol] ??= inst;
        instruments[issuerKey(catalog.symbol)] ??= inst;
      }
      const shareBase = stripShareClass(inst.symbol);
      if (shareBase && shareBase !== issuerKey(inst.symbol)) {
        instruments[shareBase] ??= inst;
      }

      if (inst.holdings && depth < 4) {
        for (const h of inst.holdings) {
          if (isSynthetic(h.symbol)) continue;
          const childListing = applyAlias(h.symbol);
          if (seen.has(childListing) || seen.has(h.symbol)) continue;
          if (!holdingLooksLikeFund(h)) continue;
          const childCat = catalogInstrument(h.symbol);
          if (holdingsAreUsable(childCat?.holdings)) continue;
          queue.push({ symbol: h.symbol, depth: depth + 1 });
        }
      }
    });
  }

  return { instruments, aliases, fxUsdCad, warnings: [...new Set(warnings)] };
  } finally {
    forceQuotes = previous;
  }
}
