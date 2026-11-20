export type TechPoint = {
  date: string;
  close: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  upper: number | null;
  lower: number | null;
  rsi: number | null;
  macd: number | null;
  signal: number | null;
  hist: number | null;
  volume: number;
  volAvg: number | null;
};

export type TechRead = {
  trend: string;
  momentum: string;
  volatility: string;
  summary: string;
};

export type TechStats = {
  rsi: number | null;
  atr: number | null;
  atrPct: number | null;
  dist200: number | null;
  macdState: string;
  volRatio: number | null;
  band: string;
};

export type TechBook = {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  asOf: string;
  points: TechPoint[];
  read: TechRead;
  stats: TechStats;
};

export type Bar = { date: string; high: number; low: number; close: number; volume: number };

export function cleanSymbol(value: string): string {
  const symbol = value.trim().toUpperCase().replace(/\s+/g, "").replace(/\$/g, "");
  if (!/^[A-Z0-9^][A-Z0-9.\-]{0,14}$/.test(symbol)) return "";
  return symbol;
}

export function buildBook(input: {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  bars: Bar[];
}): TechBook {
  const bars = input.bars.filter((bar) => bar.close > 0 && bar.high > 0 && bar.low > 0);
  const closes = bars.map((bar) => bar.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = closes.map((_, i) => (ema12[i] == null || ema26[i] == null ? null : (ema12[i] as number) - (ema26[i] as number)));
  const signal = emaNullable(macdLine, 9);
  const bands = bollinger(closes, 20, 2);
  const rsi = wilderRsi(closes, 14);
  const atr = wilderAtr(bars, 14);
  const volAvg = sma(bars.map((bar) => bar.volume), 20);
  const points: TechPoint[] = bars.map((bar, i) => ({
    date: bar.date,
    close: round(bar.close),
    sma20: roundOrNull(sma20[i]),
    sma50: roundOrNull(sma50[i]),
    sma200: roundOrNull(sma200[i]),
    upper: roundOrNull(bands.upper[i]),
    lower: roundOrNull(bands.lower[i]),
    rsi: roundOrNull(rsi[i], 1),
    macd: roundOrNull(macdLine[i], 3),
    signal: roundOrNull(signal[i], 3),
    hist: macdLine[i] == null || signal[i] == null ? null : round((macdLine[i] as number) - (signal[i] as number), 3),
    volume: bar.volume,
    volAvg: roundOrNull(volAvg[i], 0),
  }));
  const shown = points.slice(-180);
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const stats = last ? statsOf(last, prev, atr[atr.length - 1] ?? null, input.price) : emptyStats();
  return {
    symbol: input.symbol,
    name: input.name,
    currency: input.currency,
    price: input.price,
    asOf: last?.date ?? "",
    points: shown,
    read: last ? readOf(last, prev, stats) : { trend: "No history", momentum: "No history", volatility: "No history", summary: "Not enough closes to score." },
    stats,
  };
}

function statsOf(last: TechPoint, prev: TechPoint | undefined, atr: number | null, price: number): TechStats {
  const volRatio = last.volAvg && last.volAvg > 0 ? last.volume / last.volAvg : null;
  const dist200 = last.sma200 && last.sma200 > 0 ? ((last.close - last.sma200) / last.sma200) * 100 : null;
  const histUp = prev?.hist != null && last.hist != null && last.hist > prev.hist;
  const macdState = last.hist == null ? "Not enough history" : last.hist > 0 ? (histUp ? "Above zero, rising" : "Above zero, fading") : histUp ? "Below zero, recovering" : "Below zero, falling";
  const band = last.upper == null || last.lower == null ? "No band" : last.close > last.upper ? "Above the upper band" : last.close < last.lower ? "Below the lower band" : "Inside the bands";
  return {
    rsi: last.rsi,
    atr: atr == null ? null : round(atr),
    atrPct: atr == null || price <= 0 ? null : round((atr / price) * 100, 2),
    dist200: dist200 == null ? null : round(dist200, 1),
    macdState,
    volRatio: volRatio == null ? null : round(volRatio, 2),
    band,
  };
}

function readOf(last: TechPoint, prev: TechPoint | undefined, stats: TechStats): TechRead {
  const up = last.sma200 != null && last.sma50 != null && last.close > last.sma200 && last.sma50 > last.sma200;
  const down = last.sma200 != null && last.sma50 != null && last.close < last.sma200 && last.sma50 < last.sma200;
  const trend = up
    ? "Uptrend. Price is above a rising intermediate average and the 200-day."
    : down
      ? "Downtrend. Price is below the 50-day and the 200-day."
      : "Mixed. The 50-day and 200-day do not agree, so trend trades are late or choppy.";
  const momentum = last.rsi == null
    ? "RSI needs more history."
    : last.rsi >= 70
      ? "RSI is extended. In a trend that can persist; it is not an automatic sell."
      : last.rsi <= 30
        ? "RSI is washed out. That is a momentum extreme, not a buy by itself."
        : last.rsi >= 50
          ? "RSI is on the strong side of neutral."
          : "RSI is on the weak side of neutral.";
  const volatility = stats.band === "Above the upper band"
    ? "Price is outside the upper Bollinger band, so the move is stretched versus the last 20 sessions."
    : stats.band === "Below the lower band"
      ? "Price is outside the lower Bollinger band. That is a volatility extreme, not a floor."
      : "Price is inside the 20-day bands. A squeeze is the narrow-band case, not this print by itself.";
  const volume = stats.volRatio == null ? "" : stats.volRatio >= 1.5 ? " Volume is well above its 20-day average." : stats.volRatio <= 0.7 ? " Volume is light versus the last 20 sessions." : "";
  const cross = prev?.hist != null && last.hist != null && prev.hist <= 0 && last.hist > 0
    ? " MACD just crossed above its signal."
    : prev?.hist != null && last.hist != null && prev.hist >= 0 && last.hist < 0
      ? " MACD just crossed below its signal."
      : "";
  return {
    trend,
    momentum,
    volatility,
    summary: `${trend} ${momentum}${cross}${volume}`,
  };
}

function emptyStats(): TechStats {
  return { rsi: null, atr: null, atrPct: null, dist200: null, macdState: "No history", volRatio: null, band: "No band" };
}

function sma(values: number[], length: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    out.push(i + 1 >= length ? sum / length : null);
  }
  return out;
}

