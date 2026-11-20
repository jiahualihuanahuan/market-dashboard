import { drawdown, lastReturn, pairZ, returnZ, sma, smaSlope, studyAnalogs, studyLine } from "./math.ts";
import { annualVol, distributionCut, maxDrawdown, totalReturnIndex, ttmYield, windowStart } from "./income.ts";
import { MAP, RS_PAIRS } from "./universe.ts";
import type { Alert, DeskData, IncomeRow, MapRow, Obs, RiskRow, RsRow, Series, Tone } from "./types.ts";

export const VOL_CEILING = 0.2;
export const VOL_WARN = 0.18;

type Inputs = { series: Map<string, Series>; fred: Map<string, Obs[]>; income: string[]; now: number; missing?: string[] };

const pct = (x: number | null | undefined, d = 1) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const num = (x: number | null | undefined, d = 2) => (x == null ? "—" : x.toFixed(d));

function closes(s: Series | undefined): number[] {
  return s ? s.bars.map((b) => b.c) : [];
}

/** Value now and its change over ~`days` calendar days (FRED observations). */
export function levelAndChange(obs: Obs[] | undefined, days: number): { value: number | null; change: number | null; asOf: string | null } {
  if (!obs?.length) return { value: null, change: null, asOf: null };
  const last = obs[obs.length - 1]!;
  const cut = new Date(`${last.date}T00:00:00Z`);
  cut.setUTCDate(cut.getUTCDate() - days);
  const iso = cut.toISOString().slice(0, 10);
  let past: Obs | undefined;
  for (let i = obs.length - 1; i >= 0; i--) {
    if (obs[i]!.date <= iso) {
      past = obs[i];
      break;
    }
  }
  return { value: last.value, change: past ? last.value - past.value : null, asOf: last.date };
}

export function mapRow(symbol: string, name: string, s: Series): MapRow {
  const c = closes(s);
  const ma200 = sma(c, 200);
  const last = c[c.length - 1]!;
  return {
    symbol,
    name,
    last,
    d1: lastReturn(c, 1),
    m1: lastReturn(c, 21),
    fromHigh: drawdown(c, 252),
    vs200: ma200 ? last / ma200 - 1 : null,
    above200: ma200 ? last >= ma200 : null,
    slope20: smaSlope(c, 20, 5),
    spark: c.slice(-60).map((x) => Math.round(x * 100) / 100),
  };
}

export function incomeRow(s: Series): IncomeRow {
  const start = windowStart(s.bars, 365);
  const year = s.bars.slice(start);
  const tr = totalReturnIndex(year, s.divs);
  const enough = s.bars[0]!.date <= year[0]!.date && year.length > 200;
  const vol = annualVol(tr);
  return {
    symbol: s.symbol,
    name: s.name,
    currency: s.currency,
    last: s.bars[s.bars.length - 1]!.c,
    ttmYield: ttmYield(s.bars, s.divs),
    tr1y: enough ? tr[tr.length - 1]! / tr[0]! - 1 : null,
    pr1y: enough ? year[year.length - 1]!.c / year[0]!.c - 1 : null,
    vol1y: vol,
    mdd1y: maxDrawdown(tr),
    lastDist: s.divs[s.divs.length - 1] ?? null,
    cut: distributionCut(s.divs),
    volFlag: vol == null ? "unknown" : vol > VOL_CEILING ? "alarm" : vol > VOL_WARN ? "caution" : "calm",
  };
}

const worst = (tones: Tone[]): Tone => (tones.includes("alarm") ? "alarm" : tones.includes("caution") ? "caution" : tones.every((t) => t === "unknown") ? "unknown" : "calm");

