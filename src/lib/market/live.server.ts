import { equityGauge, } from "@/lib/market/rules";
import { fearLabel } from "@/lib/market/format";
import { spotFor, UNIVERSE, UNIVERSE_BY_SYMBOL } from "@/lib/market/universe";
import type {
  Board,
  ChainRatio,
  CnnFear,
  Curve,
  IndexBreadth,
  InsiderFiling,
  MacroPrint,
  ManagerBook,
  Overlap,
  Quote,
  RatioPoint,
  SmartMoney,
  Spark,
  SpreadPath,
  TenorPoint,
} from "@/lib/market/types";

const YAHOO_UA = "Mozilla/5.0 (compatible; MarketDesk/1.0)";
const SEC_UA = "MarketDesk research research@marketdesk.app";

type Bar = { t: number; c: number; v: number | null };
type Obs = { date: string; value: number };

type Cache<T> = { at: number; data: T };
let boardCache: Cache<Board> | null = null;
let smartCache: Cache<SmartMoney> | null = null;

const TENORS: { id: string; label: string; years: number }[] = [
  { id: "DFF", label: "FF", years: 0 },
  { id: "DGS1MO", label: "1M", years: 1 / 12 },
  { id: "DGS3MO", label: "3M", years: 0.25 },
  { id: "DGS6MO", label: "6M", years: 0.5 },
  { id: "DGS1", label: "1Y", years: 1 },
  { id: "DGS2", label: "2Y", years: 2 },
  { id: "DGS5", label: "5Y", years: 5 },
  { id: "DGS7", label: "7Y", years: 7 },
  { id: "DGS10", label: "10Y", years: 10 },
  { id: "DGS20", label: "20Y", years: 20 },
  { id: "DGS30", label: "30Y", years: 30 },
];

const MANAGERS = [
  { name: "Berkshire Hathaway", who: "Buffett", cik: "0001067983", token: "BERKSHIRE" },
  { name: "Pershing Square", who: "Ackman", cik: "0001336528", token: "PERSHING" },
  { name: "Soros Fund Management", who: "Soros", cik: "0001029160", token: "SOROS" },
  { name: "Appaloosa Management", who: "Tepper", cik: "0001006438", token: "APPALOOSA" },
  { name: "Tiger Global", who: "Coleman", cik: "0001167483", token: "TIGER GLOBAL" },
  { name: "Baupost", who: "Klarman", cik: "0001061768", token: "BAUPOST" },
];

