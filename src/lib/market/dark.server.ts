import { avgSize, darkShare, latestOf, type DarkBook, type DarkFlag, type DarkRow } from "@/lib/market/dark";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";
const TTL = 6 * 60 * 60 * 1000;
const FIELDS = [
  "issueSymbolIdentifier",
  "issueName",
  "totalWeeklyShareQuantity",
  "totalNotionalSum",
  "totalWeeklyTradeCount",
  "initialPublishedDate",
  "weekStartDate",
];

type Quote = { name: string; shares: number; notional: number; trades: number };
type WeekBook = { published: string; rows: Map<string, Quote> };

let cache: { at: number; data: DarkBook } | null = null;

export async function loadDark(live = false): Promise<DarkBook> {
  if (!live && cache && Date.now() - cache.at < TTL) return cache.data;
  const weeks = await publishedWeeks(8);
  if (weeks.length < 2) throw new Error("FINRA did not return enough dark-pool weeks.");
  const latest = weeks[weeks.length - 1];
  const [atsWeeks, other, daily] = await Promise.all([
    mapPool(weeks, 4, (week) => loadSymbolWeek(week, "ATS_W_SMBL")),
    loadSymbolWeek(latest, "OTC_W_SMBL"),
    loadDaily().catch(() => null),
  ]);
  const data = buildBook(weeks, atsWeeks, other, daily);
  cache = { at: Date.now(), data };
  return data;
}

function buildBook(weeks: string[], atsWeeks: WeekBook[], other: WeekBook, daily: DarkBook["daily"]): DarkBook {
  const symbols = new Set<string>();
  for (const week of atsWeeks) for (const symbol of week.rows.keys()) symbols.add(symbol);
  const rows: DarkRow[] = [];
  for (const symbol of symbols) {
    const notional: number[] = [];
    const shares: number[] = [];
    let name = symbol;
    let trades = 0;
    atsWeeks.forEach((week, index) => {
      const row = week.rows.get(symbol);
      notional[index] = row?.notional ?? 0;
      shares[index] = row?.shares ?? 0;
      if (row?.name) name = row.name;
      if (index === atsWeeks.length - 1 && row) trades = row.trades;
    });
    if (notional[notional.length - 1] <= 0 && notional.every((value) => value <= 0)) continue;
    const rest = other.rows.get(symbol);
    rows.push({
      symbol,
      name,
      notional,
      shares,
      trades,
      otherNotional: rest ? rest.notional : null,
      otherShares: rest ? rest.shares : null,
    });
  }
  rows.sort((a, b) => latestOf(b) - latestOf(a));
  const published = atsWeeks[atsWeeks.length - 1]?.published || weeks[weeks.length - 1];
  return {
    weeks,
    published,
    rows,
    flags: buildFlags(rows),
    daily,
    note: "Tier 1 is FINRA's large-name list: S&P 500, Russell 1000, and selected ETFs. Dark-pool dollars are shares traded on an ATS times the price of those prints. The other off-exchange column is FINRA's separate non-ATS file for the same week, mostly brokers filling orders themselves. A name can be missing from one file. This is not today's tape.",
  };
}

