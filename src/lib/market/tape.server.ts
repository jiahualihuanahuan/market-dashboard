import { membersOf } from "./breadth.server.ts";
import { percentChange, type BreadthPoint, type RangeId, type Tape, type TapeIndex, type TapePoint } from "./tape.ts";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";
const RANGES: RangeId[] = ["day", "week", "month", "quarter", "half", "ytd", "y1", "y3", "y5", "y10"];
const INDEXES: { symbol: string; label: string; note?: string }[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^DJI", label: "Dow", note: "The Dow counts a high share price more than a large company. Most other indexes do the opposite." },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^NDX", label: "Nasdaq-100" },
  { symbol: "^RUT", label: "Russell 2000" },
  { symbol: "^NYA", label: "NYSE" },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50" },
  { symbol: "^FTSE", label: "FTSE 100" },
  { symbol: "^GDAXI", label: "DAX" },
  { symbol: "^N225", label: "Nikkei 225" },
  { symbol: "^AXJO", label: "ASX 200" },
  { symbol: "^GSPTSE", label: "S&P/TSX" },
];

let tapeCache: { at: number; data: Tape } | null = null;
let breadthCache: { at: number; points: BreadthPoint[]; members: number; note: string } | null = null;
const HISTORY_MS = 15 * 60 * 1000;
const historyCache = new Map<string, { at: number; points: TapePoint[]; price: number | null; time: number | null }>();

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clockFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

export async function loadTape(live = false): Promise<Tape> {
  if (!live && tapeCache && Date.now() - tapeCache.at < 30 * 60 * 1000) return tapeCache.data;
  const [indexes, day, breadth] = await Promise.all([
    mapPool(INDEXES, 4, (item) => loadIndex(item.symbol, item.label, live, item.note)),
    live ? loadIntraday("^GSPC") : Promise.resolve([] as TapePoint[]),
    cachedBreadth(),
  ]);
  const ready = indexes.filter((row): row is TapeIndex & { points: TapePoint[]; quoteTime: string | null } => row != null);
  const spx = ready.find((row) => row.symbol === "^GSPC");
  if (!spx) throw new Error("The S&P 500 history did not load.");
  const data: Tape = {
    asOf: spx.points[spx.points.length - 1]?.d ?? "",
    indexes: ready.map(({ points: _points, quoteTime: _quoteTime, ...row }) => row),
    spx: spx.points,
    spxDay: day,
    breadth: breadth.points,
    members: breadth.members,
    note: breadth.note,
    quoteTime: spx.quoteTime,
  };
  if (!live) tapeCache = { at: Date.now(), data };
  return data;
}

async function loadIndex(symbol: string, label: string, live: boolean, note?: string): Promise<(TapeIndex & { points: TapePoint[]; quoteTime: string | null }) | null> {
  const hist = await dailyHistory(symbol);
  if (!hist) return null;
  let points = hist.points.map((point) => ({ ...point }));
  let livePrice: number | null = null;
  let quoteUnix: number | null = null;
  if (live) {
    const justFetched = Date.now() - hist.at < 45_000 && hist.price;
    if (justFetched) {
      livePrice = hist.price;
      quoteUnix = hist.time;
    } else {
      const quote = await liveQuote(symbol);
      livePrice = quote?.price ?? hist.price;
      quoteUnix = quote?.time ?? hist.time;
    }
  }
  if (!live) points = dropOpenSession(points);
  if (livePrice && livePrice > 0) {
    const today = etDate(Math.floor(Date.now() / 1000));
    const last = points[points.length - 1];
    const bar = { d: today, v: Math.round(livePrice * 100) / 100 };
    points = last?.d === today ? points.slice(0, -1).concat(bar) : points.concat(bar);
  }
  if (points.length < 2) return null;
  const closes = points.map((point) => point.v);
  const dates = points.map((point) => point.d);
  const changes = {} as Record<RangeId, number | null>;
  for (const range of RANGES) changes[range] = percentChange(closes, dates, range);
  const quoteTime = live && quoteUnix ? clockFmt.format(new Date(quoteUnix * 1000)) : null;
  return { symbol, label, price: points[points.length - 1].v, changes, points: symbol === "^GSPC" ? points : [], quoteTime, note };
}

