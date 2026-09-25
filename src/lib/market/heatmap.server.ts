import { membersOf } from "@/lib/market/breadth.server";
import type { HeatCell, Heatmap } from "@/lib/market/types";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";

let cache: { key: string; at: number; data: Heatmap } | null = null;

export async function loadHeatmap(index: string, live = false): Promise<Heatmap> {
  if (!live && cache && cache.key === index && Date.now() - cache.at < 8 * 60 * 1000) return cache.data;
  const members = await membersOf(index);
  if (!members) throw new Error("That index is not on this desk.");
  const cells = await sparkCells(members.symbols);
  const data: Heatmap = { index, label: members.label, listed: members.symbols.length, cells };
  cache = { key: index, at: Date.now(), data };
  return data;
}

async function sparkCells(symbols: string[]): Promise<HeatCell[]> {
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));
  const rows = await mapPool(batches, 5, async (batch) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(batch.join(","))}&range=1y&interval=1d`;
    const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) return [] as HeatCell[];
    const json = (await response.json()) as Record<string, { close?: number[]; fulldayChangePercent?: number }>;
    return batch.flatMap((symbol) => {
      const row = json[symbol];
      if (!row) return [];
      const closes = (row.close ?? []).filter((value) => typeof value === "number" && value > 0);
      const day = row.fulldayChangePercent;
      return [{
        symbol,
        d1: typeof day === "number" && Number.isFinite(day) ? round(day) : move(closes, 1),
        w1: move(closes, 5),
        m1: move(closes, 21),
        y1: move(closes, 252),
      }];
    });
  });
  return rows.flat();
}

function move(closes: number[], sessions: number): number | null {
  if (closes.length <= sessions) {
    if (sessions >= 200 && closes.length > 200) return move(closes, closes.length - 1);
    return null;
  }
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 1 - sessions];
  if (!prev || prev <= 0) return null;
  return round((last / prev - 1) * 100);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
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