function buildFlags(rows: DarkRow[]): DarkFlag[] {
  const last = (row: DarkRow) => latestOf(row);
  const prior = (row: DarkRow) => (row.notional.length >= 2 ? row.notional[row.notional.length - 2] : 0);
  const big = rows.filter((row) => last(row) >= 1_000_000_000 && row.trades > 0);
  const sizes = big.map((row) => avgSize(row)).sort((a, b) => a - b);
  const sizeCut = sizes.length ? sizes[Math.floor(sizes.length * 0.9)] : 800;
  const flags: DarkFlag[] = [];
  const jumps = rows
    .filter((row) => last(row) >= 1_500_000_000 && prior(row) >= 200_000_000 && (last(row) - prior(row)) / prior(row) >= 0.75)
    .slice(0, 3);
  for (const row of jumps) {
    const change = ((last(row) - prior(row)) / prior(row)) * 100;
    flags.push({
      symbol: row.symbol,
      name: row.name,
      label: "Dark dollars jumped",
      detail: `ATS dollars rose ${change.toFixed(0)}% from the prior week. A jump can be a busy week, a rebalance, or more hidden prints. It does not say whether the next move is up or down.`,
    });
  }
  const hidden = rows
    .filter((row) => {
      const share = darkShare(row);
      return share != null && share <= 30 && (row.otherNotional ?? 0) >= 2_000_000_000 && last(row) >= 500_000_000;
    })
    .slice(0, 3);
  for (const row of hidden) {
    flags.push({
      symbol: row.symbol,
      name: row.name,
      label: "Hidden, but not a dark pool",
      detail: `Only ${darkShare(row)?.toFixed(0)}% of its off-exchange dollars were on an ATS. Most of the hidden tape was somewhere else, often a broker filling the order from its own inventory.`,
    });
  }
  const blocks = big
    .filter((row) => avgSize(row) >= Math.max(400, sizeCut) && last(row) >= 2_000_000_000)
    .sort((a, b) => avgSize(b) - avgSize(a))
    .slice(0, 2);
  for (const row of blocks) {
    flags.push({
      symbol: row.symbol,
      name: row.name,
      label: "Larger prints",
      detail: `The average ATS print was ${Math.round(avgSize(row)).toLocaleString("en-US")} shares, near the top of this large-name list. That means fewer, bigger hidden trades. It is still not a giant block by old standards, and it does not say who was buying.`,
    });
  }
  const pools = rows
    .filter((row) => {
      const share = darkShare(row);
      return share != null && share >= 70 && last(row) >= 2_000_000_000;
    })
    .slice(0, 2);
  for (const row of pools) {
    flags.push({
      symbol: row.symbol,
      name: row.name,
      label: "Mostly a dark pool",
      detail: `${darkShare(row)?.toFixed(0)}% of its off-exchange dollars were on an ATS, so the hidden tape was a dark pool more than a wholesaler.`,
    });
  }
  return flags;
}

async function publishedWeeks(count: number): Promise<string[]> {
  const hits = await mapPool(mondays(14), 6, async (week) => {
    const page = await finra(weekFilters(week, "ATS_W_SMBL"), 1, 0);
    return page.length ? week : "";
  });
  return hits.filter(Boolean).sort().slice(-count);
}

async function loadSymbolWeek(week: string, code: string): Promise<WeekBook> {
  const rows = new Map<string, Quote>();
  let published = week;
  for (let offset = 0; offset < 15000; offset += 5000) {
    const page = await finra(weekFilters(week, code), 5000, offset);
    for (const row of page) {
      const symbol = cleanSymbol(row.issueSymbolIdentifier);
      if (!symbol) continue;
      const quote: Quote = {
        name: String(row.issueName ?? symbol),
        shares: num(row.totalWeeklyShareQuantity),
        notional: num(row.totalNotionalSum),
        trades: num(row.totalWeeklyTradeCount),
      };
      const prev = rows.get(symbol);
      rows.set(symbol, prev ? {
        name: quote.name || prev.name,
        shares: prev.shares + quote.shares,
        notional: prev.notional + quote.notional,
        trades: prev.trades + quote.trades,
      } : quote);
      if (row.initialPublishedDate) published = String(row.initialPublishedDate);
    }
    if (page.length < 5000) break;
  }
  return { published, rows };
}

function weekFilters(week: string, code: string) {
  return [
    { compareType: "EQUAL", fieldName: "weekStartDate", fieldValue: week },
    { compareType: "EQUAL", fieldName: "tierIdentifier", fieldValue: "T1" },
    { compareType: "EQUAL", fieldName: "summaryTypeCode", fieldValue: code },
  ];
}

type FinraRow = {
  issueSymbolIdentifier?: string | null;
  issueName?: string | null;
  totalWeeklyShareQuantity?: number | null;
  totalNotionalSum?: number | null;
  totalWeeklyTradeCount?: number | null;
  initialPublishedDate?: string | null;
};

async function finra(compareFilters: { compareType: string; fieldName: string; fieldValue: string }[], limit: number, offset: number): Promise<FinraRow[]> {
  const response = await fetch("https://api.finra.org/data/group/otcMarket/name/weeklySummary", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({ limit, offset, fields: FIELDS, compareFilters }),
    signal: AbortSignal.timeout(25000),
  });
  if (response.status === 204) return [];
  if (!response.ok) throw new Error(`FINRA dark-pool file returned ${response.status}.`);
  const text = await response.text();
  if (!text.trim()) return [];
  const data = JSON.parse(text) as unknown;
  if (!Array.isArray(data)) throw new Error("FINRA dark-pool file was not a table.");
  return data as FinraRow[];
}