async function dailyHistory(symbol: string): Promise<{ at: number; points: TapePoint[]; price: number | null; time: number | null } | null> {
  const hit = historyCache.get(symbol);
  if (hit && Date.now() - hit.at < HISTORY_MS) return hit;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10y&includeAdjustedClose=true`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp as number[] | undefined;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps || !quote) return hit ?? null;
  const points: TapePoint[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = quote.close?.[i];
    if (!timestamps[i] || typeof close !== "number" || !(close > 0)) continue;
    points.push({ d: etDate(timestamps[i]), v: Math.round(close * 100) / 100 });
  }
  const collapsed = collapseDays(points);
  if (collapsed.length < 2) return hit ?? null;
  const meta = result?.meta ?? {};
  const row = { at: Date.now(), points: collapsed, price: num(meta.regularMarketPrice), time: num(meta.regularMarketTime) };
  historyCache.set(symbol, row);
  return row;
}

async function liveQuote(symbol: string): Promise<{ price: number; time: number | null } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const json = await fetchJson(url);
  const meta = json?.chart?.result?.[0]?.meta;
  const price = num(meta?.regularMarketPrice);
  if (!price || !(price > 0)) return null;
  return { price, time: num(meta?.regularMarketTime) };
}

async function loadIntraday(symbol: string): Promise<TapePoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp as number[] | undefined;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps || !quote) return [];
  const points: TapePoint[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = quote.close?.[i];
    if (!timestamps[i] || typeof close !== "number" || !(close > 0)) continue;
    points.push({ d: etTime(timestamps[i]), v: Math.round(close * 100) / 100 });
  }
  return points;
}

async function cachedBreadth(): Promise<{ points: BreadthPoint[]; members: number; note: string }> {
  if (breadthCache && Date.now() - breadthCache.at < 6 * 60 * 60 * 1000) {
    return { points: breadthCache.points, members: breadthCache.members, note: breadthCache.note };
  }
  const breadth = await loadBreadth();
  breadthCache = { at: Date.now(), ...breadth };
  return breadth;
}

async function loadBreadth(): Promise<{ points: BreadthPoint[]; members: number; note: string }> {
  const book = await membersOf("^GSPC");
  const symbols = (book?.symbols ?? []).filter((symbol) => /^[A-Z0-9.-]{1,10}$/.test(symbol));
  const tally = new Map<string, { up: number; down: number; flat: number }>();
  let priced = 0;
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));
  await mapPool(batches, 5, async (batch) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(batch.join(","))}&range=10y&interval=1d`;
    const json = await fetchJson(url);
    if (!json || json.spark?.error) return;
    for (const symbol of batch) {
      const row = json[symbol] ?? json[symbol.toUpperCase()];
      if (!row?.timestamp || !row.close) continue;
      let prev = 0;
      let used = false;
      for (let i = 0; i < row.timestamp.length; i += 1) {
        const close = row.close[i];
        if (typeof close !== "number" || !(close > 0) || !row.timestamp[i]) continue;
        if (prev > 0) {
          const pct = close / prev - 1;
          const day = etDate(row.timestamp[i]);
          const bucket = tally.get(day) ?? { up: 0, down: 0, flat: 0 };
          if (Math.abs(pct) < 0.0005) bucket.flat += 1;
          else if (pct > 0) bucket.up += 1;
          else bucket.down += 1;
          tally.set(day, bucket);
          used = true;
        }
        prev = close;
      }
      if (used) priced += 1;
    }
  });
  const points: BreadthPoint[] = [];
  let cum = 0;
  for (const day of [...tally.keys()].sort()) {
    const bucket = tally.get(day);
    if (!bucket) continue;
    const covered = bucket.up + bucket.down + bucket.flat;
    if (covered < 350) continue;
    const net = bucket.up - bucket.down;
    cum += net;
    points.push({ d: day, net, cum, up: bucket.up, down: bucket.down, covered });
  }
  const note = priced
    ? `Net breadth adds, each day, how many current S&P 500 members rose minus how many fell. ${priced} of ${symbols.length} members had a price history. The membership is today's list, so older years include companies that were not in the index yet and miss ones that have left. A move under 0.05% counts as flat and is left out of the net.`
    : "S&P 500 membership loaded, but the daily price history did not.";
  const trimmed = dropOpenBreadth(points);
  return { points: trimmed, members: priced, note };
}

function collapseDays(points: TapePoint[]): TapePoint[] {
  const out: TapePoint[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last?.d === point.d) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

function dropOpenBreadth(points: BreadthPoint[]): BreadthPoint[] {
  if (points.length < 3) return points;
  const today = etDate(Math.floor(Date.now() / 1000));
  if (points[points.length - 1]?.d !== today || !beforeClose()) return points;
  return points.slice(0, -1);
}

function dropOpenSession(points: TapePoint[]): TapePoint[] {
  if (points.length < 3) return points;
  const today = etDate(Math.floor(Date.now() / 1000));
  if (points[points.length - 1]?.d !== today || !beforeClose()) return points;
  return points.slice(0, -1);
}

function beforeClose(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute < 16 * 60 + 20;
}

function etDate(unix: number): string {
  return dateFmt.format(new Date(unix * 1000));
}

function etTime(unix: number): string {
  return timeFmt.format(new Date(unix * 1000));
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) });
    if (response.status === 429 || response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) return null;
    return response.json();
  }
  return null;
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
