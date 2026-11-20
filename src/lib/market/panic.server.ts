import { readCache, writeCache } from "./store.server.ts";
import { fredObs } from "./fred.server.ts";
import { buildPanicHistory, type PanicPoint } from "./panic.ts";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";

export async function loadPanic(live = false): Promise<{ points: PanicPoint[] }> {
  const cached = readCache<{ at: number; points: PanicPoint[] }>("panic-history");
  if (!live && cached && Date.now() - cached.at < 6 * 60 * 60 * 1000 && cached.points.length > 100) return { points: cached.points };
  const [vix, hy] = await Promise.all([vixHistory(), hyHistory()]);
  const points = buildPanicHistory(vix, hy);
  if (points.length < 50) {
    if (cached?.points.length) return { points: cached.points };
    throw new Error("Panic history did not load.");
  }
  writeCache("panic-history", { at: Date.now(), points });
  return { points };
}

async function vixHistory(): Promise<{ d: string; v: number }[]> {
  const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=10y", {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return [];
  const json = (await response.json()) as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const out: { d: string; v: number }[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    if (!timestamps[i] || typeof close !== "number" || !(close > 0)) continue;
    out.push({ d: fmt.format(new Date(timestamps[i] * 1000)), v: close });
  }
  return out;
}

async function hyHistory(): Promise<{ d: string; v: number }[]> {
  try {
    const obs = await fredObs("BAMLH0A0HYM2", "2016-01-01");
    return obs.filter((row) => row.value > 0).map((row) => ({ d: row.date, v: row.value }));
  } catch {
    return [];
  }
}
