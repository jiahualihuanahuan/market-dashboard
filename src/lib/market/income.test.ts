import assert from "node:assert/strict";
import { test } from "node:test";
import { incomeRow, incomeTickers, payoutTrend, type Bar, type Payout } from "./income.ts";

const DAY = 86_400_000;
const now = Date.parse("2026-11-19T21:00:00Z");

function monthly(amounts: number[]): Payout[] {
  return amounts.map((amount, i) => ({ t: now - (amounts.length - 1 - i) * 30 * DAY - 5 * DAY, amount }));
}

test("JEPQ-style swings are not a cut; a real drop is", () => {
  // Actual JEPQ payouts, Apr–Nov 2026: month to month they swing up to -17%.
  const jepq = monthly([0.559, 0.591, 0.564, 0.637, 0.705, 0.683, 0.567, 0.54]);
  const swing = payoutTrend(jepq, 25);
  assert.equal(swing.cut, false);
  assert.ok(Math.abs(swing.change!) < 10);
  const halved = payoutTrend(monthly([0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.1, 0.1, 0.1]), 25);
  assert.equal(halved.cut, true);
  assert.equal(Math.round(halved.change!), -50);
});

test("quarterly payer compares one payout per window", () => {
  const q = [0, 1, 2, 3].map((i) => ({ t: now - (3 - i) * 91 * DAY + DAY, amount: i === 3 ? 0.5 : 0.52 }));
  assert.equal(payoutTrend(q, 25).cut, false);
});

test("total return reinvests distributions; drawdown and vol", () => {
  const bars: Bar[] = [];
  for (let i = 400; i >= 0; i--) bars.push({ t: now - i * DAY, close: i === 100 ? 80 : 100 });
  const payouts: Payout[] = [{ t: now - 200 * DAY, amount: 10 }];
  const row = incomeRow("TEST", bars, payouts, "USD", now);
  assert.equal(Math.round(row.priceReturn!), 0);
  assert.equal(Math.round(row.totalReturn!), 10);
  assert.equal(Math.round(row.ttmYield!), 10);
  assert.equal(Math.round(row.maxDrawdown!), -20);
  assert.equal(row.volTone, "over");
  assert.equal(row.error, null);
});

test("INCOME_TICKERS overrides the default list", () => {
  assert.deepEqual(incomeTickers({ INCOME_TICKERS: "jepi, spyi  hyld.to" }), ["JEPI", "SPYI", "HYLD.TO"]);
  assert.equal(incomeTickers({}).length, 8);
});
