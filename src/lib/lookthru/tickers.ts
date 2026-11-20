const EXCHANGE_SUFFIX = /\.(TO|NE|V|CN|NEO)$/i;

export const ALIASES: Record<string, string> = {
  QDAY: "QDAY.NE",
  "QDAY.TO": "QDAY.NE",
  SDAY: "SDAY.NE",
  "SDAY.TO": "SDAY.NE",
  CDAY: "CDAY.NE",
  "CDAY.TO": "CDAY.NE",
  BDAY: "BDAY.NE",
  "BDAY.TO": "BDAY.NE",
  HYLD: "HYLD.TO",
  "HYLD.U": "HYLD.TO",
  XDIV: "XDIV.TO",
  SMAX: "SMAX.TO",
  QMAX: "QMAX.TO",
  QMVP: "QMVP.TO",
  FMAX: "FMAX.TO",
  LMAX: "LMAX.TO",
  AMAX: "AMAX.TO",
  EMAX: "EMAX.TO",
  RMAX: "RMAX.TO",
  SMVP: "SMVP.TO",
  XIU: "XIU.TO",
  XIC: "XIC.TO",
  XEQT: "XEQT.TO",
  XEF: "XEF.TO",
  XEC: "XEC.TO",
  XTOT: "XTOT.TO",
  VFV: "VFV.TO",
  VEQT: "VEQT.TO",
  ZCN: "ZCN.TO",
  HMAX: "HMAX.TO",
  HDIV: "HDIV.TO",
  HFIN: "HFIN.TO",
  UMAX: "UMAX.TO",
  HUTS: "HUTS.TO",
  HFN: "HFN.TO",
  UMVP: "UMVP.TO",
  CMVP: "CMVP.TO",
  "RCI.B": "RCI-B.TO",
  "RCI.B.TO": "RCI-B.TO",
  "RCI/B": "RCI-B.TO",
  "RCI-B": "RCI-B.TO",
  "BIP.UN": "BIP.UN.TO",
  "BIP-UN": "BIP.UN.TO",
  "BIP-U": "BIP.UN.TO",
  "BEP.UN": "BEP.UN.TO",
  "BEP-U": "BEP.UN.TO",
  "XLK.TO": "XLK",
  "QQQ.TO": "QQQ",
  "SPY.TO": "SPY",
  "VOO.TO": "VOO",
  HHL: "HHL.TO",
  HTA: "HTA.TO",
  HBF: "HBF.TO",
  HDIF: "HDIF.TO",
  HRIF: "HRIF.TO",
  HUTL: "HUTL.TO",
  HUBL: "HUBL.TO",
  HIND: "HIND.TO",
  TRVI: "TRVI.TO",
  HLIF: "HLIF.TO",
  "HLIF.NE": "HLIF.TO",
  HHIH: "HHIH.TO",
  HHIS: "HHIS.TO",
  HPYG: "HPYG.TO",
  HHLE: "HHLE.TO",
  HTAE: "HTAE.TO",
  HBFE: "HBFE.TO",
  HUTE: "HUTE.TO",
  HVOL: "HVOL.TO",
  HVOI: "HVOL.TO",
  "HVOI.TO": "HVOL.TO",
  HPF: "HPF.TO",
  HGR: "HGR.TO",
  HGGG: "HGGG.TO",
  HBIG: "HBIG.TO",
  HBIX: "HBIX.NE",
  "HBIX.TO": "HBIX.NE",
  HBTE: "HBTE.NE",
  "HBTE.TO": "HBTE.NE",
  MSTE: "MSTE.TO",
  MSTY: "MSTY.TO",
  NVHE: "NVHE.TO",
  NVDH: "NVDH.TO",
  LIFE: "LIFE.TO",
  BANK: "BANK.TO",
  CALL: "CALL.TO",
  UTES: "UTES.TO",
  BASE: "BASE.TO",
  TECH: "TECH.TO",
  QQQY: "QQQY.TO",
  ESPX: "ESPX.TO",
  ETSX: "ETSX.TO",
  BIGY: "BIGY.TO",
  SIXY: "SIXY.TO",
  PDF: "PDF.TO",
  PYF: "PYF.TO",
  PAYF: "PAYF.TO",
  KILO: "KILO.TO",
  "PSA.TO": "PSA.TO",
  BTCC: "BTCC.TO",
  ENCL: "ENCL.TO",
  ENCC: "ENCC.TO",
  BKCL: "BKCL.TO",
  BKCC: "BKCC.TO",
  BMAX: "BMAX.TO",
  MREL: "MREL.TO",
  QCN: "QCN.TO",
  QUU: "QUU.TO",
  ZEA: "ZEA.TO",
  ZCB: "ZCB.TO",
  CMAX: "CMAX.TO",
  CANY: "CANY.TO",
  INTY: "INTY.TO",
  EASY: "EASY.TO",
  TECY: "TECY.TO",
  OILY: "OILY.TO",
  MSHE: "MSHE.TO",
  LLHE: "LLHE.TO",
  AMHE: "AMHE.TO",
  GOGY: "GOGY.TO",
  PLTE: "PLTE.TO",
  AVGY: "AVGY.TO",
  CRWY: "CRWY.TO",
  COSY: "COSY.TO",
  METE: "METE.TO",
  HODY: "HODY.TO",
  SOFY: "SOFY.TO",
  SPXE: "SPXE.TO",
  RDDY: "RDDY.TO",
  CNYE: "CNYE.TO",
  CRCY: "CRCY.TO",
  LLYH: "LLYH.TO",
  AMZH: "AMZH.TO",
  MSFH: "MSFH.TO",
  HHIC: "HHIC.TO",
  SHPE: "SHPE.TO",
  RYHE: "RYHE.TO",
  TDHE: "TDHE.TO",
  ENBE: "ENBE.TO",
  CNQE: "CNQE.TO",
  AEME: "AEME.TO",
  CCOE: "CCOE.TO",
  SUHE: "SUHE.TO",
  "TSLY.TO": "TSLY.TO",
  "AMDY.TO": "AMDY.TO",
  "NFLY.TO": "NFLY.TO",
  "CONY.TO": "CONY.TO",
  "KEY.US": "KEY.US",
  "T.US": "T.US",
  BTC: "BTC-USD",
  ETH: "ETH-USD",
  XAU: "XAUUSD=X",
  "XAUUSD": "XAUUSD=X",
};

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Canadian ETF class shares (HHL.B.TO, HHL-B.TO, LIFE.U) share holdings
 * with the Class A fund. Stock share classes like RCI.B stay untouched
 * because those aliases are explicit above.
 */
