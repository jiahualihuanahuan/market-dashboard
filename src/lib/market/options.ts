export type OptQuote = {
  strike: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  iv: number | null;
  oi: number;
  volume: number;
};

export type OptExpiry = {
  ts: number;
  calls: OptQuote[];
  puts: OptQuote[];
};

export type OptBook = {
  symbol: string;
  name: string;
  kind: string;
  price: number;
  currency: string;
  dividend: number;
  rate: number;
  rateLabel: string;
  realized20: number | null;
  realized60: number | null;
  missed: number;
  expiries: OptExpiry[];
};

export type GreekSet = {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
};

export type SideView = OptQuote & { greeks: GreekSet | null };

export type StrikeRow = {
  strike: number;
  call: SideView | null;
  put: SideView | null;
};

export type Verdict = "Expensive" | "A bit expensive" | "Fair" | "A bit cheap" | "Cheap" | "Unknown";

export const ALL_EXPIRIES = "all";

export function cleanSymbol(raw: string): string {
  let symbol = raw.trim().toUpperCase().replace(/^\$/, "").replace(/\s+/g, "");
  if (/^[A-Z]{1,5}\.[A-Z]$/.test(symbol)) symbol = symbol.replace(".", "-");
  return symbol;
}

export function expiryKey(expiry: OptExpiry): string {
  return String(expiry.ts);
}

export function daysUntil(ts: number, now = Date.now()): number {
  return Math.max(0, (ts * 1000 - now) / 86_400_000);
}

export function yearFraction(ts: number, now = Date.now()): number {
  return Math.max(daysUntil(ts, now) / 365, 0.5 / 365);
}

export function buildRows(book: OptBook, key: string, now = Date.now()): StrikeRow[] {
  if (key === ALL_EXPIRIES) return aggregateRows(book);
  const expiry = book.expiries.find((item) => expiryKey(item) === key) ?? book.expiries[0];
  if (!expiry) return [];
  return joinSides(expiry.calls, expiry.puts, (quote, call) => sideGreeks(book, quote, expiry.ts, call, now));
}

export function nearestExpiry(book: OptBook, now = Date.now()): OptExpiry | null {
  const live = book.expiries.filter((item) => item.ts * 1000 >= now - 36 * 3_600_000);
  const pool = live.length ? live : book.expiries;
  return [...pool].sort((a, b) => a.ts - b.ts)[0] ?? null;
}

export function atmStrike(rows: StrikeRow[], spot: number): number | null {
  let best: number | null = null;
  let gap = Infinity;
  for (const row of rows) {
    const next = Math.abs(row.strike - spot);
    if (next < gap) {
      gap = next;
      best = row.strike;
    }
  }
  return best;
}

export function maxPain(rows: StrikeRow[]): number | null {
  const used = rows.filter((row) => oi(row.call) + oi(row.put) > 0);
  if (!used.length) return null;
  let bestStrike = used[0].strike;
  let bestPain = Infinity;
  for (const target of used) {
    let pain = 0;
    for (const row of used) {
      pain += Math.max(0, target.strike - row.strike) * oi(row.call);
      pain += Math.max(0, row.strike - target.strike) * oi(row.put);
    }
    if (pain < bestPain) {
      bestPain = pain;
      bestStrike = target.strike;
    }
  }
  return bestStrike;
}

export function openInterest(rows: StrikeRow[]): { calls: number; puts: number; callVolume: number; putVolume: number } {
  return rows.reduce(
    (sum, row) => ({
      calls: sum.calls + oi(row.call),
      puts: sum.puts + oi(row.put),
      callVolume: sum.callVolume + (row.call?.volume ?? 0),
      putVolume: sum.putVolume + (row.put?.volume ?? 0),
    }),
    { calls: 0, puts: 0, callVolume: 0, putVolume: 0 },
  );
}

export function atmIv(rows: StrikeRow[], spot: number): number | null {
  const row = rows.find((item) => item.strike === atmStrike(rows, spot));
  if (!row) return null;
  return blendIv(row.call, row.put);
}

