export type MarketPrint = { price: number; time: number };

/** Newest trade among the session, the pre-market, and the post-market. Never the previous close. */
export function latestPrint(meta: Record<string, unknown> | null | undefined): MarketPrint | null {
  if (!meta) return null;
  const prints: MarketPrint[] = [];
  for (const [priceKey, timeKey] of [
    ["preMarketPrice", "preMarketTime"],
    ["regularMarketPrice", "regularMarketTime"],
    ["postMarketPrice", "postMarketTime"],
  ] as const) {
    const price = num(meta[priceKey]);
    const time = num(meta[timeKey]);
    if (price && price > 0 && time && time > 0) prints.push({ price, time });
  }
  if (!prints.length) return null;
  prints.sort((a, b) => b.time - a.time);
  return prints[0];
}

/** Keep a newer trade. A later fetch that only has the previous session close does not replace it. */
export function preferPrint(current: MarketPrint | null, incoming: MarketPrint | null): MarketPrint | null {
  if (!incoming || !(incoming.price > 0)) return current;
  if (!current || !(current.price > 0)) return incoming;
  if (incoming.time > current.time) return incoming;
  if (incoming.time === current.time) return incoming;
  return current;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