export async function loadBoard(fresh: boolean, live = false): Promise<Board> {
  if (!fresh && boardCache && boardCache.data.ratios && boardCache.data.breadth.indexes?.length && "fearCnn" in boardCache.data && Date.now() - boardCache.at < 8 * 60 * 1000) {
    return boardCache.data;
  }
  const warnings: string[] = [];
  const [quoteRows, fred, fearCrypto, indexes, fearCnn] = await Promise.all([
    mapPool(UNIVERSE, 12, (item) => loadQuote(item.symbol, live).catch(() => null)),
    loadFred().catch((error: unknown) => {
      warnings.push(error instanceof Error ? error.message : "Yield feed failed");
      return null;
    }),
    loadFear().catch(() => null),
    import("./breadth.server").then((mod) => mod.loadIndexBreadth()).catch(() => [] as IndexBreadth[]),
    loadCnn().catch(() => null),
  ]);

  const raw = quoteRows.filter((row): row is RawQuote => row != null);
  if (raw.length < 12) throw new Error("Market prices are unavailable right now.");

  const bySymbol = new Map(raw.map((row) => [row.symbol, row]));
  const quotes: Quote[] = [];
  for (const item of UNIVERSE) {
    const row = bySymbol.get(item.symbol);
    if (!row) continue;
    const spotSymbol = spotFor(item.symbol);
    const spot = spotSymbol ? bySymbol.get(spotSymbol) : undefined;
    quotes.push({
      symbol: row.symbol,
      name: item.label || row.name,
      price: round(row.price),
      d1: row.d1,
      w1: row.w1,
      m1: row.m1,
      y1: row.y1,
      high52: row.high52,
      low52: row.low52,
      volume: row.volume,
      avgVol20: row.avgVol20,
      spark: row.spark,
      divergence: spot ? ratioZ(spot.bars, row.bars) : null,
    });
  }

  const equities = quotes.filter((quote) => UNIVERSE_BY_SYMBOL.get(quote.symbol)?.group === "equity");
  let up = 0;
  let down = 0;
  let flat = 0;
  let nearHigh = 0;
  let nearLow = 0;
  for (const quote of equities) {
    if (quote.d1 == null || Math.abs(quote.d1) < 0.05) flat += 1;
    else if (quote.d1 > 0) up += 1;
    else down += 1;
    if (quote.high52 && quote.price >= quote.high52 * 0.99) nearHigh += 1;
    if (quote.low52 && quote.price <= quote.low52 * 1.01) nearLow += 1;
  }

  const spxBreadth = indexes.find((row) => row.symbol === "^GSPC" && row.covered >= 400);
  const breadth: Board["breadth"] = spxBreadth
    ? {
        up: spxBreadth.up,
        down: spxBreadth.down,
        flat: spxBreadth.flat,
        nearHigh: 0,
        nearLow: 0,
        universe: spxBreadth.covered,
        source: "spx",
        indexes,
      }
    : { up, down, flat, nearHigh, nearLow, universe: equities.length, source: "sample", indexes };

  const spx = quotes.find((quote) => quote.symbol === "^GSPC");
  const vix = quotes.find((quote) => quote.symbol === "^VIX");
  const spy = quotes.find((quote) => quote.symbol === "SPY");
  let fearEquity: Board["fearEquity"] = null;
  if (vix && spx && breadth.universe) {
    const adv = (breadth.up / breadth.universe) * 100;
    const dist = spx.high52 ? spx.price / spx.high52 - 1 : 0;
    const value = equityGauge(vix.price, adv, dist);
    fearEquity = { value, label: fearLabel(value) };
  }

  let crossCheck = "SPY was not available to cross-check the S&P 500.";
  if (spx?.d1 != null && spy?.d1 != null) {
    const gap = Math.abs(spx.d1 - spy.d1);
    const sign = spx.d1 === 0 || spy.d1 === 0 || Math.sign(spx.d1) === Math.sign(spy.d1);
    crossCheck = sign && gap < 0.35
      ? `S&P 500 ${fmtSigned(spx.d1)} and SPY ${fmtSigned(spy.d1)} agree. Same feed, not a second vendor.`
      : `S&P 500 ${fmtSigned(spx.d1)} vs SPY ${fmtSigned(spy.d1)}. Treat the index print as unverified.`;
  }

  const asOf = live
    ? etDate(Math.floor(Date.now() / 1000))
    : spx?.spark.at(-1)?.d ?? raw[0]?.spark.at(-1)?.d ?? new Date().toISOString().slice(0, 10);
  const curves = fred?.curves ?? [];
  const months = fred?.months ?? [];
  const board: Board = {
    asOf,
    fetchedAt: new Date().toISOString(),
    live,
    quotes,
    breadth,
    curves,
    months,
    spreadPath: fred?.spreadPath ?? [],
    ratios: chainRatios(bySymbol),
    t10y2y: fred?.t10y2y ?? null,
    t10y3m: fred?.t10y3m ?? null,
    hyOas: fred?.hyOas ?? null,
    hyAsOf: fred?.hyAsOf ?? null,
    ted: fred?.ted ?? null,
    yieldVol: fred?.yieldVol ?? null,
    real10: fred?.real10 ?? null,
    fearCrypto,
    fearEquity,
    fearCnn,
    crossCheck,
    macro: fred?.macro ?? [],
    warnings,
  };
  boardCache = { at: Date.now(), data: board };
  return board;
}

export async function loadSmartMoney(fresh: boolean): Promise<SmartMoney> {
  if (!fresh && smartCache && Date.now() - smartCache.at < 6 * 60 * 60 * 1000) return smartCache.data;
  const [books, insiders] = await Promise.all([
    mapPool(MANAGERS, 2, (manager) => loadManager(manager)),
    loadInsiders().catch(() => [] as InsiderFiling[]),
  ]);
  const overlap = buildOverlap(books);
  const data: SmartMoney = {
    books,
    insiders,
    overlap,
    note: "13Fs are quarterly and land about 45 days after the quarter. Form 4s are the closer-to-now insider prints. Read this weekly, not tick by tick.",
  };
  smartCache = { at: Date.now(), data };
  return data;
}