export function ivVerdict(iv: number | null, realized: number | null): { label: Verdict; detail: string } {
  if (iv == null || realized == null || realized <= 0.01) {
    return {
      label: "Unknown",
      detail: "Implied volatility is the yearly move baked into the option price. There is not enough recent stock movement on the feed to say whether that price is high or low.",
    };
  }
  const ratio = iv / realized;
  const priced = pct(iv);
  const moved = pct(realized);
  if (ratio >= 1.35) {
    return { label: "Expensive", detail: `The option charges for a ${priced} yearly move. The stock has actually moved about ${moved} over the last 20 sessions, annualized. Buyers are paying a clear premium over recent movement.` };
  }
  if (ratio >= 1.15) {
    return { label: "A bit expensive", detail: `The option charges for a ${priced} yearly move, above the ${moved} pace of the last 20 sessions.` };
  }
  if (ratio <= 0.75) {
    return { label: "Cheap", detail: `The option charges for a ${priced} yearly move, well under the ${moved} pace of the last 20 sessions.` };
  }
  if (ratio <= 0.9) {
    return { label: "A bit cheap", detail: `The option charges for a ${priced} yearly move, a little under the ${moved} pace of the last 20 sessions.` };
  }
  return { label: "Fair", detail: `The option charges for a ${priced} yearly move, close to the ${moved} pace of the last 20 sessions.` };
}

export function expectedMove(spot: number, iv: number | null, ts: number, now = Date.now()): number | null {
  if (iv == null || spot <= 0) return null;
  return spot * iv * Math.sqrt(Math.max(daysUntil(ts, now), 0.5) / 365);
}

export function chartWindow(rows: StrikeRow[], spot: number, pain: number | null): StrikeRow[] {
  const ranked = [...rows].sort((a, b) => a.strike - b.strike);
  const interesting = ranked.filter((row) => oi(row.call) + oi(row.put) > 0);
  const pool = interesting.length >= 8 ? interesting : ranked;
  if (pool.length <= 70) return pool;
  let anchor = 0;
  let gap = Infinity;
  pool.forEach((row, index) => {
    const next = Math.abs(row.strike - spot);
    if (next < gap) {
      gap = next;
      anchor = index;
    }
  });
  let start = Math.max(0, anchor - 30);
  let end = Math.min(pool.length, start + 60);
  start = Math.max(0, end - 60);
  if (pain != null) {
    const painAt = pool.findIndex((row) => row.strike === pain);
    if (painAt >= 0 && (painAt < start || painAt >= end)) {
      start = Math.max(0, Math.min(painAt, anchor) - 8);
      end = Math.min(pool.length, Math.max(painAt, anchor) + 8);
    }
  }
  return pool.slice(start, end);
}

export function termRows(book: OptBook, now = Date.now()) {
  return book.expiries.map((expiry) => {
    const rows = buildRows(book, expiryKey(expiry), now);
    const strike = atmStrike(rows, book.price);
    const row = rows.find((item) => item.strike === strike) ?? null;
    const iv = row ? blendIv(row.call, row.put) : null;
    const interest = openInterest(rows);
    return {
      ts: expiry.ts,
      days: daysUntil(expiry.ts, now),
      strike,
      iv,
      callDelta: row?.call?.greeks?.delta ?? null,
      putDelta: row?.put?.greeks?.delta ?? null,
      theta: row?.call?.greeks?.theta ?? null,
      vega: row?.call?.greeks?.vega ?? null,
      gamma: row?.call?.greeks?.gamma ?? null,
      rho: row?.call?.greeks?.rho ?? null,
      move: expectedMove(book.price, iv, expiry.ts, now),
      callOi: interest.calls,
      putOi: interest.puts,
      pain: maxPain(rows),
    };
  });
}

function sideGreeks(book: OptBook, quote: OptQuote, ts: number, call: boolean, now: number): GreekSet | null {
  const both = bsBoth({
    spot: book.price,
    strike: quote.strike,
    iv: quote.iv,
    tYears: yearFraction(ts, now),
    rate: book.rate,
    dividend: book.dividend,
  });
  if (!both) return null;
  return call ? both.call : both.put;
}

