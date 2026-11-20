import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tickerFromCompanyName } from "./catalog.ts";
import {
  fromBloomberg,
  holdingsAreUsable,
  parseEvolveCsv,
  parseHamiltonHtml,
  parseHarvestHtml,
  parsePurposeHoldings,
  parseWeight,
} from "./holdings-parse.ts";

describe("fromBloomberg", () => {
  it("maps US/CN equity ids and collides T/KEY/H on the US side", () => {
    assert.equal(fromBloomberg("NVDA US EQUITY"), "NVDA");
    assert.equal(fromBloomberg("REGN US"), "REGN");
    assert.equal(fromBloomberg("SLF CN EQUITY"), "SLF.TO");
    assert.equal(fromBloomberg("HTA CN"), "HTA.TO");
    assert.equal(fromBloomberg("T US EQUITY"), "T.US");
    assert.equal(fromBloomberg("KEY US EQUITY"), "KEY.US");
    assert.equal(fromBloomberg("H CN EQUITY"), "H.TO");
    assert.equal(fromBloomberg("A US"), "A");
  });

  it("classifies option rows and cash", () => {
    assert.equal(fromBloomberg("BMO CN 09/18/26 C248 EQUITY"), "OPTIONS");
    assert.equal(fromBloomberg("CAD CASH"), "CASH");
  });
});

describe("parseWeight", () => {
  it("handles percents, scientific weights, and parentheses", () => {
    assert.equal(parseWeight("5.4%"), 0.054);
    assert.equal(parseWeight("9.95E-02"), 0.0995);
    assert.equal(parseWeight("(0.3)%"), -0.003);
    assert.equal(parseWeight("-21.2%"), -0.212);
    assert.equal(parseWeight(0.107102051), 0.10710205);
  });
});

const EVOLVE_CSV = `TICKER,PORTFOLIO_MWEIGHT,POSITION,SECURITY_NAME,GICS_SECTOR_NAME
"SLF CN EQUITY",9.95E-02,1470392,"Sun Life Financial Inc",Financial
"BMO CN EQUITY",9.76E-02,660592,"Bank of Montreal",Financial
"BNS CN EQUITY",0.107102051,1357347,"Bank of Nova Scotia/The",Financial
"RY CN EQUITY",0.101,500,"Royal Bank of Canada",Financial
"BMO CN 09/18/26 C248 EQUITY",-3.61E-05,-2100,"Bank of Montreal - CALL Option",Financial
"CAD CASH",0.01,1,"Canadian Dollar",Cash
`;

const HARVEST_HHL = `<p>As at 2026/08/31</p>
<table id="tablepress-hhl_holdings" class="tablepress tablepress-id-hhl_holdings">
<thead><tr class="row-1"><th>Name</th><th>Ticker</th><th>Weight</th><th>Sector</th></tr></thead>
<tbody>
<tr><td>Eli Lilly and Company</td><td>LLY US</td><td>4.7%</td><td>Pharmaceuticals</td></tr>
<tr><td>Johnson & Johnson</td><td>JNJ US</td><td>4.9%</td><td>Pharmaceuticals</td></tr>
<tr><td>UnitedHealth Group Incorporated</td><td>UNH US</td><td>4.5%</td><td>Health Care</td></tr>
<tr><td>Cash and other assets and liabilities</td><td></td><td>0.5%</td><td></td></tr>
<tr><td>Written Options</td><td></td><td>(0.3)%</td><td></td></tr>
</tbody>
</table>`;

const HARVEST_HDIF = `<table id="tablepress-hdif_holdings" class="tablepress">
<thead><tr><th>Ticker</th><th>ETF Name</th><th>Weight</th><th>Sector</th></tr></thead>
<tbody>
<tr><td><a href="https://harvestportfolios.com/etf/hta"><img alt="HTA" src="x.svg"></a></td><td>Harvest Tech Leaders Income ETF</td><td>23.3%</td><td>Information Technology</td></tr>
<tr><td><a href="https://harvestportfolios.com/etf/hbf"><img alt="HBF" src="x.svg"></a></td><td>Harvest US Equity Leaders Income ETF</td><td>22.6%</td><td>Diversified</td></tr>
<tr><td><a href="https://harvestportfolios.com/etf/hhl"><img alt="HHL" src="x.svg"></a></td><td>Harvest Healthcare Leaders Income ETF</td><td>13.0%</td><td>Health Care</td></tr>
<tr><td>Cash and other assets and liabilities</td><td></td><td>0.5%</td><td></td></tr>
</tbody>
</table>`;

