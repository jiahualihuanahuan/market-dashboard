import { fredObs } from "./fred.server.ts";
import { fetchTextRetry } from "./fetch-util.ts";

export type Tone = "calm" | "caution" | "alarm" | "unknown";

export type StabilityRow = {
  id: string;
  group: "valuation" | "stress";
  label: string;
  value: string;
  asOf: string | null;
  tone: Tone;
  threshold: string;
  note: string;
};

export type StabilityBook = {
  fetchedAt: string;
  headline: string;
  summary: string;
  nearTerm: Tone;
  valuation: Tone;
  rows: StabilityRow[];
};

type Obs = { date: string; value: number };

const SERIES = [
  "VIXCLS",
  "T10Y2Y",
  "T10Y3M",
  "BAMLH0A0HYM2",
  "BAMLH0A3HYC",
  "SAHMREALTIME",
  "UNRATE",
  "ICSA",
] as const;

let cache: { at: number; data: StabilityBook } | null = null;

export async function loadStability(fresh: boolean): Promise<StabilityBook> {
  if (!fresh && cache && Date.now() - cache.at < 30 * 60 * 1000) return cache.data;
  const series = new Map<string, Obs[]>();
  await Promise.all(
    SERIES.map(async (id) => {
      try {
        series.set(id, await fredSeries(id));
      } catch {
        series.set(id, []);
      }
    }),
  );
  const [cape, spx, vixNow, vix3m] = await Promise.all([
    shillerCape().catch(() => null),
    yahooCloses("^GSPC", "1y"),
    yahooCloses("^VIX", "5d"),
    yahooCloses("^VIX3M", "5d"),
  ]);
  const rows = buildRows(series, cape, { spx, vix: vixNow.at(-1) ?? null, vix3m: vix3m.at(-1) ?? null });
  const book: StabilityBook = {
    fetchedAt: new Date().toISOString(),
    headline: headline(rows),
    summary:
      "Valuation can stay expensive for years. Near-term stress is the cluster that usually moves before equities: credit spreads, volatility, and unemployment. One red cell is not a crash call.",
    nearTerm: groupTone(rows, "stress"),
    valuation: groupTone(rows, "valuation"),
    rows,
  };
  cache = { at: Date.now(), data: book };
  return book;
}

type Tape = { spx: number[]; vix: number | null; vix3m: number | null };

