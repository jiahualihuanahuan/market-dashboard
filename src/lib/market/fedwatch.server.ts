import { fedWatchMeetings, upcomingMeetings, type FedWatch, type Settlement } from "@/lib/market/fedwatch";

const CME_URL = "https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/305/FUT";
const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";
const CME_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  referer: "https://www.cmegroup.com/markets/interest-rates/stirs/30-day-federal-fund.settlements.html",
};
const CODES: Record<number, string> = {
  1: "F", 2: "G", 3: "H", 4: "J", 5: "K", 6: "M",
  7: "N", 8: "Q", 9: "U", 10: "V", 11: "X", 12: "Z",
};
const MONTHS = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

let cache: { at: number; data: FedWatch } | null = null;

export async function loadFedWatch(fresh = false): Promise<FedWatch> {
  if (!fresh && cache && Date.now() - cache.at < 30 * 60 * 1000) return cache.data;
  const [effr, low, high] = await Promise.all([
    latestFred("EFFR"),
    latestFred("DFEDTARL"),
    latestFred("DFEDTARU"),
  ]);
  const targetLow = low.value;
  const targetHigh = high.value;
  const today = nyToday();
  const meetings = upcomingMeetings(today, 4);
  let curve: { asOf: string; source: FedWatch["source"]; rows: Settlement[] };
  try {
    curve = await cmeCurve(today);
  } catch {
    curve = await yahooCurve();
  }
  const data: FedWatch = {
    asOf: curve.asOf,
    source: curve.source,
    effr: effr.value,
    effrAsOf: effr.date,
    targetLow,
    targetHigh,
    meetings: fedWatchMeetings(curve.rows, meetings, targetLow, targetHigh),
  };
  if (!data.meetings.length) throw new Error("Fed funds futures did not price the next meetings.");
  cache = { at: Date.now(), data };
  return data;
}

async function cmeCurve(today: string): Promise<{ asOf: string; source: "cme-settlement"; rows: Settlement[] }> {
  let cursor = today;
  for (let i = 0; i < 8; i += 1) {
    if (weekday(cursor) > 0 && weekday(cursor) < 6) {
      const url = `${CME_URL}?tradeDate=${cursor.slice(5, 7)}/${cursor.slice(8, 10)}/${cursor.slice(0, 4)}`;
      const response = await fetch(url, { headers: CME_HEADERS, signal: AbortSignal.timeout(12000) });
      if (response.status === 403 || response.status === 429) break;
      if (response.ok) {
        const payload = (await response.json()) as {
          empty?: boolean;
          settlements?: { month?: string; settle?: string }[];
        };
        const rows = (payload.settlements ?? [])
          .filter((row) => row.month && row.month !== "Total")
          .map((row) => ({ month: String(row.month), settle: Number(row.settle) }))
          .filter((row) => Number.isFinite(row.settle));
        if (!payload.empty && rows.length >= 6) return { asOf: cursor, source: "cme-settlement", rows };
      }
    }
    cursor = shift(cursor, -1);
  }
  throw new Error("CME settlements unavailable");
}

async function yahooCurve(): Promise<{ asOf: string; source: "yahoo-last"; rows: Settlement[] }> {
  const today = nyToday();
  const [year, month] = today.split("-").map(Number);
  const symbols: { month: string; symbol: string }[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < 14; i += 1) {
    symbols.push({
      month: `${MONTHS[m]} ${String(y % 100).padStart(2, "0")}`,
      symbol: `ZQ${CODES[m]}${String(y).slice(2)}.CBT`,
    });
    const next = m === 12 ? [y + 1, 1] : [y, m + 1];
    y = next[0];
    m = next[1];
  }
  const rows: Settlement[] = [];
  let asOf = today;
  await pool(symbols, 4, async (item) => {
    const url = `${YAHOO}/${encodeURIComponent(item.symbol)}?interval=1d&range=5d`;
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; MarketDesk/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return;
    const json = (await response.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; regularMarketTime?: number } }[] };
    };
    const meta = json.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (!meta || price == null || !Number.isFinite(price)) return;
    rows.push({ month: item.month, settle: price });
    if (meta.regularMarketTime) {
      const stamp = nyStamp(meta.regularMarketTime * 1000);
      if (stamp < asOf) asOf = stamp;
    }
  });
  if (rows.length < 6) throw new Error("Fed funds futures quotes are unavailable.");
  return { asOf, source: "yahoo-last", rows };
}

async function latestFred(id: string): Promise<{ date: string; value: number }> {
  const start = shift(nyToday(), -40);
  const response = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; MarketDesk/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${id} did not answer`);
  const lines = (await response.text()).trim().split(/\r?\n/).slice(1);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const [date, raw] = lines[i].split(",");
    const value = Number(raw);
    if (date && Number.isFinite(value)) return { date, value };
  }
  throw new Error(`${id} had no recent print`);
}

function nyToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nyStamp(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function shift(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

async function pool<T>(items: T[], size: number, job: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await job(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
}
