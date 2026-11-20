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
