import { readSheet } from "@/lib/market/xlsx";

const UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";

type FundSpec = {
  symbol: string;
  label: string;
  group: string;
} & ({ kind: "ssga" } | { kind: "ishares"; id: number });

export const FLOW_FUNDS: readonly FundSpec[] = [
  { symbol: "SPY", label: "S&P 500", group: "US market", kind: "ssga" },
  { symbol: "IVV", label: "S&P 500, iShares", group: "US market", kind: "ishares", id: 239726 },
  { symbol: "IWM", label: "Russell 2000", group: "US market", kind: "ishares", id: 239710 },
  { symbol: "DIA", label: "Dow", group: "US market", kind: "ssga" },
  { symbol: "ITOT", label: "Total US market", group: "US market", kind: "ishares", id: 239724 },
  { symbol: "IWF", label: "Russell 1000 growth", group: "US market", kind: "ishares", id: 239706 },
  { symbol: "IJH", label: "S&P mid-cap", group: "US market", kind: "ishares", id: 239763 },
  { symbol: "IJR", label: "S&P small-cap", group: "US market", kind: "ishares", id: 239774 },
  { symbol: "XLK", label: "Technology", group: "Sectors", kind: "ssga" },
  { symbol: "XLF", label: "Financials", group: "Sectors", kind: "ssga" },
  { symbol: "XLE", label: "Energy", group: "Sectors", kind: "ssga" },
  { symbol: "XLV", label: "Health care", group: "Sectors", kind: "ssga" },
  { symbol: "XLI", label: "Industrials", group: "Sectors", kind: "ssga" },
  { symbol: "XLY", label: "Discretionary", group: "Sectors", kind: "ssga" },
  { symbol: "XLP", label: "Staples", group: "Sectors", kind: "ssga" },
  { symbol: "XLU", label: "Utilities", group: "Sectors", kind: "ssga" },
  { symbol: "XLB", label: "Materials", group: "Sectors", kind: "ssga" },
  { symbol: "XLC", label: "Communications", group: "Sectors", kind: "ssga" },
  { symbol: "XLRE", label: "Real estate", group: "Sectors", kind: "ssga" },
  { symbol: "IEFA", label: "Developed markets ex-US", group: "World", kind: "ishares", id: 244049 },
  { symbol: "IEMG", label: "Emerging markets", group: "World", kind: "ishares", id: 244050 },
  { symbol: "GLD", label: "Gold", group: "Gold, bonds, bitcoin", kind: "ssga" },
  { symbol: "IAU", label: "Gold, iShares", group: "Gold, bonds, bitcoin", kind: "ishares", id: 239561 },
  { symbol: "AGG", label: "US bonds", group: "Gold, bonds, bitcoin", kind: "ishares", id: 239458 },
  { symbol: "TLT", label: "Long Treasuries", group: "Gold, bonds, bitcoin", kind: "ishares", id: 239454 },
  { symbol: "BIL", label: "Short-term Treasuries", group: "Gold, bonds, bitcoin", kind: "ssga" },
  { symbol: "IBIT", label: "Bitcoin", group: "Gold, bonds, bitcoin", kind: "ishares", id: 333011 },
];

export type FlowPoint = { d: string; flow: number | null; cum: number; nav: number };

export type FlowFund = {
  symbol: string;
  label: string;
  group: string;
  aum: number | null;
  asOf: string;
  d1: number | null;
  f1: number | null;
  d5: number | null;
  f5: number | null;
  d21: number | null;
  f21: number | null;
  signal: string;
  history: FlowPoint[];
  error: string | null;
};

export type FlowBook = { funds: FlowFund[]; note: string };

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

const NOTE = "Flow is the change in shares outstanding, from the issuer's own file, times that day's net asset value. New shares are money coming in. Shares removed are money going out. A day is dropped when the share count jumps by more than half, which is a split or a bad print, not a trade. QQQ and VOO are left off: Invesco and Vanguard do not publish this share-count history in a file the page can read. IVV is the iShares S&P 500 fund, so that index is still here next to SPY.";

let cache: { at: number; data: FlowBook } | null = null;

export async function loadFlows(live = false): Promise<FlowBook> {
  if (!live && cache && Date.now() - cache.at < 6 * 60 * 60 * 1000) return cache.data;
  const funds: FlowFund[] = [];
  await pool(FLOW_FUNDS, 6, async (fund) => {
    try {
      funds.push(await loadFund(fund));
    } catch (error) {
      funds.push(empty(fund.symbol, fund.label, fund.group, error instanceof Error ? error.message : "The issuer file did not load."));
    }
  });
  const order = new Map(FLOW_FUNDS.map((fund, index) => [fund.symbol, index]));
  funds.sort((a, b) => (order.get(a.symbol) ?? 0) - (order.get(b.symbol) ?? 0));
  const data: FlowBook = { funds, note: NOTE };
  cache = { at: Date.now(), data };
  return data;
}

type Day = { d: string; nav: number; shares: number };