async function loadDaily(): Promise<DarkBook["daily"]> {
  const file = await latestDaily();
  if (!file) return null;
  const parsed: { symbol: string; off: number; short: number }[] = [];
  let offShares = 0;
  let shortShares = 0;
  for (const line of file.text.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length < 5 || parts[0] === "Date" || !parts[1]) continue;
    const off = Number(parts[4]);
    const short = Number(parts[2]);
    if (!(off > 0)) continue;
    const symbol = parts[1].trim().toUpperCase();
    parsed.push({ symbol, off, short: Number.isFinite(short) ? short : 0 });
    offShares += off;
    if (Number.isFinite(short)) shortShares += short;
  }
  parsed.sort((a, b) => b.off - a.off);
  const seeded = new Set(["SPY", "QQQ", "IWM", "DIA", "NVDA", "AAPL", "MSFT", "AMZN", "META", "TSLA", "AVGO", "GOOGL", "GLD", "HYG", "TLT", "IBIT", "SMH", "XLF"]);
  const leaders = [
    ...parsed.filter((row) => seeded.has(row.symbol)),
    ...parsed.slice(0, 120).filter((row) => !seeded.has(row.symbol)),
  ];
  const prices = await lastPrices(leaders.map((row) => row.symbol));
  const ranked = leaders.map((row) => {
    const price = prices.get(yahooSymbol(row.symbol));
    return {
      symbol: row.symbol.replaceAll("/", "."),
      offShares: row.off,
      dollars: price != null ? row.off * price : null,
      shortPct: row.off > 0 ? (row.short / row.off) * 100 : null,
    };
  });
  const priced = ranked.filter((row) => row.dollars != null).length;
  ranked.sort((a, b) => (priced >= 30 ? (b.dollars ?? -1) - (a.dollars ?? -1) : b.offShares - a.offShares));
  return {
    asOf: file.asOf,
    offShares,
    shortPct: offShares > 0 ? (shortShares / offShares) * 100 : null,
    rows: ranked.slice(0, 15),
  };
}

async function latestDaily(): Promise<{ asOf: string; text: string } | null> {
  const now = new Date();
  for (let back = 0; back < 7; back += 1) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back));
    const stamp = day.toISOString().slice(0, 10).replaceAll("-", "");
    const response = await fetch(`https://cdn.finra.org/equity/regsho/daily/CNMSshvol${stamp}.txt`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) continue;
    const text = await response.text();
    if (text.includes("|") && text.length > 1000) return { asOf: day.toISOString().slice(0, 10), text };
  }
  return null;
}

async function lastPrices(symbols: string[]): Promise<Map<string, number>> {
  const yahoo = [...new Set(symbols.map(yahooSymbol))];
  const prices = new Map<string, number>();
  const batches: string[][] = [];
  for (let i = 0; i < yahoo.length; i += 20) batches.push(yahoo.slice(i, i + 20));
  await mapPool(batches, 4, async (batch) => {
    await fillPrices(batch, prices);
  });
  return prices;
}

async function fillPrices(batch: string[], prices: Map<string, number>): Promise<void> {
  if (!batch.length) return;
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(batch.join(","))}&range=5d&interval=1d`,
    { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok) {
    if (batch.length === 1) return;
    const mid = Math.ceil(batch.length / 2);
    await fillPrices(batch.slice(0, mid), prices);
    await fillPrices(batch.slice(mid), prices);
    return;
  }
  const json = (await response.json()) as Record<string, { close?: number[] }>;
  for (const [symbol, row] of Object.entries(json)) {
    const closes = (row?.close ?? []).filter((value) => typeof value === "number" && value > 0);
    const last = closes[closes.length - 1];
    if (last) prices.set(symbol.toUpperCase(), last);
  }
}

function yahooSymbol(symbol: string): string {
  return symbol.toUpperCase().replaceAll("/", "-").replaceAll(".", "-");
}

function cleanSymbol(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mondays(count: number): string[] {
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - sinceMonday);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() - 7);
  }
  return out;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}