type RawQuote = {
  symbol: string;
  name: string;
  price: number;
  d1: number | null;
  w1: number | null;
  m1: number | null;
  y1: number | null;
  high52: number | null;
  low52: number | null;
  volume: number | null;
  avgVol20: number | null;
  spark: Spark[];
  bars: Bar[];
};

async function loadQuote(symbol: string, live = false): Promise<RawQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&includeAdjustedClose=true`;
  const json = await fetchJson(url, YAHOO_UA, 14000);
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const timestamps = result.timestamp as number[] | undefined;
  const quote = result.indicators?.quote?.[0];
  const adj = result.indicators?.adjclose?.[0]?.adjclose as Array<number | null> | undefined;
  if (!timestamps || !quote) return null;
  const bars: Bar[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = adj?.[i] ?? quote.close?.[i];
    if (!timestamps[i] || close == null || !Number.isFinite(close) || close <= 0) continue;
    const volume = quote.volume?.[i];
    bars.push({
      t: timestamps[i],
      c: close,
      v: typeof volume === "number" && Number.isFinite(volume) ? volume : null,
    });
  }
  const meta = result.meta ?? {};
  const livePrice = live ? numberOrNull(meta.regularMarketPrice) : null;
  let done = live ? bars : completedBars(bars);
  if (livePrice && livePrice > 0) {
    const today = etDate(Math.floor(Date.now() / 1000));
    const last = done[done.length - 1];
    const volume = numberOrNull(meta.regularMarketVolume);
    const bar = {
      t: Math.floor(Date.now() / 1000),
      c: livePrice,
      v: volume ?? last?.v ?? null,
    };
    done = last && etDate(last.t) === today ? done.slice(0, -1).concat({ ...last, c: livePrice, v: bar.v }) : done.concat(bar);
  }
  if (done.length < 2) return null;
  const last = done[done.length - 1];
  const vols = done.slice(-20).map((bar) => bar.v).filter((v): v is number => v != null && v > 0);
  const change = live ? numberOrNull(meta.regularMarketChangePercent) : null;
  const prior = numberOrNull(meta.previousClose);
  const d1 = live
    ? change ?? (prior && prior > 0 ? round((last.c / prior - 1) * 100) : horizonFromLast(done, 1))
    : horizonFromLast(done, 1);
  return {
    symbol,
    name: String(meta.shortName || meta.longName || symbol),
    price: last.c,
    d1,
    w1: horizon(done, 7),
    m1: horizon(done, 30),
    y1: horizon(done, 365),
    high52: numberOrNull(meta.fiftyTwoWeekHigh),
    low52: numberOrNull(meta.fiftyTwoWeekLow),
    volume: last.v,
    avgVol20: vols.length ? Math.round(vols.reduce((sum, v) => sum + v, 0) / vols.length) : null,
    spark: downsample(
      done.map((bar) => ({ d: etDate(bar.t), v: round(bar.c, 4) })),
      36,
    ),
    bars: done,
  };
}

function horizonFromLast(bars: Bar[], sessions: number): number | null {
  if (bars.length <= sessions) return null;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 1 - sessions];
  if (!prev || prev.c <= 0) return null;
  return round((last.c / prev.c - 1) * 100);
}

function horizon(bars: Bar[], days: number): number | null {
  const last = bars[bars.length - 1];
  const target = last.t - days * 86400;
  let prev: Bar | null = null;
  for (const bar of bars) {
    if (bar.t <= target) prev = bar;
    else break;
  }
  if (!prev) {
    const first = bars[0];
    const span = first ? last.t - first.t : 0;
    if (first && span >= (days - 25) * 86400 && first.t < last.t) prev = first;
  }
  if (!prev || prev.c <= 0 || prev.t === last.t) return null;
  return round((last.c / prev.c - 1) * 100);
}

function completedBars(bars: Bar[]): Bar[] {
  if (bars.length < 3) return bars;
  const last = bars[bars.length - 1];
  if (etDate(last.t) !== etDate(Math.floor(Date.now() / 1000))) return bars;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  if (hour * 60 + minute < 16 * 60 + 20) return bars.slice(0, -1);
  return bars;
}

function ratioZ(spot: Bar[], name: Bar[]): number | null {
  const spotByDay = new Map(spot.map((bar) => [etDate(bar.t), bar.c]));
  const ratios: number[] = [];
  for (const bar of name) {
    const base = spotByDay.get(etDate(bar.t));
    if (base && base > 0) ratios.push(bar.c / base);
  }
  const window = ratios.slice(-60);
  if (window.length < 30) return null;
  const avg = window.reduce((sum, value) => sum + value, 0) / window.length;
  const variance = window.reduce((sum, value) => sum + (value - avg) ** 2, 0) / window.length;
  const sd = Math.sqrt(variance);
  if (sd < 1e-8) return null;
  return round((window[window.length - 1] - avg) / sd);
}

const RATIO_PAIRS: { chain: string; spot: string; etf: string }[] = [
  { chain: "gold", spot: "GC=F", etf: "GDX" },
  { chain: "silver", spot: "SI=F", etf: "SIL" },
  { chain: "copper", spot: "HG=F", etf: "COPX" },
  { chain: "energy", spot: "CL=F", etf: "XLE" },
  { chain: "uranium", spot: "SRUUF", etf: "URNM" },
];

function chainRatios(bySymbol: Map<string, RawQuote>): ChainRatio[] {
  const out: ChainRatio[] = [];
  for (const pair of RATIO_PAIRS) {
    const spot = bySymbol.get(pair.spot);
    const etf = bySymbol.get(pair.etf);
    if (!spot || !etf) continue;
    const series = ratioSeries(spot.bars, etf.bars);
    if (!series) continue;
    out.push({
      chain: pair.chain,
      spot: pair.spot,
      spotLabel: UNIVERSE_BY_SYMBOL.get(pair.spot)?.label ?? pair.spot,
      etf: pair.etf,
      etfLabel: UNIVERSE_BY_SYMBOL.get(pair.etf)?.label ?? pair.etf,
      gap: series.gap,
      z: series.z,
      band: series.band,
      points: series.points,
    });
  }
  return out;
}

function ratioSeries(spotBars: Bar[], etfBars: Bar[]): Omit<ChainRatio, "chain" | "spot" | "spotLabel" | "etf" | "etfLabel"> | null {
  const spotByDay = new Map(spotBars.map((bar) => [etDate(bar.t), bar.c]));
  const aligned: { d: string; spot: number; ratio: number }[] = [];
  for (const bar of etfBars) {
    const spot = spotByDay.get(etDate(bar.t));
    if (!spot || spot <= 0) continue;
    aligned.push({ d: etDate(bar.t), spot, ratio: bar.c / spot });
  }
  if (aligned.length < 30) return null;
  const window = aligned.slice(-60);
  const mean = window.reduce((sum, row) => sum + row.ratio, 0) / window.length;
  const variance = window.reduce((sum, row) => sum + (row.ratio - mean) ** 2, 0) / window.length;
  const sd = Math.sqrt(variance);
  if (mean <= 0 || sd < 1e-10) return null;
  const last = aligned[aligned.length - 1];
  const points = downsample(
    aligned.map((row) => ({
      d: row.d,
      spot: round(row.spot, row.spot >= 100 ? 2 : 4),
      gap: round(((row.ratio / mean) - 1) * 100),
    })),
    48,
  );
  return {
    gap: round(((last.ratio / mean) - 1) * 100),
    z: round((last.ratio - mean) / sd),
    band: round((1.5 * sd / mean) * 100),
    points,
  };
}

async function loadCnn(): Promise<CnnFear | null> {
  const response = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; MarketDesk/1.0)",
      accept: "application/json",
      referer: "https://www.cnn.com/markets/fear-and-greed",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return null;
  const json = await response.json();
  const headline = json?.fear_and_greed;
  const score = Number(headline?.score);
  if (!Number.isFinite(score)) return null;
  const ids = [
    "market_momentum_sp500",
    "stock_price_strength",
    "stock_price_breadth",
    "put_call_options",
    "market_volatility_vix",
    "junk_bond_demand",
    "safe_haven_demand",
  ];
  const parts = ids.flatMap((id) => {
    const row = json?.[id];
    const partScore = Number(row?.score);
    if (!Number.isFinite(partScore)) return [];
    return [{ id, score: Math.round(partScore), rating: titleCase(String(row.rating || "")) }];
  });
  const history = downsample(
    ((json?.fear_and_greed_historical?.data ?? []) as { x?: number; y?: number }[])
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => ({ d: new Date(Number(point.x)).toISOString().slice(0, 10), v: Math.round(Number(point.y)) })),
    40,
  );
  return {
    score: Math.round(score),
    rating: titleCase(String(headline.rating || fearLabel(score))),
    previousClose: finite(headline.previous_close),
    week: finite(headline.previous_1_week),
    month: finite(headline.previous_1_month),
    year: finite(headline.previous_1_year),
    asOf: String(headline.timestamp || ""),
    history,
    parts,
  };
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

async function loadFear(): Promise<{ value: number; label: string } | null> {
  const json = await fetchJson("https://api.alternative.me/fng/?limit=1", YAHOO_UA, 8000);
  const row = json?.data?.[0];
  const value = Number(row?.value);
  if (!Number.isFinite(value)) return null;
  return { value, label: String(row.value_classification || fearLabel(value)) };
}

type FredPack = {
  curves: Curve[];
  months: Curve[];
  spreadPath: SpreadPath[];
  t10y2y: number | null;
  t10y3m: number | null;
  hyOas: number | null;
  hyAsOf: string | null;
  ted: { value: number; date: string } | null;
  yieldVol: number | null;
  real10: number | null;
  macro: MacroPrint[];
};

async function loadFred(): Promise<FredPack> {
  const ids = [
    ...TENORS.map((tenor) => tenor.id),
    "T10Y2Y",
    "T10Y3M",
    "BAMLH0A0HYM2",
    "TEDRATE",
    "DFII10",
    "CPIAUCSL",
    "CPILFESL",
    "UNRATE",
    "PAYEMS",
    "PCEPI",
    "PCEPILFE",
    "A191RL1Q225SBEA",
    "RSAFS",
    "PPIACO",
    "LRUNTTTTCAM156S",
    "CPALTT01CAM659N",
  ];
  const series = new Map<string, Obs[]>();
  await mapPool(ids, 8, async (id) => {
    try {
      const start = id.startsWith("DGS") || id === "DFF" || id === "TEDRATE" ? "1999-01-01" : "2016-01-01";
      series.set(id, await fredSeries(id, start));
    } catch {
      series.set(id, []);
    }
  });

  const anchor = series.get("DGS10") ?? [];
  if (anchor.length < 5) throw new Error("Treasury yields did not load.");
  const latest = anchor[anchor.length - 1].date;
  const curveSpecs = [
    { id: "now", label: "Latest", date: latest },
    { id: "w1", label: "1 week", date: addDays(latest, -7) },
    { id: "m1", label: "1 month", date: addDays(latest, -30) },
    { id: "y1", label: "1 year", date: addDays(latest, -365) },
    { id: "y2000", label: "Mar 2000", date: "2000-03-24" },
    { id: "y2007", label: "Jun 2007", date: "2007-06-12" },
    { id: "y2019", label: "Aug 2019", date: "2019-08-27" },
  ];
  const curves = curveSpecs
    .map((spec) => ({ id: spec.id, label: spec.label, points: curveOn(series, spec.date) }))
    .filter((curve) => curve.points.length >= 6);

  const monthDates = new Map<string, string>();
  for (const obs of anchor) {
    if (obs.date >= "2018-01-01") monthDates.set(obs.date.slice(0, 7), obs.date);
  }
  const months = [...monthDates.entries()].map(([id, date]) => ({
    id,
    label: id,
    points: curveOn(series, date),
  }));

  const t10y2ySeries = series.get("T10Y2Y") ?? [];
  const hySeries = series.get("BAMLH0A0HYM2") ?? [];
  const realSeries = series.get("DFII10") ?? [];
  const pathMonths = new Map<string, string>();
  for (const obs of t10y2ySeries) {
    if (obs.date >= "2018-01-01") pathMonths.set(obs.date.slice(0, 7), obs.date);
  }
  const spreadPath = [...pathMonths.entries()].map(([, date]) => ({
    d: date,
    curve: valueOn(t10y2ySeries, date, 10),
    hy: valueOn(hySeries, date, 10),
    real: valueOn(realSeries, date, 10),
  }));

  const tedSeries = series.get("TEDRATE") ?? [];
  const tedLast = tedSeries.at(-1);
  const hyLast = hySeries.at(-1);
  const realLast = realSeries.at(-1);
  const dgs10 = series.get("DGS10") ?? [];
  const changes: number[] = [];
  const recent = dgs10.slice(-80);
  for (let i = 1; i < recent.length; i += 1) changes.push(recent[i].value - recent[i - 1].value);
  const yieldVol = changes.length > 20
    ? round(Math.sqrt(changes.reduce((sum, value) => sum + value ** 2, 0) / changes.length) * Math.sqrt(252) * 100, 0)
    : null;

  return {
    curves,
    months,
    spreadPath,
    t10y2y: t10y2ySeries.at(-1)?.value ?? null,
    t10y3m: series.get("T10Y3M")?.at(-1)?.value ?? null,
    hyOas: hyLast?.value ?? null,
    hyAsOf: hyLast?.date ?? null,
    ted: tedLast ? { value: tedLast.value, date: tedLast.date } : null,
    yieldVol,
    real10: realLast?.value ?? null,
    macro: buildMacro(series, latest),
  };
}

function curveOn(series: Map<string, Obs[]>, date: string): TenorPoint[] {
  const points: TenorPoint[] = [];
  for (const tenor of TENORS) {
    const value = valueOn(series.get(tenor.id) ?? [], date, 12);
    if (value == null) continue;
    points.push({ label: tenor.label, years: tenor.years, value: round(value) });
  }
  return points;
}

function buildMacro(series: Map<string, Obs[]>, today: string): MacroPrint[] {
  const nfp = nextFirstFriday(today);
  const specs: {
    id: string;
    region: "US" | "Canada";
    name: string;
    kind: "mom" | "level" | "diff";
    cadence: string;
    next: string;
    digits?: number;
    suffix?: string;
  }[] = [
    { id: "PAYEMS", region: "US", name: "Nonfarm payrolls", kind: "diff", cadence: "Monthly, first Friday", next: nfp, digits: 0, suffix: "k" },
    { id: "UNRATE", region: "US", name: "Unemployment", kind: "level", cadence: "With the payrolls report", next: nfp, suffix: "%" },
    { id: "CPIAUCSL", region: "US", name: "CPI", kind: "mom", cadence: "Monthly, mid-month", next: "Next mid-month window" },
    { id: "CPILFESL", region: "US", name: "Core CPI", kind: "mom", cadence: "With CPI", next: "Next mid-month window" },
    { id: "PPIACO", region: "US", name: "PPI", kind: "mom", cadence: "Monthly", next: "Next mid-month window" },
    { id: "PCEPI", region: "US", name: "PCE price index", kind: "mom", cadence: "Monthly, after CPI", next: "Late-month window" },
    { id: "PCEPILFE", region: "US", name: "Core PCE", kind: "mom", cadence: "Fed's preferred gauge", next: "Late-month window" },
    { id: "A191RL1Q225SBEA", region: "US", name: "Real GDP", kind: "level", cadence: "Quarterly, annualized", next: "Next GDP window", suffix: "%" },
    { id: "RSAFS", region: "US", name: "Retail sales", kind: "mom", cadence: "Monthly", next: "Next mid-month window" },
    { id: "LRUNTTTTCAM156S", region: "Canada", name: "Unemployment", kind: "level", cadence: "Labour Force Survey", next: "Early-month window", suffix: "%" },
    { id: "CPALTT01CAM659N", region: "Canada", name: "CPI, year over year", kind: "level", cadence: "Monthly", next: "Third-week window", suffix: "%" },
  ];
  const prints: MacroPrint[] = [];
  for (const spec of specs) {
    const obs = series.get(spec.id) ?? [];
    if (obs.length < 2) continue;
    const last = obs[obs.length - 1];
    const ageDays = (Date.parse(today) - Date.parse(last.date)) / 86400000;
    if (ageDays > 120) continue;
    const prev = obs[obs.length - 2];
    const before = obs[obs.length - 3];
    let actual = "";
    let prior = "";
    if (spec.kind === "mom") {
      actual = fmtMom(last.value, prev.value);
      prior = before ? fmtMom(prev.value, before.value) : "—";
    } else if (spec.kind === "diff") {
      actual = `${signed(round(last.value - prev.value, spec.digits ?? 0))}${spec.suffix ?? ""}`;
      prior = before ? `${signed(round(prev.value - before.value, spec.digits ?? 0))}${spec.suffix ?? ""}` : "—";
    } else {
      actual = `${round(last.value, spec.digits ?? 1)}${spec.suffix ?? ""}`;
      prior = `${round(prev.value, spec.digits ?? 1)}${spec.suffix ?? ""}`;
    }
    prints.push({
      region: spec.region,
      name: spec.name,
      actual,
      prior,
      asOf: last.date,
      cadence: spec.cadence,
      next: spec.next,
    });
  }
  return prints;
}

async function fredSeries(id: string, start: string): Promise<Obs[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`;
  const text = await fetchText(url, YAHOO_UA, 20000);
  const lines = text.trim().split(/\r?\n/);
  const out: Obs[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const [date, raw] = lines[i].split(",");
    if (!date || !raw || raw === ".") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out.push({ date, value });
  }
  return out;
}

