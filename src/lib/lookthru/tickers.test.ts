import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAlias, equityKey, parsePaste } from "./tickers.ts";

const WS_CSV = `Account Name,Account Type,Account Classification,Account Number,Symbol,Exchange,MIC,Name,Security Type,Quantity,Position Direction
"Non-registered margin","Non-registered margin","Trade","X","NVDA","TSX","XTSE","Nvidia CDR (CAD Hedged)","EQUITY","72","LONG"
"TFSA","TFSA","Trade","Y","NVDA","TSX","XTSE","Nvidia CDR (CAD Hedged)","EQUITY","24.6827","LONG"
"RRSP","RRSP","Trade","Z","IBIT","NASDAQ","XNAS","iShares Bitcoin Trust ETF - Shares","EXCHANGE_TRADED_FUND","1111","LONG"
"RRSP","RRSP","Trade","Z","IBIT","CBOE CANADA","NEOE","iShares Bitcoin ETF - CAD","EXCHANGE_TRADED_FUND","72","LONG"
"RRSP","RRSP","Trade","Z","PSA","TSX","XTSE","Purpose High Interest Savings ETF","EXCHANGE_TRADED_FUND","494","LONG"
"Crypto","Crypto","Trade","C","BTC","","","Bitcoin","CRYPTOCURRENCY","0.067","LONG"
"Rainy","Non-registered","Trade","R","CAD","","","CAD","CURRENCY","100","LONG"
"RRSP","RRSP","Trade","Z","GOLD","","","Physically backed gold","PRECIOUS_METAL","0.01","LONG"
"Margin","Non-registered margin","Trade","M","IBIT  270115P00050000","NASDAQ","XNAS","","OPTION","-1","SHORT"
`;

describe("broker CSV import", () => {
  it("maps exchange to .TO/.NE and aggregates quantities", () => {
    const rows = parsePaste(WS_CSV);
    const byTicker = Object.fromEntries(rows.map((r) => [r.ticker, r.shares]));
    assert.equal(byTicker["NVDA.TO"], 96.6827);
    assert.equal(byTicker.IBIT, 1111);
    assert.equal(byTicker["IBIT.NE"], 72);
    assert.equal(byTicker["PSA.TO"], 494);
    assert.equal(byTicker["BTC-USD"], 0.067);
    assert.equal(byTicker.CASH, 100);
    assert.equal(byTicker["XAUUSD=X"], 0.01);
    assert.ok(!rows.some((r) => r.ticker.includes("270115")));
  });
});

describe("equity keys", () => {
  it("rolls CDRs and bitcoin tickers together", () => {
    assert.equal(equityKey("NVDA.TO"), "NVDA");
    assert.equal(equityKey("BRK.TO"), "BRK.B");
    assert.equal(equityKey("BTC"), equityKey("BTC-USD"));
    assert.equal(applyAlias("HBIX"), "HBIX.NE");
    assert.equal(applyAlias("BDAY"), "BDAY.NE");
    assert.equal(applyAlias("CMAX"), "CMAX.TO");
    assert.equal(applyAlias("CANY"), "CANY.TO");
    assert.equal(applyAlias("NVHE"), "NVHE.TO");
    assert.equal(applyAlias("IMAX"), "IMAX", "IMAX the stock must not become IMAX.TO");
    assert.equal(applyAlias("TSLY"), "TSLY", "US YieldMax TSLY stays US");
    assert.equal(applyAlias("TSLY.TO"), "TSLY.TO");
  });
});
