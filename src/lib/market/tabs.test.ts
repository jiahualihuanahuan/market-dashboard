import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTab, SECTIONS, TABS } from "./tabs.ts";

test("no more than five tabs, and every section lives in exactly one", () => {
  assert.ok(TABS.length <= 5);
  const all = TABS.flatMap((t) => [...SECTIONS[t]]);
  assert.equal(new Set(all).size, all.length);
});

test("old bookmarks land on the merged tab with their section open", () => {
  assert.deepEqual(resolveTab("yields", ""), { tab: "risk", section: "yields" });
  assert.deepEqual(resolveTab("lookthru", undefined), { tab: "portfolio", section: "lookthru" });
  assert.deepEqual(resolveTab("risk", "macro"), { tab: "risk", section: "macro" });
  assert.deepEqual(resolveTab("risk", "heatmap"), { tab: "risk", section: "" });
  assert.deepEqual(resolveTab("nope", ""), { tab: "markets", section: "" });
});
