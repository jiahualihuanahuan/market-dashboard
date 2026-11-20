import assert from "node:assert/strict";
import { test } from "node:test";
import { FRED_FULL_MS, FRED_TTL_MS, mergeTail, parseFredCsv, planFred, sliceFrom, type FredEntry } from "./fred.ts";

const obs = [
  { date: "2020-01-01", value: 1 },
  { date: "2020-02-01", value: 2 },
  { date: "2020-03-01", value: 3 },
];

test("parseFredCsv skips headers, blanks and '.' placeholders", () => {
  const text = "observation_date,DGS10\n2020-01-02,1.88\n2020-01-03,.\n2020-01-06,\n2020-01-07,1.82\n";
  assert.deepEqual(parseFredCsv(text), [
    { date: "2020-01-02", value: 1.88 },
    { date: "2020-01-07", value: 1.82 },
  ]);
});

test("planFred downloads when nothing is cached", () => {
  assert.deepEqual(planFred(null, "1999-01-01", 0), { kind: "full", from: "1999-01-01" });
});

test("planFred serves a fresh cache and slices to the caller's start", () => {
  const entry: FredEntry = { from: "1999-01-01", checkedAt: 1000, fullAt: 1000, obs };
  assert.deepEqual(planFred(entry, "2016-01-01", 1000 + FRED_TTL_MS - 1), { kind: "hit" });
  assert.deepEqual(sliceFrom(obs, "2020-02-01"), obs.slice(1));
  assert.equal(sliceFrom(obs, ""), obs);
});

test("planFred widens to the earliest start instead of keeping two copies", () => {
  const entry: FredEntry = { from: "2016-01-01", checkedAt: 0, fullAt: 0, obs };
  assert.deepEqual(planFred(entry, "1999-01-01", 1), { kind: "full", from: "1999-01-01" });
  assert.deepEqual(planFred(entry, "", 1), { kind: "full", from: "" });
  const full: FredEntry = { from: "", checkedAt: 0, fullAt: 0, obs };
  assert.equal(planFred(full, "1999-01-01", FRED_TTL_MS + 1).kind, "tail");
});

test("planFred asks only for the recent tail when stale, and a full refresh weekly", () => {
  const entry: FredEntry = { from: "1999-01-01", checkedAt: 0, fullAt: 0, obs };
  const plan = planFred(entry, "1999-01-01", FRED_TTL_MS + 1);
  assert.equal(plan.kind, "tail");
  assert.equal(plan.kind === "tail" && plan.cosd, "2019-01-26");
  assert.equal(planFred(entry, "1999-01-01", FRED_FULL_MS).kind, "full");
  assert.equal(planFred(entry, "1999-01-01", 1, true).kind, "tail");
});

test("mergeTail replaces revised points and appends new ones", () => {
  const tail = [
    { date: "2020-02-01", value: 2.5 },
    { date: "2020-03-01", value: 3 },
    { date: "2020-04-01", value: 4 },
  ];
  assert.deepEqual(mergeTail(obs, tail), [obs[0], ...tail]);
  assert.equal(mergeTail(obs, []), obs);
});