export function buildRows(series: Map<string, Obs[]>, cape: { value: number; date: string } | null, tape: Tape = { spx: [], vix: null, vix3m: null }): StabilityRow[] {
  const spxLast = tape.spx.at(-1) ?? null;
  const ma200 = tape.spx.length >= 200 ? tape.spx.slice(-200).reduce((sum, x) => sum + x, 0) / 200 : null;
  const vs200 = spxLast != null && ma200 ? spxLast / ma200 - 1 : null;
  const term = tape.vix != null && tape.vix3m ? tape.vix / tape.vix3m : null;
  const vix = last(series.get("VIXCLS"));
  const curve = last(series.get("T10Y2Y"));
  const curve3m = last(series.get("T10Y3M"));
  const hy = last(series.get("BAMLH0A0HYM2"));
  const ccc = last(series.get("BAMLH0A3HYC"));
  const cccMonth = ago(series.get("BAMLH0A3HYC"), 21);
  const sahm = last(series.get("SAHMREALTIME"));
  const unrate = last(series.get("UNRATE"));
  const claims = last(series.get("ICSA"));
  const cccChange = ccc && cccMonth ? ccc.value - cccMonth.value : null;

  return [
    {
      id: "cape",
      group: "valuation",
      label: "Shiller CAPE",
      value: cape ? cape.value.toFixed(1) : "—",
      asOf: cape?.date ?? null,
      tone: cape == null ? "unknown" : cape.value >= 35 ? "alarm" : cape.value >= 28 ? "caution" : "calm",
      threshold: "Caution above 28 · alarm above 35. Long-run average is about 17. 1999 peak was 44.",
      note: "Price versus 10 years of inflation-adjusted earnings. A poor timer, a good warning that long-run returns from here are thin.",
    },
    {
      id: "vix",
      group: "stress",
      label: "VIX",
      value: vix ? vix.value.toFixed(1) : "—",
      asOf: vix?.date ?? null,
      tone: !vix ? "unknown" : vix.value >= 30 ? "alarm" : vix.value >= 20 ? "caution" : "calm",
      threshold: "Calm under 20 · caution 20–30 · alarm above 30.",
      note: "Implied 30-day S&P volatility. It spikes with the selloff, so a low print is complacency, not an all-clear.",
    },
    {
      id: "hy",
      group: "stress",
      label: "High-yield spread",
      value: hy ? `${hy.value.toFixed(2)}%` : "—",
      asOf: hy?.date ?? null,
      tone: !hy ? "unknown" : hy.value >= 6 ? "alarm" : hy.value >= 4.5 ? "caution" : "calm",
      threshold: "Calm under 4.5% · caution 4.5–6% · distress nearer 8%+.",
      note: "Extra yield on junk bonds over Treasuries. Credit usually widens before equities notice.",
    },
    {
      id: "trend",
      group: "stress",
      label: "S&P 500 vs 200-day line",
      value: vs200 == null ? "—" : `${vs200 >= 0 ? "above" : "below"} ${Math.abs(vs200 * 100).toFixed(1)}%`,
      asOf: null,
      tone: vs200 == null ? "unknown" : vs200 < -0.03 ? "alarm" : vs200 < 0 ? "caution" : "calm",
      threshold: "Above = bull side · just below = testing the line · more than 3% below = broken.",
      note: "Shepherd's bull/bear line. A touch that holds is a pullback; a close well below with credit widening is a regime change.",
    },
    {
      id: "vixterm",
      group: "stress",
      label: "VIX ÷ VIX3M",
      value: term == null ? "—" : term.toFixed(2),
      asOf: null,
      tone: term == null ? "unknown" : term >= 1 ? "alarm" : term >= 0.95 ? "caution" : "calm",
      threshold: "Under 0.95 normal · 0.95–1.00 flattening · 1.00+ inverted.",
      note: "Near-term insurance costing more than 3-month insurance means traders fear the next few weeks. Shanghao's term-structure alert.",
    },
    {
      id: "ccc",
      group: "stress",
      label: "CCC spread",
      value: ccc ? `${ccc.value.toFixed(2)}%${cccChange != null ? ` (${cccChange >= 0 ? "+" : ""}${cccChange.toFixed(2)} pp vs ~1m)` : ""}` : "—",
      asOf: ccc?.date ?? null,
      tone: !ccc ? "unknown" : ccc.value >= 15 || (cccChange != null && cccChange >= 1.5) ? "alarm" : ccc.value >= 10 || (cccChange != null && cccChange >= 0.75) ? "caution" : "calm",
      threshold: "Caution if the weakest borrowers widen 0.75 pp in a month, or the level is above 10%.",
      note: "The junkiest credits. A widening here while broad high-yield stays tight is a late-cycle divergence.",
    },
    {
      id: "curve",
      group: "stress",
      label: "10-year minus 2-year",
      value: curve ? `${curve.value >= 0 ? "+" : ""}${curve.value.toFixed(2)} pp` : "—",
      asOf: curve?.date ?? null,
      tone: !curve ? "unknown" : curve.value < 0 ? "caution" : "calm",
      threshold: "Inversion (below 0) has led recessions. The downturn often arrives after the curve has steepened again.",
      note: "A positive spread is not an all-clear. Watch it next to unemployment, not alone.",
    },
    {
      id: "curve3m",
      group: "stress",
      label: "10-year minus 3-month",
      value: curve3m ? `${curve3m.value >= 0 ? "+" : ""}${curve3m.value.toFixed(2)} pp` : "—",
      asOf: curve3m?.date ?? null,
      tone: !curve3m ? "unknown" : curve3m.value < 0 ? "caution" : "calm",
      threshold: "The NY Fed recession model uses this gap. Negative still means elevated 12-month odds.",
      note: "This spread can stay negative after the 10-year–2-year has already un-inverted.",
    },
    {
      id: "sahm",
      group: "stress",
      label: "Sahm rule",
      value: sahm ? sahm.value.toFixed(2) : "—",
      asOf: sahm?.date ?? null,
      tone: !sahm ? "unknown" : sahm.value >= 0.5 ? "alarm" : sahm.value >= 0.3 ? "caution" : "calm",
      threshold: "Recession signal at +0.50. That is the rise in the 3-month unemployment average over its 12-month low.",
      note: "Designed to confirm a recession as it starts, not to call the stock-market top.",
    },
    {
      id: "unrate",
      group: "stress",
      label: "Unemployment rate",
      value: unrate ? `${unrate.value.toFixed(1)}%` : "—",
      asOf: unrate?.date ?? null,
      tone: !unrate ? "unknown" : unrate.value >= 5 ? "caution" : "calm",
      threshold: "Context for the Sahm rule. A rising rate matters more than the level.",
      note: "US U-3. Canada is on the Macro tab.",
    },
    {
      id: "claims",
      group: "stress",
      label: "Initial jobless claims",
      value: claims ? claims.value.toLocaleString("en-US") : "—",
      asOf: claims?.date ?? null,
      tone: !claims ? "unknown" : claims.value >= 300_000 ? "alarm" : claims.value >= 250_000 ? "caution" : "calm",
      threshold: "Caution above 250k · alarm above 300k on a weekly print.",
      note: "The fastest labor-market tape. One week spikes; the 4-week average is the cleaner read.",
    },
  ];
}