export function buildDesk({ series, fred, income, now, missing = [] }: Inputs): DeskData {
  const get = (s: string) => series.get(s);
  const map = MAP.flatMap((m) => (get(m.symbol) ? [mapRow(m.symbol, m.name, get(m.symbol)!)] : []));
  const alerts: Alert[] = [];
  const risk: RiskRow[] = [];

  // --- Credit: Shepherd's ETF price proxy + Shanghao's OAS jump rules (one card, no repeats elsewhere).
  const hygDd = drawdown(closes(get("HYG")), 60);
  const jnkDd = drawdown(closes(get("JNK")), 60);
  const proxyDd = hygDd == null ? jnkDd : jnkDd == null ? hygDd : Math.min(hygDd, jnkDd);
  const proxyTone: Tone = proxyDd == null ? "unknown" : proxyDd <= -0.05 ? "alarm" : proxyDd <= -0.025 ? "caution" : "calm";
  risk.push({ id: "credit-proxy", group: "Credit", label: "Junk-bond ETFs from 60-day high", value: pct(proxyDd), detail: "HYG / JNK. Below −2.5% = watch, −5% = stress", tone: proxyTone, asOf: get("HYG")?.bars.at(-1)?.date ?? null });
  const hy = levelAndChange(fred.get("BAMLH0A0HYM2"), 28);
  const hyTone: Tone = hy.value == null ? "unknown" : (hy.change ?? 0) >= 0.75 ? "alarm" : hy.value >= 5 || (hy.change ?? 0) >= 0.4 ? "caution" : "calm";
  risk.push({ id: "hy-oas", group: "Credit", label: "High-yield spread", value: hy.value == null ? "—" : `${num(hy.value)}%`, detail: `4-week change ${hy.change == null ? "—" : `${hy.change >= 0 ? "+" : ""}${num(hy.change)}pp`}. Alert at +0.75pp`, tone: hyTone, asOf: hy.asOf });
  if ((hy.change ?? 0) >= 0.75) alerts.push({ id: "hy_oas_jump", severity: "high", text: `High-yield spread widened ${num(hy.change)}pp in 4 weeks`, source: "Shanghao" });
  const ccc = levelAndChange(fred.get("BAMLH0A3HYC"), 28);
  const cccTone: Tone = ccc.value == null ? "unknown" : (ccc.change ?? 0) >= 1.5 ? "alarm" : (ccc.change ?? 0) >= 0.75 ? "caution" : "calm";
  risk.push({ id: "ccc-oas", group: "Credit", label: "CCC spread (feels stress first)", value: ccc.value == null ? "—" : `${num(ccc.value)}%`, detail: `4-week change ${ccc.change == null ? "—" : `${ccc.change >= 0 ? "+" : ""}${num(ccc.change)}pp`}. Alert at +1.5pp`, tone: cccTone, asOf: ccc.asOf });
  if ((ccc.change ?? 0) >= 1.5) alerts.push({ id: "ccc_oas_jump", severity: "high", text: `CCC spread widened ${num(ccc.change)}pp in 4 weeks`, source: "Shanghao" });

  // --- Volatility
  const vix = closes(get("^VIX")).at(-1) ?? null;
  const vix3m = closes(get("^VIX3M")).at(-1) ?? null;
  const term = vix != null && vix3m ? vix / vix3m : null;
  const volTone: Tone = vix == null ? "unknown" : (term ?? 0) >= 1 || vix >= 30 ? "alarm" : vix >= 20 ? "caution" : "calm";
  risk.push({ id: "vix", group: "Volatility", label: "VIX, and VIX ÷ VIX3M", value: vix == null ? "—" : `${num(vix, 1)} · ${term == null ? "—" : num(term)}`, detail: "Ratio ≥ 1.00 = term structure inverted (near-term panic). VIX ≥ 30 = alert", tone: volTone, asOf: get("^VIX")?.bars.at(-1)?.date ?? null });
  if ((term ?? 0) >= 1) alerts.push({ id: "vix_term_inversion", severity: "high", text: `VIX term structure inverted (VIX/VIX3M ${num(term)})`, source: "Shanghao" });
  else if ((vix ?? 0) >= 30) alerts.push({ id: "vix_ge_30", severity: "medium", text: `VIX ${num(vix, 1)} ≥ 30`, source: "Shanghao" });

  // --- Rates
  const ten = levelAndChange(fred.get("DGS10"), 28);
  const curve = levelAndChange(fred.get("T10Y2Y"), 28);
  const rateTone: Tone = ten.value == null ? "unknown" : ten.value >= 5.5 || (ten.change ?? 0) >= 0.4 ? "alarm" : ten.value >= 5 || (ten.change ?? 0) >= 0.25 ? "caution" : "calm";
  risk.push({ id: "us10y", group: "Rates", label: "US 10-year yield", value: ten.value == null ? "—" : `${num(ten.value)}%`, detail: `4-week change ${ten.change == null ? "—" : `${ten.change >= 0 ? "+" : ""}${num(ten.change)}pp`}; 10y−2y ${curve.value == null ? "—" : `${num(curve.value)}pp`}. Alert at 5.5% or +0.40pp`, tone: rateTone, asOf: ten.asOf });
  if ((ten.value ?? 0) >= 5.5) alerts.push({ id: "us10y_ge_5_5", severity: "high", text: `US 10-year ${num(ten.value)}% ≥ 5.5%`, source: "Shanghao" });
  else if ((ten.change ?? 0) >= 0.4) alerts.push({ id: "us10y_fast_rise", severity: "high", text: `US 10-year up ${num(ten.change)}pp in 4 weeks`, source: "Shanghao" });

  // --- Jobs (Sahm-style)
  const un = levelAndChange(fred.get("UNRATE"), 30);
  const sahm = levelAndChange(fred.get("SAHMREALTIME"), 30);
  const jobTone: Tone = un.value == null ? "unknown" : un.value >= 4.6 || (sahm.value ?? 0) >= 0.5 ? "alarm" : un.value >= 4 || (sahm.value ?? 0) >= 0.3 ? "caution" : "calm";
  risk.push({ id: "jobs", group: "Jobs", label: "Unemployment, and Sahm gap", value: un.value == null ? "—" : `${num(un.value, 1)}% · ${sahm.value == null ? "—" : num(sahm.value)}`, detail: "Watch at 4.0%, alert at 4.6% or Sahm ≥ 0.50", tone: jobTone, asOf: un.asOf });
  if ((un.value ?? 0) >= 4.6 || (sahm.value ?? 0) >= 0.5) alerts.push({ id: "jobs", severity: "high", text: `Unemployment ${num(un.value, 1)}%, Sahm gap ${num(sahm.value)}`, source: "Shanghao" });

  // --- Trend / tape alerts (Shepherd line + Shanghao SOX rule)
  const spy = map.find((r) => r.symbol === "SPY");
  const qqq = map.find((r) => r.symbol === "QQQ");
  if (spy?.above200 === false) alerts.push({ id: "spy_below_200", severity: "high", text: `S&P 500 below its 200-day line (${pct(spy.vs200)})`, source: "Shepherd" });
  if (qqq?.above200 === false) alerts.push({ id: "qqq_below_200", severity: "medium", text: `Nasdaq-100 below its 200-day line (${pct(qqq.vs200)})`, source: "Shepherd" });
  const smh5 = lastReturn(closes(get("SMH")), 5);
  if (smh5 != null && smh5 <= -0.08) alerts.push({ id: "sox_weekly_drop", severity: "medium", text: `Semiconductors ${pct(smh5)} in a week`, source: "Shanghao" });
  if (spy?.fromHigh != null && spy.fromHigh <= -0.1) alerts.push({ id: "spx_drawdown_10", severity: "medium", text: `S&P 500 ${pct(spy.fromHigh)} from its 1-year high`, source: "Shanghao" });

  // --- Relative strength + gold/silver
  const rs: RsRow[] = RS_PAIRS.map((p) => {
    const a = closes(get(p.a));
    const b = closes(get(p.b));
    const diff = (n: number) => {
      const ra = lastReturn(a, n);
      const rb = lastReturn(b, n);
      return ra == null || rb == null ? null : ra - rb;
    };
    return { ...p, spread20: diff(20), spread60: diff(60) };
  });
  const gold = get("GC=F") ?? get("GLD");
  const silver = get("SI=F") ?? get("SLV");
  const pz = gold && silver ? pairZ(gold.bars, silver.bars, 120) : { ratio: null, z: null };
  const gsNote = pz.z == null ? "Not enough history" : pz.z >= 2 ? "Gold rich vs silver (silver cheap)" : pz.z <= -2 ? "Silver rich vs gold" : "Inside the normal band (±2)";

  // --- History: similar drops + 200-day line (Shepherd), for the Nasdaq-100
  const q = get("QQQ");
  const todayRet = q ? returnZ(closes(q)).ret : null;
  const an = q ? studyAnalogs(q.bars, todayRet) : null;
  const line = q ? studyLine(q.bars, 200) : { touch: { n: 0, med20: null, med60: null, up60: null }, break: { n: 0, med20: null, med60: null, up60: null } };

  // --- Income (PII)
  const rows = income.flatMap((s) => (get(s) ? [incomeRow(get(s)!)] : []));
  for (const r of rows) {
    if (r.cut) alerts.push({ id: `cut_${r.symbol}`, severity: "medium", text: `${r.symbol} cut its distribution (latest ${r.lastDist ? num(r.lastDist.amount, 4) : "—"})`, source: "PII" });
  }

  // --- Regime: Shepherd's "crash or correction" — is the stress spreading beyond price?
  const tones = { credit: worst([proxyTone, hyTone, cccTone]), vol: volTone, rates: rateTone, jobs: jobTone };
  const trendBad = spy?.above200 === false;
  const stressCount = Object.values(tones).filter((t) => t === "alarm").length + (trendBad ? 1 : 0);
  const cautionCount = Object.values(tones).filter((t) => t === "caution").length;
  const regimeTone: Tone = stressCount >= 2 ? "alarm" : stressCount === 1 || cautionCount >= 2 ? "caution" : "calm";
  const title = regimeTone === "alarm" ? "Stress is spreading beyond price" : regimeTone === "caution" ? "A correction, not (yet) a credit event" : "Calm: trend intact, credit quiet";
  const lines = [
    `Trend: S&P 500 ${spy?.above200 == null ? "—" : spy.above200 ? "above" : "below"} its 200-day line, ${pct(spy?.fromHigh)} from the 1-year high.`,
    `Credit: ${tones.credit}. Volatility: ${tones.vol}. Rates: ${tones.rates}. Jobs: ${tones.jobs}.`,
  ];

  const sevRank = { high: 0, medium: 1 };
  alerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  const asOf = spy ? get("SPY")!.bars.at(-1)!.date : new Date(now).toISOString().slice(0, 10);
  return {
    asOf,
    fetchedAt: new Date(now).toISOString(),
    marketState: get("SPY")?.marketState ?? "UNKNOWN",
    regime: { tone: regimeTone, title, lines },
    alerts,
    map,
    risk,
    rs,
    goldSilver: { ratio: pz.ratio ?? null, z: pz.z ?? null, note: gsNote },
    history: {
      symbol: "QQQ",
      todayRet,
      threshold: an?.threshold ?? -0.02,
      n: an?.n ?? 0,
      d5: an?.d5 ?? { med: null, up: null },
      d21: an?.d21 ?? { med: null, up: null },
      d126: an?.d126 ?? { med: null, up: null },
      line,
    },
    income: { rows, volCeiling: VOL_CEILING, volWarn: VOL_WARN },
    missing,
  };
}
