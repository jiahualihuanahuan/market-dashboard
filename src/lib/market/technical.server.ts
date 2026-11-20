import { buildBook, cleanSymbol, type Bar, type TechBook } from "@/lib/market/technical";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";
const cache = new Map<string, { at: number; data: TechBook }>();

export async function loadTechnical(symbol: string, live = false): Promise<TechBook> {
  const cleaned = cleanSymbol(symbol) || "SPY";
  const hit = cache.get(cleaned);
  if (!live && hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleaned)}?interval=1d&range=2y`,
    { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error("The price history did not load.");
  const json = (await response.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        meta?: { shortName?: string; currency?: string; regularMarketPrice?: number };
        indicators?: { quote?: Array<{ high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> };
      }>;
    };
  };
  const result = json.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error("No daily history for that ticker.");
  const quote = result.indicators?.quote?.[0];
  const bars: Bar[] = [];
  for (let i = 0; i < result.timestamp.length; i += 1) {
    const close = quote?.close?.[i];
    const high = quote?.high?.[i];
    const low = quote?.low?.[i];
    if (close == null || high == null || low == null || !(close > 0)) continue;
    const date = etDate(result.timestamp[i]);
    const volume = quote?.volume?.[i] ?? 0;
    if (bars[bars.length - 1]?.date === date) {
      bars[bars.length - 1] = { date, high, low, close, volume };
      continue;
    }
    bars.push({ date, high, low, close, volume });
  }
  if (bars.length < 60) throw new Error("Not enough daily bars to score the averages.");
  const price = result.meta?.regularMarketPrice && result.meta.regularMarketPrice > 0 ? result.meta.regularMarketPrice : bars[bars.length - 1].close;
  const data = buildBook({
    symbol: cleaned,
    name: result.meta?.shortName || cleaned,
    currency: result.meta?.currency || "",
    price,
    bars,
  });
  cache.set(cleaned, { at: Date.now(), data });
  return data;
}

function etDate(unix: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unix * 1000));
}