function headline(rows: StabilityRow[]): string {
  const valuation = groupTone(rows, "valuation");
  const stress = groupTone(rows, "stress");
  if (valuation === "alarm" && stress === "calm") return "Expensive, not breaking";
  if (stress === "alarm") return "Stress gauges are flashing";
  if (stress === "caution" || valuation === "caution") return "A few gauges are warm";
  return "No cluster is flashing";
}

function groupTone(rows: StabilityRow[], group: StabilityRow["group"]): Tone {
  const mine = rows.filter((row) => row.group === group && row.tone !== "unknown");
  if (!mine.length) return "unknown";
  if (mine.some((row) => row.tone === "alarm")) return "alarm";
  if (mine.some((row) => row.tone === "caution")) return "caution";
  return "calm";
}

function last(rows: Obs[] | undefined): Obs | null {
  return rows?.length ? rows[rows.length - 1] : null;
}

function ago(rows: Obs[] | undefined, sessions: number): Obs | null {
  if (!rows || rows.length <= sessions) return rows?.[0] ?? null;
  return rows[rows.length - 1 - sessions] ?? null;
}

async function fredSeries(id: string): Promise<Obs[]> {
  return fredObs(id, "", { timeoutMs: 15000 });
}

async function shillerCape(): Promise<{ value: number; date: string } | null> {
  const response = await fetch("https://www.multpl.com/shiller-pe", {
    headers: { "user-agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return null;
  const html = await response.text();
  const value = Number(html.match(/Current Shiller PE Ratio is\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1] ?? "");
  if (!Number.isFinite(value)) return null;
  const dated = html.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/);
  return { value, date: dated?.[0] ?? new Date().toISOString().slice(0, 10) };
}

async function yahooCloses(symbol: string, range: string): Promise<number[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    const json = JSON.parse(await fetchTextRetry(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; MarketDesk/1.0)" }, timeoutMs: 15000 }));
    const closes = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []) as Array<number | null>;
    return closes.filter((x): x is number => typeof x === "number" && x > 0);
  } catch {
    return [];
  }
}
