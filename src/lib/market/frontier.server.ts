import { buildFrontier, type FrontierModel } from "@/lib/market/frontier";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";

export const FRONTIER_ASSETS = [
  { symbol: "BTC-USD", label: "Bitcoin" },
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq-100" },
  { symbol: "GLD", label: "Gold" },
  { symbol: "BIL", label: "Short-term Treasuries" },
];

let cache: { at: number; data: FrontierModel } | null = null;

export async function loadFrontier(live = false): Promise<FrontierModel> {
  if (!live && cache && Date.now() - cache.at < 6 * 60 * 60 * 1000) return cache.data;
  const series = await Promise.all(FRONTIER_ASSETS.map((asset) => loadCloses(asset.symbol)));
  const common = intersect(series);
  if (common.length < 260) throw new Error("Not enough overlapping history to build a frontier.");
  const maps = series.map((bars) => new Map(bars.map((bar) => [bar.d, bar.c])));
  const dates: string[] = [];
  const returns = series.map(() => [] as number[]);
  for (let index = 1; index < common.length; index += 1) {
    const prev = maps.map((bars) => bars.get(common[index - 1]));
    const next = maps.map((bars) => bars.get(common[index]));
    if (prev.some((value) => value == null || value <= 0) || next.some((value) => value == null || value <= 0)) continue;
    dates.push(common[index]);
    for (let asset = 0; asset < series.length; asset += 1) {
      returns[asset].push((next[asset] as number) / (prev[asset] as number) - 1);
    }
  }
  if (dates.length < 260) throw new Error("Not enough overlapping history to build a frontier.");
  const data = buildFrontier({
    start: dates[0] ?? common[0],
    end: dates[dates.length - 1] ?? common[common.length - 1],
    assets: FRONTIER_ASSETS.map((asset) => ({ symbol: asset.symbol, label: asset.label })),
    dates,
    returns,
  });
  cache = { at: Date.now(), data };
  return data;
}

async function loadCloses(symbol: string): Promise<{ d: string; c: number }[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5y&includeAdjustedClose=true`;
  const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${symbol} history did not load`);
  const json = (await response.json()) as {
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { adjclose?: { adjclose?: Array<number | null> }[]; quote?: { close?: Array<number | null> }[] } }> };
  };
  const result = json.chart?.result?.[0];
  const stamps = result?.timestamp ?? [];
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const bars: { d: string; c: number }[] = [];
  for (let index = 0; index < stamps.length; index += 1) {
    const close = adjusted?.[index] ?? closes[index];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    bars.push({ d: etDate(stamps[index]), c: close });
  }
  return bars;
}

function intersect(series: { d: string; c: number }[][]): string[] {
  const counts = new Map<string, number>();
  for (const bars of series) {
    for (const bar of new Set(bars.map((item) => item.d))) counts.set(bar, (counts.get(bar) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter((entry) => entry[1] === series.length)
    .map((entry) => entry[0])
    .sort();
}

function etDate(unix: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unix * 1000));
}
