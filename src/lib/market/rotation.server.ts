import { ROTATION_SECTORS, type SectorBook } from "@/lib/market/rotation";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";
let cache: { at: number; data: SectorBook } | null = null;

export async function loadRotation(): Promise<SectorBook> {
  if (cache && Date.now() - cache.at < 30 * 60 * 1000) return cache.data;
  const symbols = ["SPY", ...ROTATION_SECTORS.map((sector) => sector.symbol)];
  const books = await mapPool(symbols, 4, (symbol) => loadCloses(symbol));
  const spy = books[0];
  if (!spy || spy.closes.length < 320) throw new Error("S&P 500 sector history did not load.");
  const sectors: SectorBook["sectors"] = [];
  for (let index = 0; index < ROTATION_SECTORS.length; index += 1) {
    const sector = ROTATION_SECTORS[index];
    const book = books[index + 1];
    if (!book) continue;
    const map = new Map(book.dates.map((date, point) => [date, book.closes[point]]));
    const closes = spy.dates.map((date) => map.get(date) ?? Number.NaN);
    const hit = closes.filter((value) => value > 0).length;
    if (hit < spy.dates.length * 0.9) continue;
    sectors.push({ symbol: sector.symbol, label: sector.label, closes });
  }

  const keep: number[] = [];
  for (let i = 0; i < spy.dates.length; i += 1) {
    if (sectors.every((sector) => sector.closes[i] > 0)) keep.push(i);
  }
  if (keep.length < 320) throw new Error("Not enough overlapping sector history.");
  const data: SectorBook = {
    asOf: spy.dates[keep[keep.length - 1]] ?? "",
    dates: keep.map((index) => spy.dates[index]),
    benchmark: keep.map((index) => spy.closes[index]),
    sectors: sectors.map((sector) => ({
      symbol: sector.symbol,
      label: sector.label,
      closes: keep.map((index) => sector.closes[index]),
    })),
  };
  cache = { at: Date.now(), data };
  return data;
}

async function loadCloses(symbol: string): Promise<{ dates: string[]; closes: number[] } | null> {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y`,
    { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) return null;
  const json = (await response.json()) as {
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
  };
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const dates: string[] = [];
  const prices: number[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const price = closes[i];
    if (!timestamps[i] || price == null || !(price > 0)) continue;
    const date = etDate(timestamps[i]);
    if (dates[dates.length - 1] === date) {
      prices[prices.length - 1] = price;
      continue;
    }
    dates.push(date);
    prices.push(price);
  }
  return dates.length > 200 ? { dates, closes: prices } : null;
}

function etDate(unix: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unix * 1000));
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
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