export function applyAlias(ticker: string): string {
  const n = normalizeTicker(ticker);
  if (ALIASES[n]) return ALIASES[n];
  const classShare = n.match(/^([A-Z]{2,6})[.-]([ABU])(?:\.(TO|NE|V))?$/);
  if (classShare) {
    const base = classShare[1] ?? "";
    const cls = classShare[2] ?? "";
    const ex = (classShare[3] ?? "TO").toUpperCase();
    if (ALIASES[base] || ALIASES[`${base}.TO`] || ALIASES[`${base}.NE`]) {
      return `${base}-${cls}.${ex}`;
    }
  }
  return n;
}

export function issuerKey(symbol: string): string {
  let s = normalizeTicker(symbol).replace(/\//g, ".");
  s = s.replace(/-([A-Z])$/u, ".$1");
  s = s.replace(EXCHANGE_SUFFIX, "");
  if (s.endsWith(".U") && s.length > 3) s = s.slice(0, -2);
  return s;
}

/** HHL-B / HHL.B / HHL.U → HHL so class shares share a catalog fund. */
export function stripShareClass(symbol: string): string {
  return issuerKey(symbol).replace(/[.-][ABU]$/i, "");
}

/** CDRs and share-class aliases so NVDA.TO and NVDA, BRK.TO and BRK.B roll up. */
export function equityKey(symbol: string): string {
  const k = issuerKey(symbol);
  if (k === "BRK" || k === "BRK.A" || k === "BRK-B") return "BRK.B";
  if (k === "GOOGL" || k === "GOOG") return "GOOG";
  if (k === "BTC" || k === "BTC-USD" || k === "BTCUSD" || k === "BTC.USD" || k === "XBTUSD") return "BTC-USD";
  if (k === "ETH" || k === "ETH-USD" || k === "ETHUSD" || k === "ETH.USD") return "ETH-USD";
  if (k === "XAUUSD=X" || k === "XAUUSD" || k === "GC=F" || k === "XAU") return "XAUUSD=X";
  return k;
}

export function displaySymbol(symbol: string): string {
  const n = normalizeTicker(symbol);
  if (n === "CASH") return "CASH";
  if (n === "OPTIONS") return "OPT";
  if (n === "OTHER") return "OTHER";
  if (n === "BTC-USD" || n === "BTC") return "BTC";
  if (n === "ETH-USD" || n === "ETH") return "ETH";
  if (n === "XAUUSD=X" || n === "XAU") return "XAU";
  return n.replace(EXCHANGE_SUFFIX, "").replace(/-([A-Z])$/u, ".$1");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function headerIndex(headers: string[], ...names: string[]): number {
  const want = names.map((n) => n.toLowerCase());
  return headers.findIndex((h) => want.includes(h.toLowerCase().trim()));
}

export function exchangeSuffix(exchange: string, mic = ""): string {
  const ex = exchange.toUpperCase();
  const m = mic.toUpperCase();
  if (ex.includes("TSX") || m === "XTSE" || m === "XTSX") return ".TO";
  if (ex.includes("CBOE CANADA") || ex.includes("NEO") || m === "NEOE" || m === "NEO") return ".NE";
  return "";
}

function listingFromBroker(symbol: string, exchange: string, mic: string, securityType: string): string | null {
  const st = securityType.toUpperCase();
  if (st === "OPTION" || st.includes("OPTION")) return null;
  const n = normalizeTicker(symbol);
  if (!n) return null;
  if (st === "CURRENCY") return n === "CAD" || n === "USD" ? "CASH" : null;
  if (st === "CRYPTOCURRENCY") {
    if (n === "BTC" || n === "XBT") return "BTC-USD";
    if (n === "ETH") return "ETH-USD";
    return n;
  }
  if (st === "PRECIOUS_METAL") return "XAUUSD=X";
  const sfx = exchangeSuffix(exchange, mic);
  if (!sfx) return n;
  if (EXCHANGE_SUFFIX.test(n)) return n;
  if (/\.[A-Z]$/i.test(n)) return `${n}${sfx}`;
  return `${n}${sfx}`;
}

/** Wealthsimple / Questrade-style holdings CSV, or ticker+shares lines. */
export function parseBrokerCsv(text: string): { ticker: string; shares: number }[] {
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const lines = rawLines.filter((ln) => ln.trim() && !/^\s*"?as of/i.test(ln));
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0] ?? "").map((h) => h.trim());
  const iSym = headerIndex(headers, "Symbol", "Ticker", "Symbol/Ticker");
  const iQty = headerIndex(headers, "Quantity", "Qty", "Shares", "Units");
  if (iSym < 0 || iQty < 0) return [];
  const iEx = headerIndex(headers, "Exchange");
  const iMic = headerIndex(headers, "MIC");
  const iType = headerIndex(headers, "Security Type", "Type", "Asset Type");
  const iDir = headerIndex(headers, "Position Direction", "Direction");
  const map = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const symbol = (cols[iSym] ?? "").trim();
    const qty = Number(String(cols[iQty] ?? "").replace(/,/g, ""));
    if (!symbol || !Number.isFinite(qty) || qty === 0) continue;
    const dir = (iDir >= 0 ? cols[iDir] : "LONG")?.toUpperCase() ?? "LONG";
    const signed = dir.includes("SHORT") ? -Math.abs(qty) : qty;
    const ticker = listingFromBroker(
      symbol,
      iEx >= 0 ? (cols[iEx] ?? "") : "",
      iMic >= 0 ? (cols[iMic] ?? "") : "",
      iType >= 0 ? (cols[iType] ?? "") : "",
    );
    if (!ticker) continue;
    map.set(ticker, (map.get(ticker) ?? 0) + signed);
  }
  return [...map.entries()]
    .filter(([, shares]) => shares !== 0)
    .map(([ticker, shares]) => ({ ticker, shares }));
}

