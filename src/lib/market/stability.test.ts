import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRows } from "./stability.server.ts";

test("trend and VIX term-structure rows", () => {
  const spx = Array.from({ length: 250 }, (_, i) => (i < 249 ? 100 : 90));
  const rows = buildRows(new Map(), null, { spx, vix: 31, vix3m: 30 });
  const trend = rows.find((r) => r.id === "trend")!;
  const term = rows.find((r) => r.id === "vixterm")!;
  assert.equal(trend.tone, "alarm");
  assert.match(trend.value, /^below/);
  assert.equal(term.tone, "alarm");
  assert.equal(term.value, "1.03");
  const calm = buildRows(new Map(), null, { spx: Array(250).fill(100), vix: 15, vix3m: 18 });
  assert.equal(calm.find((r) => r.id === "trend")!.tone, "calm");
  assert.equal(calm.find((r) => r.id === "vixterm")!.tone, "calm");
});
