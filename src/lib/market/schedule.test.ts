import assert from "node:assert/strict";
import { test } from "node:test";
import { barsDue, lastCloseAt, priceDue, schedule, usMarketOpen } from "./schedule.ts";

test("schedule: env overrides, market hours, one pass after the close", () => {
  assert.equal(schedule({ PRICE_REFRESH_MIN: "5" }).priceMs, 300_000);
  assert.equal(schedule({ FRED_REFRESH_HOURS: "x" }).fredMs, 12 * 3_600_000);
  const open = Date.parse("2026-11-19T15:00:00Z"); // Thu 10:00 ET
  const night = Date.parse("2026-11-20T02:00:00Z"); // Thu 21:00 ET
  assert.equal(usMarketOpen(open), true);
  assert.equal(usMarketOpen(night), false);
  assert.equal(usMarketOpen(Date.parse("2026-11-21T15:00:00Z")), false);
  assert.equal(priceDue(open - 10 * 60_000, open, schedule({})), false);
  assert.equal(priceDue(open - 16 * 60_000, open, schedule({})), true);
  const close = lastCloseAt(night);
  assert.equal(new Date(close).toISOString().slice(0, 16), "2026-11-19T21:15");
  assert.equal(priceDue(close - 1, night, schedule({})), true);
  assert.equal(priceDue(close + 1, night, schedule({})), false);
  assert.equal(barsDue(close - 1, night, schedule({})), true);
});

test("schedule: hourly on weekends, configurable, off with 0", () => {
  const sat = Date.parse("2026-11-21T17:00:00Z"); // Sat 12:00 ET
  assert.equal(priceDue(sat - 30 * 60_000, sat, schedule({})), false);
  assert.equal(priceDue(sat - 61 * 60_000, sat, schedule({})), true);
  assert.equal(priceDue(sat - 20 * 60_000, sat, schedule({ WEEKEND_REFRESH_MIN: "15" })), true);
  assert.equal(priceDue(sat - 5 * 3_600_000, sat, schedule({ WEEKEND_REFRESH_MIN: "0" })), false);
  const night = Date.parse("2026-11-20T03:00:00Z"); // Thu 22:00 ET: still once after the close
  assert.equal(priceDue(night - 2 * 3_600_000, night, schedule({})), false);
});