function ema(values: number[], length: number): Array<number | null> {
  const out: Array<number | null> = [];
  const k = 2 / (length + 1);
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < values.length; i += 1) {
    seed += values[i];
    if (i + 1 < length) {
      out.push(null);
      continue;
    }
    const next = prev == null ? seed / length : values[i] * k + prev * (1 - k);
    prev = next;
    out.push(next);
  }
  return out;
}

function emaNullable(values: Array<number | null>, length: number): Array<number | null> {
  const out: Array<number | null> = [];
  const k = 2 / (length + 1);
  const window: number[] = [];
  let prev: number | null = null;
  for (const value of values) {
    if (value == null || prev == null && window.length < length) {
      if (value != null) window.push(value);
      if (window.length === length && prev == null) {
        prev = window.reduce((sum, item) => sum + item, 0) / length;
        out.push(prev);
      } else {
        out.push(null);
      }
      continue;
    }
    prev = value * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function bollinger(values: number[], length: number, width: number): { upper: Array<number | null>; lower: Array<number | null> } {
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < length) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = values.slice(i + 1 - length, i + 1);
    const mean = slice.reduce((sum, item) => sum + item, 0) / length;
    const variance = slice.reduce((sum, item) => sum + (item - mean) ** 2, 0) / length;
    const sd = Math.sqrt(variance);
    upper.push(mean + width * sd);
    lower.push(mean - width * sd);
  }
  return { upper, lower };
}

function wilderRsi(values: number[], length: number): Array<number | null> {
  const out: Array<number | null> = [null];
  if (values.length <= length) return values.map(() => null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= length; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gain += change;
    else loss -= change;
    out.push(null);
  }
  let avgGain = gain / length;
  let avgLoss = loss / length;
  out[length] = rsi(avgGain, avgLoss);
  for (let i = length + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    avgGain = (avgGain * (length - 1) + Math.max(change, 0)) / length;
    avgLoss = (avgLoss * (length - 1) + Math.max(-change, 0)) / length;
    out[i] = rsi(avgGain, avgLoss);
  }
  return out;
}

function rsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function wilderAtr(bars: Bar[], length: number): Array<number | null> {
  const out: Array<number | null> = [null];
  const trs: number[] = [bars[0] ? bars[0].high - bars[0].low : 0];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = bars[i - 1].close;
    trs.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev)));
    out.push(null);
  }
  if (trs.length <= length) return out;
  let atr = trs.slice(1, length + 1).reduce((sum, value) => sum + value, 0) / length;
  out[length] = atr;
  for (let i = length + 1; i < trs.length; i += 1) {
    atr = (atr * (length - 1) + trs[i]) / length;
    out[i] = atr;
  }
  return out;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundOrNull(value: number | null | undefined, digits = 2): number | null {
  return value == null || !Number.isFinite(value) ? null : round(value, digits);
}