export function parsePaste(text: string): { ticker: string; shares: number }[] {
  const csv = parseBrokerCsv(text);
  if (csv.length) return csv;
  const rows: { ticker: string; shares: number }[] = [];
  for (const line of text.split(/\n|;/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(
      /^([A-Za-z][A-Za-z0-9.\-/=]{0,20})[\s,=:\t]+(-?\d+(?:\.\d+)?)\s*$/,
    );
    if (!match) continue;
    const ticker = normalizeTicker(match[1] ?? "");
    const shares = Number(match[2]);
    if (!ticker || !Number.isFinite(shares) || shares === 0) continue;
    rows.push({ ticker, shares });
  }
  return rows;
}

export function candidateSymbols(ticker: string): string[] {
  const aliased = applyAlias(ticker);
  const n = normalizeTicker(ticker);
  const out = [aliased];
  if (n !== aliased) out.push(n);
  const extra: string[] = [];
  for (const s of out) {
    extra.push(s.replace(/\.([A-Z])\.(TO|NE)$/i, "-$1.$2"));
    extra.push(s.replace(/-([A-Z])\.(TO|NE)$/i, ".$1.$2"));
    extra.push(s.replace(/\.([A-Z])$/i, "-$1.TO"));
    extra.push(s.replace(/-([A-Z])$/i, ".$1.TO"));
  }
  out.push(...extra);
  if (!n.includes(".") && !n.includes("=") && !n.includes("-USD")) {
    out.push(`${n}.TO`, `${n}.NE`);
  }
  return [...new Set(out.filter(Boolean))];
}
