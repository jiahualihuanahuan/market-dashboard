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
  assert.equal(priceDue(close + 1, night, schedule({ OFFHOURS_REFRESH_MIN: "0" })), false);
  assert.equal(barsDue(close - 1, night, schedule({})), true);
});

test("schedule: hourly on weekends, configurable, off with 0", () => {
  const sat = Date.parse("2026-11-21T17:00:00Z"); // Sat 12:00 ET
  assert.equal(priceDue(sat - 30 * 60_000, sat, schedule({})), false);
  assert.equal(priceDue(sat - 61 * 60_000, sat, schedule({})), true);
  assert.equal(priceDue(sat - 20 * 60_000, sat, schedule({ WEEKEND_REFRESH_MIN: "15" })), true);
  assert.equal(priceDue(sat - 5 * 3_600_000, sat, schedule({ WEEKEND_REFRESH_MIN: "0" })), false);
});

test("schedule: hourly on weeknights outside US hours, configurable, off with 0", () => {
  const night = Date.parse("2026-11-20T03:00:00Z"); // Thu 22:00 ET, close was 16:15
  assert.equal(priceDue(night - 30 * 60_000, night, schedule({})), false);
  assert.equal(priceDue(night - 61 * 60_000, night, schedule({})), true);
  assert.equal(priceDue(night - 20 * 60_000, night, schedule({ OFFHOURS_REFRESH_MIN: "15" })), true);
  assert.equal(priceDue(night - 4 * 3_600_000, night, schedule({ OFFHOURS_REFRESH_MIN: "0" })), false);
  const early = Date.parse("2026-11-19T12:00:00Z"); // Thu 07:00 ET, before the open
  assert.equal(priceDue(early - 61 * 60_000, early, schedule({})), true);
  // Weekend setting does not leak into weeknights, and vice versa.
  assert.equal(priceDue(night - 61 * 60_000, night, schedule({ WEEKEND_REFRESH_MIN: "0" })), true);
  const open = Date.parse("2026-11-19T15:00:00Z"); // market hours keep 15 min
  assert.equal(priceDue(open - 16 * 60_000, open, schedule({ OFFHOURS_REFRESH_MIN: "0" })), true);
});
