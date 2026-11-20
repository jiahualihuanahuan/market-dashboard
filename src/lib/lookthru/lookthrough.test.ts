import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogInstrument, SAMPLE_POSITIONS } from "./catalog.ts";
import { composeLookthrough } from "./lookthrough.ts";
import { applyAlias, candidateSymbols, stripShareClass } from "./tickers.ts";
import type { Instrument, Position } from "./types.ts";

function priced(sym: string): Instrument {
  const c = catalogInstrument(sym);
  assert.ok(c, `missing catalog for ${sym}`);
  return { ...c, price: 10 };
}

function lookthrough(tickers: string[]) {
  const positions: Position[] = tickers.map((ticker, i) => ({
    id: String(i),
    ticker,
    shares: 100,
  }));
  const instruments: Record<string, Instrument> = {};
  const aliases: Record<string, string> = {};
  for (const t of tickers) {
    const inst = priced(t);
    instruments[inst.symbol] = inst;
    aliases[applyAlias(t)] = inst.symbol;
  }
  return composeLookthrough(positions, instruments, aliases, 1.37, "CAD");
}

describe("class-share catalog lookup", () => {
  it("resolves Harvest/Evolve class B and hyphen Yahoo tickers to the same fund", () => {
    for (const t of ["HHL.TO", "HHL.B", "HHL.B.TO", "HHL-B.TO", "HHL.U", "LIFE.B.TO", "CALL.B", "BANK.TO"]) {
      const cat = catalogInstrument(t);
      assert.ok(cat?.holdings?.length, `${t} should resolve to catalog holdings`);
    }
    assert.equal(catalogInstrument("HHL-B.TO")?.symbol, "HHL.TO");
    assert.equal(catalogInstrument("LIFE.B.TO")?.symbol, "LIFE.TO");
    assert.equal(applyAlias("HHL.B.TO"), "HHL-B.TO");
    assert.equal(applyAlias("HHL.B"), "HHL-B.TO");
    assert.ok(candidateSymbols("HHL.B.TO").includes("HHL-B.TO"));
    assert.equal(stripShareClass("HHL-B.TO"), "HHL");
  });

  it("does not treat Rogers class B as a Harvest fund", () => {
    assert.equal(catalogInstrument("RCI-B.TO"), undefined);
    assert.equal(applyAlias("RCI.B.TO"), "RCI-B.TO");
  });
});

describe("harvest / evolve / purpose look-through", () => {
  it("unrolls HHL to healthcare stocks, not the ETF", () => {
    const result = lookthrough(["HHL.TO"]);
    const syms = result.leaves.map((l) => l.displaySymbol);
    assert.ok(syms.includes("LLY"));
    assert.ok(syms.includes("JNJ"));
    assert.ok(syms.includes("UNH"));
    assert.equal(result.leaves.filter((l) => l.kind === "etf").length, 0);
  });

  it("unrolls HDIF through nested Harvest ETFs into names like NVDA and LLY", () => {
    const result = lookthrough(["HDIF.TO"]);
    const syms = new Set(result.leaves.map((l) => l.displaySymbol));
    assert.ok(syms.has("NVDA"), "HDIF should own NVDA via HTA/HBF/HHIH");
    assert.ok(syms.has("LLY"), "HDIF should own LLY via HHL");
    assert.ok(syms.has("MSFT"));
    assert.ok(!syms.has("HTA") && !syms.has("HHL"), "nested Harvest ETFs must not remain as leaves");
    assert.equal(result.leaves.filter((l) => l.kind === "etf").length, 0);
  });

  it("unrolls HDIF class B the same way", () => {
    const result = lookthrough(["HDIF.B.TO"]);
    assert.ok(result.leaves.some((l) => l.displaySymbol === "NVDA"));
    assert.ok(result.leaves.some((l) => l.displaySymbol === "JPM"));
  });

  it("unrolls Evolve BANK and LIFE to single stocks", () => {
    const bank = lookthrough(["BANK.TO"]);
    const life = lookthrough(["LIFE.B.TO"]);
    const bankSyms = new Set(bank.leaves.map((l) => l.displaySymbol));
    const lifeSyms = new Set(life.leaves.map((l) => l.displaySymbol));
    assert.ok(bankSyms.has("RY") && bankSyms.has("TD") && bankSyms.has("BNS"));
    assert.ok(lifeSyms.has("JNJ") && lifeSyms.has("LLY") && lifeSyms.has("PFE"));
    assert.equal(bank.leaves.filter((l) => l.kind === "etf").length, 0);
    assert.equal(life.leaves.filter((l) => l.kind === "etf").length, 0);
  });

  it("unrolls Purpose PDF to Canadian banks plus US dividend names", () => {
    const result = lookthrough(["PDF.TO"]);
    const syms = new Set(result.leaves.map((l) => l.displaySymbol));
    assert.ok(syms.has("TD") && syms.has("RY") && syms.has("ABBV"));
    assert.equal(result.leaves.filter((l) => l.kind === "etf").length, 0);
  });
});