async function loadManager(manager: (typeof MANAGERS)[number]): Promise<ManagerBook> {
  const empty: ManagerBook = {
    name: manager.name,
    who: manager.who,
    filed: "",
    period: "",
    url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${manager.cik}&type=13F-HR&dateb=&owner=include&count=10`,
    holdings: [],
    error: null,
  };
  try {
    const json = await fetchJson(`https://data.sec.gov/submissions/CIK${manager.cik}.json`, SEC_UA, 20000);
    if (!String(json?.name ?? "").toUpperCase().includes(manager.token)) {
      return { ...empty, error: "Filer name did not match." };
    }
    const recent = json.filings?.recent;
    const forms: string[] = recent?.form ?? [];
    let best = -1;
    for (let i = 0; i < forms.length; i += 1) {
      if (forms[i] !== "13F-HR" && forms[i] !== "13F-HR/A") continue;
      if (best < 0) {
        best = i;
        continue;
      }
      const date = recent.filingDate[i];
      const bestDate = recent.filingDate[best];
      if (date > bestDate || (date === bestDate && forms[i].endsWith("/A"))) best = i;
    }
    if (best < 0) return { ...empty, error: "No 13F on file." };
    const acc = String(recent.accessionNumber[best]);
    const cik = String(Number(manager.cik));
    const folder = acc.replace(/-/g, "");
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${folder}/index.json`;
    const page = `https://www.sec.gov/Archives/edgar/data/${cik}/${folder}/${acc}-index.html`;
    const index = await fetchJson(indexUrl, SEC_UA, 20000);
    const items = (index?.directory?.item ?? []) as { name: string; size?: string }[];
    const xmls = items
      .filter((item) => item.name.toLowerCase().endsWith(".xml") && !item.name.toLowerCase().includes("primary"))
      .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
    let holdings: ManagerBook["holdings"] = [];
    for (const item of xmls.slice(0, 3)) {
      const xml = await fetchText(`https://www.sec.gov/Archives/edgar/data/${cik}/${folder}/${item.name}`, SEC_UA, 20000);
      if (!xml.includes("infoTable") && !xml.includes("nameOfIssuer")) continue;
      holdings = parseInfoTable(xml);
      if (holdings.length) break;
    }
    return {
      ...empty,
      filed: String(recent.filingDate[best]),
      period: String(recent.reportDate?.[best] ?? ""),
      url: page,
      holdings: holdings.slice(0, 8),
      error: holdings.length ? null : "Filing found, holdings table did not parse.",
    };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : "Filing lookup failed." };
  }
}

