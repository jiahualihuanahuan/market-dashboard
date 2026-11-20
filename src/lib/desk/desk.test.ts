import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeBars, parseChart, patchLive } from "./bars.ts";
import { buildDesk, levelAndChange } from "./build.ts";
import { annualVol, distributionCut, maxDrawdown, totalReturnIndex, ttmYield } from "./income.ts";
import { barsDue, lastCloseAt, priceDue, schedule, usMarketOpen } from "./schedule.ts";
import { allSymbols, incomeTickers, MAP } from "./universe.ts";
import type { Bar, Series } from "./types.ts";

function bars(n: number, start = "2021-01-04", f = (i: number) => 100 + i): Bar[] {
  const out: Bar[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const c = f(i);
    out.push({ date: d.toISOString().slice(0, 10), o: c, h: c, l: c, c, v: 1000 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const series = (symbol: string, b: Bar[], divs: Series["divs"] = []): Series => ({ symbol, name: symbol, currency: "USD", bars: b, divs, marketState: "CLOSED", fullAt: 0, tailAt: 0, liveAt: 0 });

test("mergeBars appends a tail and lets tail bars win", () => {
  const base = bars(5);
  const tail = [{ ...base[3]!, c: base[3]!.c * 1.001 }, { ...base[4]! }, ...bars(2, "2021-01-09", () => 200)];
  const merged = mergeBars(base, tail)!;
  assert.equal(merged.length, 7);
  assert.equal(merged[3]!.c, tail[0]!.c);
  assert.equal(merged.at(-1)!.c, 200);
});

test("mergeBars asks for a full re-read on a split or a gap", () => {
  const base = bars(5);
  assert.equal(mergeBars(base, [{ ...base[2]!, c: base[2]!.c / 2 }, base[3]!]), null);
  assert.equal(mergeBars(base, bars(2, "2021-02-01")), null);
});

test("patchLive updates today or appends, never rewrites a newer bar", () => {
  const b = bars(2, "2026-11-18");
  const t19 = Date.parse("2026-11-19T18:00:00Z") / 1000;
  assert.equal(patchLive(b, 150, t19).at(-1)!.c, 150);
  assert.equal(patchLive(b, 150, t19).length, 2);
  const t20 = Date.parse("2026-11-20T18:00:00Z") / 1000;
  assert.equal(patchLive(b, 150, t20).length, 3);
  const t17 = Date.parse("2026-11-17T18:00:00Z") / 1000;
  assert.equal(patchLive(b, 150, t17), b);
});

test("parseChart reads bars and dividends in New York dates", () => {
  const ts = Date.parse("2026-11-18T21:00:00Z") / 1000;
  const parsed = parseChart({
    chart: { result: [{ meta: { shortName: "X", currency: "CAD" }, timestamp: [ts, ts + 86400], events: { dividends: { a: { amount: 0.1, date: ts } } }, indicators: { quote: [{ close: [10, null], open: [9, 9], high: [11, 11], low: [8, 8], volume: [5, 5] }] } }] },
  })!;
  assert.equal(parsed.bars.length, 1);
  assert.equal(parsed.bars[0]!.date, "2026-11-18");
  assert.deepEqual(parsed.divs, [{ date: "2026-11-18", amount: 0.1 }]);
  assert.equal(parsed.currency, "CAD");
});

test("income math: DRIP total return, TTM yield, volatility, drawdown, cuts", () => {
  const b = bars(3, "2026-01-01", (i) => [10, 9.9, 10][i]!);
  const tr = totalReturnIndex(b, [{ date: "2026-01-02", amount: 0.1 }]);
  assert.ok(Math.abs(tr[1]! - 1) < 1e-12);
  assert.ok(Math.abs(tr[2]! - 10 / 9.9) < 1e-12);
  const year = bars(400, "2025-01-01", () => 10);
  assert.equal(ttmYield(year, [{ date: "2025-12-01", amount: 0.5 }, { date: "2024-12-01", amount: 9 }]), 0.05);
  assert.equal(ttmYield(bars(30, "2026-01-01"), []), null);
  assert.equal(annualVol(Array(40).fill(1)), 0);
  assert.equal(maxDrawdown([1, 2, 1, 1.5]), -0.5);
  const d = (amount: number, i: number) => ({ date: `2026-0${i}-01`, amount });
  assert.equal(distributionCut([d(1, 1), d(1, 2), d(1, 3), d(0.85, 4)]), true);
  assert.equal(distributionCut([d(1, 1), d(1, 2), d(1, 3), d(0.95, 4)]), false);
});

test("schedule: env overrides, market hours, EOD pass", () => {
  const s = schedule({ PRICE_REFRESH_MIN: "5", FRED_REFRESH_HOURS: "x" });
  assert.equal(s.priceMs, 300_000);
  assert.equal(s.fredMs, 12 * 3_600_000);
  const open = Date.parse("2026-11-19T15:00:00Z"); // 10:00 ET Thursday
  const night = Date.parse("2026-11-20T02:00:00Z"); // 21:00 ET Thursday
  const sat = Date.parse("2026-11-21T15:00:00Z");
  assert.equal(usMarketOpen(open), true);
  assert.equal(usMarketOpen(night), false);
  assert.equal(usMarketOpen(sat), false);
  assert.equal(priceDue(open - 10 * 60_000, open, schedule({})), false);
  assert.equal(priceDue(open - 16 * 60_000, open, schedule({})), true);
  const close = lastCloseAt(night);
  assert.equal(new Date(close).toISOString().slice(0, 16), "2026-11-19T21:15");
  assert.equal(priceDue(close - 1, night, schedule({})), true);
  assert.equal(priceDue(close + 1, night, schedule({})), false);
  assert.equal(barsDue(close + 1, night, schedule({})), false);
  assert.equal(barsDue(close - 1, night, schedule({})), true);
});

test("levelAndChange compares with the value about N days back", () => {
  const obs = [{ date: "2026-10-01", value: 3 }, { date: "2026-10-20", value: 3.2 }, { date: "2026-11-18", value: 4 }];
  const got = levelAndChange(obs, 28);
  assert.equal(got.value, 4);
  assert.ok(Math.abs(got.change! - 0.8) < 1e-9);
  assert.equal(levelAndChange(obs, 45).change, 1);
  assert.equal(levelAndChange(obs, 60).change, null);
});

test("buildDesk: each signal appears once, alerts fire on the rules", () => {
  const up = bars(600, "2024-01-01", (i) => 100 + i * 0.1);
  const crash = bars(600, "2024-01-01", (i) => (i < 597 ? 100 + i * 0.1 : 50));
  const m = new Map<string, Series>();
  for (const sym of allSymbols(["JEPQ"])) m.set(sym, series(sym, up));
  m.set("SPY", series("SPY", crash));
  m.set("SMH", series("SMH", crash));
  m.set("^VIX", series("^VIX", bars(600, "2024-01-01", () => 35)));
  m.set("^VIX3M", series("^VIX3M", bars(600, "2024-01-01", () => 30)));
  const fred = new Map([
    ["BAMLH0A0HYM2", [{ date: "2026-07-01", value: 3 }, { date: "2026-08-10", value: 4 }]],
    ["UNRATE", [{ date: "2026-07-01", value: 4.7 }]],
  ]);
  const desk = buildDesk({ series: m, fred, income: ["JEPQ"], now: Date.parse("2026-11-19T12:00:00Z") });
  assert.equal(desk.map.length, MAP.length);
  const ids = desk.alerts.map((a) => a.id);
  for (const id of ["vix_term_inversion", "hy_oas_jump", "jobs", "spy_below_200", "sox_weekly_drop", "spx_drawdown_10"]) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(desk.risk.map((r) => r.id)).size, desk.risk.length);
  assert.equal(desk.regime.tone, "alarm");
  assert.equal(desk.income.rows.length, 1);
});

test("incomeTickers validates the override and falls back to defaults", () => {
  assert.deepEqual(incomeTickers("jepq, hyld.to,,bad ticker!"), ["JEPQ", "HYLD.TO"]);
  assert.ok(incomeTickers(undefined).length >= 4);
});