describe("this book: bitcoin, XEQT, Global X, Purpose cash", () => {
  it("unrolls XEQT through XIC/ITOT into RY and NVDA", () => {
    const result = lookthrough(["XEQT.TO"]);
    const syms = new Set(result.leaves.map((l) => l.displaySymbol));
    assert.ok(syms.has("NVDA"), "US sleeve");
    assert.ok(syms.has("RY"), "Canadian sleeve");
    assert.ok(!syms.has("XIC") && !syms.has("ITOT"));
  });

  it("unrolls ENCL through ENCC into Canadian energy stocks", () => {
    const result = lookthrough(["ENCL.TO"]);
    const syms = new Set(result.leaves.map((l) => l.displaySymbol));
    assert.ok(syms.has("CVE") && syms.has("CNQ") && syms.has("SU"));
    assert.ok(!syms.has("ENCC"));
  });

  it("unrolls BKCL through BKCC into the big six banks", () => {
    const result = lookthrough(["BKCL.TO"]);
    const syms = new Set(result.leaves.map((l) => l.displaySymbol));
    assert.ok(syms.has("RY") && syms.has("TD") && syms.has("NA"));
    assert.ok(!syms.has("BKCC"));
  });

  it("unrolls HBIX and BDAY into bitcoin via IBIT", () => {
    const hbix = lookthrough(["HBIX.NE"]);
    const bday = lookthrough(["BDAY.NE"]);
    assert.ok(hbix.leaves.some((l) => l.displaySymbol === "BTC"));
    assert.ok(bday.leaves.some((l) => l.displaySymbol === "BTC"));
    assert.ok(bday.leaves.some((l) => l.displaySymbol === "NVDA"), "BDAY also holds QQQM");
  });

  it("unrolls MSTE and HBTE into Strategy / Coinbase", () => {
    const mste = lookthrough(["MSTE.TO"]);
    const hbte = lookthrough(["HBTE.NE"]);
    assert.ok(mste.leaves.some((l) => l.displaySymbol === "MSTR"));
    assert.ok(hbte.leaves.some((l) => l.displaySymbol === "COIN"));
    assert.ok(hbte.leaves.some((l) => l.displaySymbol === "BTC"), "via IBIT");
  });

  it("treats Purpose PSA.TO as cash, not Public Storage", () => {
    const psa = catalogInstrument("PSA.TO");
    assert.ok(psa?.holdings?.some((h) => h.symbol === "CASH"));
    assert.equal(catalogInstrument("PSA"), undefined);
    const result = lookthrough(["PSA.TO"]);
    assert.ok(result.leaves.some((l) => l.kind === "cash"));
    assert.ok(!result.leaves.some((l) => l.displaySymbol === "PSA" && l.kind === "equity"));
  });

  it("maps KILO class B to gold bullion", () => {
    const cat = catalogInstrument("KILO.B.TO");
    assert.ok(cat?.holdings?.some((h) => h.symbol.includes("XAU") || h.sector === "Gold"));
  });

  it("unrolls HHIS through Harvest Enhanced HIS ETFs into the single stocks", () => {
    const result = lookthrough(["HHIS.TO"]);
    const syms = new Set(result.leaves.map((l) => l.displaySymbol));
    assert.ok(syms.has("NVDA") && syms.has("AAPL") && syms.has("MSFT"));
    assert.ok(syms.has("MSTR"), "via MSTE");
    assert.ok(syms.has("SOFI") && syms.has("HOOD"));
    assert.ok(!syms.has("NVHE") && !syms.has("APLE") && !syms.has("MSHE"));
    const childTickers = result.trees[0]?.children.map((c) => c.displaySymbol) ?? [];
    assert.ok(childTickers.includes("NVHE"));
    assert.ok(childTickers.includes("APLE"));
  });

  it("unrolls CMAX through Hamilton MAX ETFs into RY and NVDA", () => {
    const result = lookthrough(["CMAX.TO"]);
    const syms = new Set(result.leaves.map((l) => l.displaySymbol));
    assert.ok(syms.has("RY"), "via HMAX");
    assert.ok(syms.has("NVDA"), "via QMAX");
    assert.ok(!syms.has("HMAX") && !syms.has("QMAX") && !syms.has("UMAX"));
  });

  it("unrolls IMAX through IEFA/EFA into EAFE names", () => {
    const result = lookthrough(["IMAX.TO"]);
    const syms = new Set(result.leaves.map((l) => l.displaySymbol));
    assert.ok(syms.has("ASML") && syms.has("SAP"));
    assert.ok(!syms.has("IEFA") && !syms.has("EFA"));
    assert.equal(catalogInstrument("IMAX"), undefined);
  });

  it("unrolls EASY through BIGY and CANY into NVDA and RY", () => {
    const result = lookthrough(["EASY.TO"]);
    const syms = new Set(result.leaves.map((l) => l.displaySymbol));
    assert.ok(syms.has("NVDA"), "US UltraYield");
    assert.ok(syms.has("RY"), "Canadian UltraYield");
    assert.ok(!syms.has("BIGY") && !syms.has("CANY") && !syms.has("INTY"));
  });

  it("catalogs every ETF in the loaded book", () => {
    const skip = new Set([
      "CASH",
      "BTC-USD",
      "ETH-USD",
      "XAUUSD=X",
      "AMD.TO",
      "AMZN.TO",
      "NVDA.TO",
      "TSLA.TO",
      "GOOG.TO",
      "MSFT.TO",
      "META.TO",
      "BRK.TO",
      "PLTR.TO",
      "LULU.TO",
      "TSLA",
      "AAPL",
      "SOFI",
      "MSFT",
    ]);
    for (const p of SAMPLE_POSITIONS) {
      const a = applyAlias(p.ticker);
      if (skip.has(a) || skip.has(p.ticker)) continue;
      const cat = catalogInstrument(a);
      assert.ok(cat?.holdings?.length, `${p.ticker} (${a}) should have catalog holdings`);
    }
  });
});