function parseInfoTable(xml: string): ManagerBook["holdings"] {
  const blocks = xml.split(/<infoTable>/i).slice(1);
  const totals = new Map<string, { value: number; shares: number }>();
  for (const block of blocks) {
    const issuer = decodeXml(/<nameOfIssuer>([^<]+)/i.exec(block)?.[1] ?? "").trim();
    const title = /<titleOfClass>([^<]+)/i.exec(block)?.[1] ?? "";
    const value = Number(/<value>([^<]+)/i.exec(block)?.[1] ?? "");
    const shares = Number(/<sshPrnamt>([^<]+)/i.exec(block)?.[1] ?? "");
    if (!issuer || !Number.isFinite(value)) continue;
    if (/CALL|PUT|WARRANT|RIGHT/i.test(title)) continue;
    const key = issuer.replace(/\s+/g, " ").toUpperCase();
    const prev = totals.get(key) ?? { value: 0, shares: 0 };
    totals.set(key, {
      value: prev.value + value,
      shares: prev.shares + (Number.isFinite(shares) ? shares : 0),
    });
  }
  return [...totals.entries()]
    .map(([issuer, row]) => ({ issuer, value: row.value, shares: row.shares }))
    .sort((a, b) => b.value - a.value);
}

function buildOverlap(books: ManagerBook[]): Overlap[] {
  const map = new Map<string, Overlap>();
  for (const book of books) {
    for (const holding of book.holdings) {
      const key = holding.issuer.toUpperCase();
      const row = map.get(key) ?? { issuer: holding.issuer, managers: [], value: 0 };
      if (!row.managers.includes(book.name)) row.managers.push(book.name);
      row.value += holding.value;
      map.set(key, row);
    }
  }
  return [...map.values()]
    .filter((row) => row.managers.length >= 2)
    .sort((a, b) => b.managers.length - a.managers.length || b.value - a.value)
    .slice(0, 12);
}

