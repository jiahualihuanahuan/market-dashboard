import assert from "node:assert/strict";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileHoldings, hasFileHoldings, loadHoldingsFile } from "./holdings-file.ts";

function write(file: string, funds: Record<string, unknown>, mtime: number): void {
  writeFileSync(file, JSON.stringify({ format: "market-desk-lookthru/v1", funds }));
  utimesSync(file, mtime, mtime);
}

const HDIV = {
  asOf: "2026-10-30",
  holdings: [
    { symbol: "HFIN.TO", name: "Hamilton Enhanced Canadian Financials ETF", weight: 0.236, sector: "Fund" },
    { symbol: "EMAX.TO", name: "Hamilton Energy YIELD MAXIMIZER ETF", weight: 0.205, sector: "Fund" },
    { symbol: "HMAX.TO", name: "Hamilton Canadian Financials YIELD MAXIMIZER ETF", weight: 0.199, sector: "Fund" },
    { symbol: "CASH", name: "Cash", weight: -0.02, sector: "Cash" },
  ],
};

describe("lookthru holdings file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lt-holdings-"));
  const file = path.join(dir, "holdings.json");

  it("returns nothing when no file is mounted", () => {
    assert.equal(loadHoldingsFile(path.join(dir, "missing.json")).size, 0);
    assert.equal(fileHoldings("HDIV.TO", path.join(dir, "missing.json")), null);
  });

  it("finds a fund by listing symbol or bare ticker", () => {
    write(file, { "HDIV.TO": HDIV, "TINY.TO": { holdings: [{ symbol: "X", name: "x", weight: 0.01 }] } }, 1000);
    const hit = fileHoldings("HDIV.TO", file);
    assert.equal(hit?.asOf, "2026-10-30");
    assert.equal(hit?.holdings[0]?.symbol, "HFIN.TO");
    assert.ok(fileHoldings("hdiv", file));
    assert.ok(hasFileHoldings("HDIV", file));
    // too little coverage to be usable
    assert.equal(fileHoldings("TINY.TO", file), null);
  });

  it("re-reads the file when it changes", () => {
    write(file, { "ZWC.TO": { asOf: "2026-11-18", holdings: HDIV.holdings } }, 2000);
    assert.equal(fileHoldings("HDIV.TO", file), null);
    assert.equal(fileHoldings("ZWC.TO", file)?.asOf, "2026-11-18");
  });
});
