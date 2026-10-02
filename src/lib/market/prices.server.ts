import type { MarketPrint } from "@/lib/market/prints";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";

type SparkRow = { fulldayPrice?: number; timestamp?: number[]; close?: number[] };

/** Latest regular-session price for many symbols at once. Omits a symbol rather than returning yesterday's close. */
export async function latestPrices(symbols: string[]): Promise<Map<string, MarketPrint>> {
  const out = new Map<string, MarketPrint>();
  const unique = [...new Set(symbols)];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += 20) batches.push(unique.slice(i, i + 20));
  await mapPool(batches, 4, async (batch) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(batch.join(","))}&range=5d&interval=1d`;
    const json = await fetchJson(url);
    if (!json) return;
    for (const symbol of batch) {
      const row = (json[symbol] ?? json[symbol.toUpperCase()]) as SparkRow | undefined;
      const price = row?.fulldayPrice;
      const time = row?.timestamp?.[row.timestamp.length - 1] ?? 0;
      if (typeof price === "number" && price > 0 && time > 0) out.set(symbol, { price, time });
    }
  });
  return out;
}

async function fetchJson(url: string): Promise<Record<string, SparkRow> | null> {
  try {
    const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, SparkRow>;
  } catch {
    return null;
  }
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}