async function loadFund(fund: FundSpec): Promise<FlowFund> {
  const days = fund.kind === "ssga" ? await loadSsga(fund.symbol) : await loadIshares(fund.id);
  if (days.length < 30) throw new Error(`${fund.symbol} history was too short.`);
  const flows: { d: string; flow: number | null; nav: number }[] = [];
  for (let index = 1; index < days.length; index += 1) {
    const prev = days[index - 1];
    const next = days[index];
    const jump = Math.abs(next.shares - prev.shares) / prev.shares;
    const flow = jump > 0.5 ? null : (next.shares - prev.shares) * next.nav;
    flows.push({ d: next.d, flow, nav: next.nav });
  }
  const last = flows.length - 1;
  const aum = days[days.length - 1].shares * days[days.length - 1].nav;
  let cum = 0;
  const history: FlowPoint[] = flows.slice(-126).map((point) => {
    if (point.flow != null) cum += point.flow;
    return { d: point.d, flow: point.flow, cum, nav: round(point.nav) };
  });
  const d5 = change(flows, 5);
  const f5 = sum(flows, 5);
  return {
    symbol: fund.symbol,
    label: fund.label,
    group: fund.group,
    aum,
    asOf: flows[last]?.d ?? "",
    d1: change(flows, 1),
    f1: sum(flows, 1),
    d5,
    f5,
    d21: change(flows, 21),
    f21: sum(flows, 21),
    signal: readSignal(d5, f5, aum),
    history,
    error: null,
  };
}

async function loadSsga(symbol: string): Promise<Day[]> {
  const url = `https://www.ssga.com/library-content/products/fund-data/etfs/us/navhist-us-en-${symbol.toLowerCase()}.xlsx`;
  const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${symbol} history returned ${response.status}`);
  const rows = readSheet(Buffer.from(await response.arrayBuffer()));
  const header = rows.findIndex((row) => row[0] === "Date" && row[2] === "Shares Outstanding");
  if (header < 0) throw new Error(`${symbol} file had no shares column.`);
  const days: Day[] = [];
  for (const row of rows.slice(header + 1)) {
    const date = isoDate(row[0] ?? "");
    const nav = Number(row[1]);
    const shares = Number(row[2]);
    if (!date || !(nav > 0) || !(shares > 0)) continue;
    days.push({ d: date, nav, shares });
  }
  days.sort((a, b) => a.d.localeCompare(b.d));
  return days.slice(-160);
}

async function loadIshares(id: number): Promise<Day[]> {
  const url = `https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/api/v2/get-product-data?appType=PRODUCT_PAGE&appSubType=ISHARES&targetSite=us-ishares&locale=en_US&portfolioId=${id}&userType=individual&component=fundDownload`;
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`iShares history returned ${response.status}`);
  const body = await response.json() as {
    componentsByNameMap?: {
      fundDownload?: {
        containersByNameMap?: {
          historical?: {
            dataPointsByNameMap?: {
              asof?: { value?: number[] };
              nav?: { value?: Array<number | null> };
              sharesOutstanding?: { value?: Array<number | null> };
            };
          };
        };
      };
    };
  };
  const points = body.componentsByNameMap?.fundDownload?.containersByNameMap?.historical?.dataPointsByNameMap;
  const dates = points?.asof?.value;
  const navs = points?.nav?.value;
  const shares = points?.sharesOutstanding?.value;
  if (!dates || !navs || !shares) throw new Error("iShares file had no shares column.");
  const count = Math.min(dates.length, navs.length, shares.length, 200);
  const days: Day[] = [];
  for (let index = 0; index < count; index += 1) {
    const date = isoNumber(dates[index]);
    const nav = navs[index];
    const share = shares[index];
    if (!date || nav == null || share == null || !(nav > 0) || !(share > 0)) continue;
    days.push({ d: date, nav, shares: share });
  }
  days.sort((a, b) => a.d.localeCompare(b.d));
  return days;
}

function readSignal(ret: number | null, flow: number | null, aum: number): string {
  if (ret == null || flow == null) return "Not enough days";
  const price = Math.abs(ret) < 0.15 ? "flat" : ret > 0 ? "up" : "down";
  const money = Math.abs(flow) < aum * 0.001 ? "flat" : flow > 0 ? "in" : "out";
  if (price === "up" && money === "out") return "Price up, money leaving";
  if (price === "down" && money === "in") return "Price down, money arriving";
  if (price === "up" && money === "in") return "Price up, money arriving";
  if (price === "down" && money === "out") return "Price down, money leaving";
  return "No disagreement";
}

function change(flows: { nav: number }[], days: number): number | null {
  if (flows.length <= days) return null;
  const last = flows[flows.length - 1].nav;
  const base = flows[flows.length - 1 - days].nav;
  if (!(base > 0)) return null;
  return round((last / base - 1) * 100);
}

function sum(flows: { flow: number | null }[], days: number): number | null {
  const slice = flows.slice(-days);
  if (slice.length < days || slice.some((point) => point.flow == null)) return null;
  return slice.reduce((total, point) => total + (point.flow ?? 0), 0);
}

function isoDate(value: string): string | null {
  const match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  const month = match ? MONTHS[match[2]] : undefined;
  if (!match || !month) return null;
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

function isoNumber(value: number): string | null {
  const text = String(value);
  if (!/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function empty(symbol: string, label: string, group: string, error: string): FlowFund {
  return {
    symbol, label, group, aum: null, asOf: "", d1: null, f1: null, d5: null, f5: null, d21: null, f21: null,
    signal: "Missing", history: [], error,
  };
}

async function pool<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
