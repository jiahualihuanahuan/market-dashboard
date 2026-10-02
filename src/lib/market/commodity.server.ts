import { readCache, writeCache } from "./store.server.ts";
import { COMMODITY_CHARTS } from "./commodity.ts";
import type { TapePoint } from "./tape.ts";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";

export type CommodityChart = {
  symbol: string;
  label: string;
  daily: TapePoint[];
  day: TapePoint[];
};

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

export async function loadCommodityChart(symbol: string, live = false): Promise<CommodityChart> {
  const item = COMMODITY_CHARTS.find((row) => row.symbol === symbol) ?? COMMODITY_CHARTS[0];
  const key = `commodity-${item.symbol.replace(/[^A-Za-z0-9]/g, "")}`;
  const cached = readCache<{ at: number; daily: TapePoint[]; day: TapePoint[] }>(key);
  if (!live && cached && Date.now() - cached.at < 60_000 && cached.daily.length > 20) {
    return { symbol: item.symbol, label: item.label, daily: cached.daily, day: cached.day };
  }
  const [dailyRaw, day] = await Promise.all([
    cached && Date.now() - cached.at < 6 * 60 * 60 * 1000 && !live ? Promise.resolve(cached.daily) : bars(item.symbol, "1d", "10y", false),
    bars(item.symbol, "5m", "1d", true),
  ]);
  const daily = dailyRaw.length ? dailyRaw : cached?.daily ?? [];
  if (daily.length < 2) throw new Error(`${item.label} history did not load.`);
  const row = { at: Date.now(), daily, day };
  writeCache(key, row);
  return { symbol: item.symbol, label: item.label, daily, day };
}

async function bars(symbol: string, interval: string, range: string, clock: boolean): Promise<TapePoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=true`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp as number[] | undefined;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps || !quote) return [];
  const points: TapePoint[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = quote.close?.[i];
    if (!timestamps[i] || typeof close !== "number" || !(close > 0)) continue;
    const d = clock ? timeFmt.format(new Date(timestamps[i] * 1000)) : dateFmt.format(new Date(timestamps[i] * 1000));
    const last = points[points.length - 1];
    const point = { d, v: Math.round(close * 100) / 100 };
    if (!clock && last?.d === d) points[points.length - 1] = point;
    else points.push(point);
  }
  if (clock || !points.length) return points;
  const price = result?.meta?.regularMarketPrice;
  const time = result?.meta?.regularMarketTime;
  if (!(typeof price === "number" && price > 0)) return points;
  const day = dateFmt.format(new Date((typeof time === "number" ? time : Math.floor(Date.now() / 1000)) * 1000));
  const bar = { d: day, v: Math.round(price * 100) / 100 };
  const last = points[points.length - 1];
  if (last.d === day) return points.slice(0, -1).concat(bar);
  if (last.d < day) return points.concat(bar);
  return points;
}

async function fetchJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
    if (response.status === 429 || response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      continue;
    }
    if (!response.ok) return null;
    return response.json();
  }
  return null;
}