async function loadInsiders(): Promise<InsiderFiling[]> {
  const end = new Date();
  const start = new Date(Date.now() - 6 * 86400000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const url = `https://efts.sec.gov/LATEST/search-index?forms=4&startdt=${iso(start)}&enddt=${iso(end)}&from=0&size=12`;
  const json = await fetchJson(url, SEC_UA, 15000);
  const hits = json?.hits?.hits ?? [];
  return hits.map((hit: { _source?: Record<string, unknown> }) => {
    const source = hit._source ?? {};
    const names = ((source.display_names as string[]) ?? []).map((name) =>
      name.replace(/\s*\(CIK[^)]*\)/i, "").replace(/\s+/g, " ").trim(),
    );
    const ciks = (source.ciks as string[]) ?? [];
    const adsh = String(source.adsh ?? "");
    const cik = String(Number(ciks[1] || ciks[0] || "0"));
    const folder = adsh.replace(/-/g, "");
    return {
      filed: String(source.file_date ?? ""),
      names: names.filter(Boolean),
      url: adsh
        ? `https://www.sec.gov/Archives/edgar/data/${cik}/${folder}/${adsh}-index.html`
        : "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=include",
    };
  });
}

function valueOn(series: Obs[], date: string, maxGap: number): number | null {
  let best: Obs | null = null;
  for (const obs of series) {
    if (obs.date <= date) best = obs;
    else break;
  }
  if (!best) return null;
  const gap = (Date.parse(date) - Date.parse(best.date)) / 86400000;
  if (gap > maxGap) return null;
  return best.value;
}

function nextFirstFriday(fromIso: string): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  const from = Date.UTC(y, m - 1, d);
  for (let step = 0; step < 3; step += 1) {
    const cursor = new Date(Date.UTC(y, m - 1 + step, 1));
    while (cursor.getUTCDay() !== 5) cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getTime() >= from) return cursor.toISOString().slice(0, 10);
  }
  return fromIso;
}

async function fetchJson(url: string, ua: string, ms: number): Promise<any> {
  const text = await fetchText(url, ua, ms);
  return JSON.parse(text);
}

async function fetchText(url: string, ua: string, ms: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ua, Accept: "application/json,text/csv,text/plain,*/*" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
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

function downsample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const out: T[] = [];
  const step = (items.length - 1) / (count - 1);
  for (let i = 0; i < count; i += 1) out.push(items[Math.round(i * step)]);
  return out;
}

function etDate(unix: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unix * 1000));
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function round(n: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fmtMom(current: number, previous: number): string {
  if (!previous) return "—";
  return `${signed(round((current / previous - 1) * 100))}%`;
}

function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${n}`;
}

function fmtSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function decodeXml(value: string): string {
  return value
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'");
}