function aggregateRows(book: OptBook): StrikeRow[] {
  const map = new Map<number, { call: Bucket; put: Bucket }>();
  const empty = (): Bucket => ({ ivW: 0, ivWt: 0, oi: 0, volume: 0, seen: false });
  for (const expiry of book.expiries) {
    for (const [list, side] of [[expiry.calls, "call"], [expiry.puts, "put"]] as const) {
      for (const quote of list) {
        const key = roundStrike(quote.strike);
        const row = map.get(key) ?? { call: empty(), put: empty() };
        map.set(key, row);
        const slot = row[side];
        slot.seen = true;
        slot.oi += quote.oi;
        slot.volume += quote.volume;
        if (saneIv(quote.iv) && quote.oi > 0) {
          slot.ivW += quote.iv * quote.oi;
          slot.ivWt += quote.oi;
        }
      }
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([strike, row]) => ({
      strike,
      call: row.call.seen ? finishBucket(strike, row.call) : null,
      put: row.put.seen ? finishBucket(strike, row.put) : null,
    }));
}

type Bucket = { ivW: number; ivWt: number; oi: number; volume: number; seen: boolean };

function finishBucket(strike: number, slot: Bucket): SideView {
  return {
    strike,
    bid: null,
    ask: null,
    last: null,
    iv: slot.ivWt > 0 ? slot.ivW / slot.ivWt : null,
    oi: slot.oi,
    volume: slot.volume,
    greeks: null,
  };
}

function joinSides(calls: OptQuote[], puts: OptQuote[], decorate: (quote: OptQuote, call: boolean) => GreekSet | null): StrikeRow[] {
  const map = new Map<number, StrikeRow>();
  const touch = (strike: number) => {
    const key = roundStrike(strike);
    const found = map.get(key);
    if (found) return found;
    const row: StrikeRow = { strike: key, call: null, put: null };
    map.set(key, row);
    return row;
  };
  for (const quote of calls) {
    const row = touch(quote.strike);
    row.call = { ...quote, strike: row.strike, greeks: decorate(quote, true) };
  }
  for (const quote of puts) {
    const row = touch(quote.strike);
    row.put = { ...quote, strike: row.strike, greeks: decorate(quote, false) };
  }
  return [...map.values()].sort((a, b) => a.strike - b.strike);
}

type Both = { call: GreekSet; put: GreekSet };

function bsBoth(input: { spot: number; strike: number; iv: number | null; tYears: number; rate: number; dividend: number }): Both | null {
  const { spot, strike, iv, tYears, rate, dividend } = input;
  if (iv == null || iv <= 0.005 || iv > 5 || spot <= 0 || strike <= 0 || tYears <= 0) return null;
  const vol = iv * Math.sqrt(tYears);
  const d1 = (Math.log(spot / strike) + (rate - dividend + 0.5 * iv * iv) * tYears) / vol;
  const d2 = d1 - vol;
  const discS = Math.exp(-dividend * tYears);
  const discK = Math.exp(-rate * tYears);
  const pdf = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  const gamma = (discS * pdf) / (spot * iv * Math.sqrt(tYears));
  const vega = (spot * discS * pdf * Math.sqrt(tYears)) / 100;
  const callNd2 = normCdf(d2);
  const putNd2 = normCdf(-d2);
  const callNd1 = normCdf(d1);
  const putNd1 = normCdf(-d1);
  return {
    call: {
      delta: discS * callNd1,
      gamma,
      theta: (-(spot * discS * pdf * iv) / (2 * Math.sqrt(tYears)) - rate * strike * discK * callNd2 + dividend * spot * discS * callNd1) / 365,
      vega,
      rho: (strike * tYears * discK * callNd2) / 100,
    },
    put: {
      delta: discS * (callNd1 - 1),
      gamma,
      theta: (-(spot * discS * pdf * iv) / (2 * Math.sqrt(tYears)) + rate * strike * discK * putNd2 - dividend * spot * discS * putNd1) / 365,
      vega,
      rho: (-strike * tYears * discK * putNd2) / 100,
    },
  };
}

function oi(side: SideView | null): number {
  return side?.oi ?? 0;
}

function blendIv(call: SideView | null, put: SideView | null): number | null {
  const ivs = [call?.iv, put?.iv].filter((iv): iv is number => saneIv(iv));
  if (!ivs.length) return null;
  return ivs.reduce((sum, iv) => sum + iv, 0) / ivs.length;
}

function saneIv(iv: number | null | undefined): iv is number {
  return iv != null && iv > 0.01 && iv < 3;
}

function roundStrike(strike: number): number {
  return Math.round(strike * 10000) / 10000;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-a * a);
  return 0.5 * (1 + sign * y);
}