const HAMILTON_HYLD = `<div class="etf-overview-tab-content__topten-table__meta">
<h3> Holdings </h3><p>As at August 31, 2026</p></div>
<table id="etf-holdings-14625">
<thead><tr><td>ticker</td><td>name</td><td>weight</td></tr></thead>
<tbody>
<tr><td>SMAX</td><td>Hamilton U.S. Equity YIELD MAXIMIZER ETF</td><td>59.8%</td></tr>
<tr><td>QMAX</td><td>Hamilton Technology YIELD MAXIMIZER ETF</td><td>28.1%</td></tr>
<tr><td>FMAX</td><td>Hamilton U.S. Financials YIELD MAXIMIZER ETF</td><td>7.6%</td></tr>
<tr><td></td><td>Cash and Other Assets/Liabilities</td><td>-21.2%</td></tr>
</tbody>
</table>`;

describe("parseEvolveCsv", () => {
  it("keeps stocks, folds options, and maps CN tickers to .TO", () => {
    const { holdings } = parseEvolveCsv(EVOLVE_CSV);
    const by = Object.fromEntries(holdings.map((h) => [h.symbol, h]));
    assert.ok(by["SLF.TO"]);
    assert.ok(by["BMO.TO"]);
    assert.ok(by["BNS.TO"]);
    assert.ok(by["RY.TO"]);
    assert.ok(by.OPTIONS);
    assert.ok(by.CASH);
    assert.equal(by["SLF.TO"]?.weight, 0.0995);
    assert.ok((by.OPTIONS?.weight ?? 0) < 0);
    assert.ok(holdingsAreUsable(holdings));
  });
});

describe("parseHarvestHtml", () => {
  it("reads HHL Name/Ticker/Weight including LLY and written options", () => {
    const { holdings, asOf } = parseHarvestHtml(HARVEST_HHL);
    const syms = holdings.map((h) => h.symbol);
    assert.ok(syms.includes("LLY"));
    assert.ok(syms.includes("JNJ"));
    assert.ok(syms.includes("UNH"));
    assert.ok(syms.includes("CASH"));
    assert.ok(syms.includes("OPTIONS"));
    assert.equal(asOf, "2026-08-31");
    const opts = holdings.find((h) => h.symbol === "OPTIONS");
    assert.ok((opts?.weight ?? 0) < 0);
  });

  it("reads HDIF nested Harvest tickers from img alt/href", () => {
    const { holdings } = parseHarvestHtml(HARVEST_HDIF);
    const syms = new Set(holdings.map((h) => h.symbol));
    assert.ok(syms.has("HTA.TO"));
    assert.ok(syms.has("HBF.TO"));
    assert.ok(syms.has("HHL.TO"));
    assert.equal(holdings.find((h) => h.symbol === "HTA.TO")?.sector, "Fund");
  });
});

describe("parseHamiltonHtml", () => {
  it("reads HYLD fund-of-funds and negative cash", () => {
    const { holdings, asOf } = parseHamiltonHtml(HAMILTON_HYLD);
    const by = Object.fromEntries(holdings.map((h) => [h.symbol, h]));
    assert.ok(by["SMAX.TO"]);
    assert.ok(by["QMAX.TO"]);
    assert.equal(by["SMAX.TO"]?.weight, 0.598);
    assert.ok((by.CASH?.weight ?? 0) < 0);
    assert.equal(asOf, "2026-08-31");
  });
});

describe("parsePurposeHoldings + company names", () => {
  it("resolves PDF-style names to Canadian and US tickers", () => {
    assert.equal(tickerFromCompanyName("Toronto-Dominion Bank", "Canada"), "TD.TO");
    assert.equal(tickerFromCompanyName("The Bank of Nova Scotia", "Canada"), "BNS.TO");
    assert.equal(tickerFromCompanyName("Royal Bank Of Canada", "Canada"), "RY.TO");
    assert.equal(tickerFromCompanyName("AbbVie Inc", "United States"), "ABBV");
    assert.equal(tickerFromCompanyName("Telus Corporation", "Canada"), "T.TO");
    assert.equal(tickerFromCompanyName("Keyera Corp.", "Canada"), "KEY.TO");
    const { holdings } = parsePurposeHoldings(
      [
        { name: "Toronto-Dominion Bank", weight: "6.59%", sector: "Financials", geo: "Canada" },
        { name: "Royal Bank Of Canada", weight: "5.27%", sector: "Financials", geo: "Canada" },
        { name: "AbbVie Inc", weight: "2.76%", sector: "Health Care", geo: "United States" },
        { name: "Some Obscure Name Ltd", weight: "1.10%", sector: "Other", geo: "Canada" },
      ],
      (name, geo) => tickerFromCompanyName(name, geo),
    );
    const syms = new Set(holdings.map((h) => h.symbol));
    assert.ok(syms.has("TD.TO"));
    assert.ok(syms.has("RY.TO"));
    assert.ok(syms.has("ABBV"));
    assert.ok(syms.has("OTHER"));
  });
});
