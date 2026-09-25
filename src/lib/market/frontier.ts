export type FrontierAnchor = {
  /** Forward-looking expected return, percent a year. Not the historical average. */
  forward: number;
  marketCap: number;
  /** 1 trusts the view as much as the equilibrium. Higher means the view is vague. */
  confidence: number;
  note: string;
};

export type FrontierSeries = {
  start: string;
  end: string;
  assets: { symbol: string; label: string }[];
  dates: string[];
  returns: number[][];
  anchors: FrontierAnchor[];
  inflation: number;
  billYield: number;
};

export type MixPoint = {
  ret: number;
  vol: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number | null;
  weights: number[];
};

export type ReturnBridge = {
  label: string;
  historical: number;
  forward: number;
  marketWeight: number;
  equilibrium: number;
  posterior: number;
  note: string;
};

export type FrontierModel = {
  start: string;
  end: string;
  days: number;
  rf: number;
  inflation: number;
  weightCap: number;
  assets: MixPoint[];
  labels: string[];
  corr: number[][];
  bridges: ReturnBridge[];
  frontier: MixPoint[];
  maxSharpe: MixPoint;
  calmest: MixPoint;
};

const YEAR = 252;
/** Five holdings cannot all stay at or under 15% and still sum to 100%. 20% is the mathematical floor. */
export const WEIGHT_CAP = 0.25;
const TAU = 0.05;
const RISK_AVERSION = 2.5;
const VOL_SHRINK = 0.35;
const CORR_SHRINK = 0.3;

export function buildFrontier(series: FrontierSeries): FrontierModel {
  const days = series.dates.length;
  const n = series.assets.length;
  const historical = series.returns.map((row) => avg(row) * YEAR * 100);
  const sample = covariance(series.returns).map((row) => row.map((value) => value * YEAR));
  const shrunk = shrinkCovariance(sample);
  const caps = series.anchors.map((anchor) => Math.max(anchor.marketCap, 0));
  const capTotal = caps.reduce((sum, value) => sum + value, 0);
  if (!(capTotal > 0)) throw new Error("Market weights could not be built.");
  const market = caps.map((value) => value / capTotal);
  const sigma = shrunk.map((row, index) => row.map((value, column) => (index === column ? value + 1e-8 : value)));
  const rf = series.billYield / 100;
  const equilibrium = multiply(sigma, market).map((value) => (RISK_AVERSION * value + rf) * 100);
  const posterior = blackLitterman(
    sigma,
    equilibrium.map((value) => value / 100),
    series.anchors.map((anchor) => anchor.forward / 100),
    series.anchors.map((anchor) => anchor.confidence),
    rf,
  );
  const mu = posterior.map((value) => value * 100);
  const percentCov = sigma.map((row) => row.map((value) => value * 10000));
  const assets = series.returns.map((_, index) => score(oneHot(n, index), mu, percentCov, series.billYield, series.returns));
  const cloud = cappedGrid(n, 0.02, WEIGHT_CAP).map((weights) => ({
    weights,
    ret: dot(weights, mu),
    vol: Math.sqrt(Math.max(dot(weights, multiply(percentCov, weights)), 0)),
  }));
  cloud.sort((a, b) => a.vol - b.vol || b.ret - a.ret);
  const chosen: typeof cloud = [];
  let bestReturn = -Infinity;
  for (const row of cloud) {
    if (row.ret > bestReturn + 0.03) {
      chosen.push(row);
      bestReturn = row.ret;
    }
  }
  const frontier = thin(chosen, 36).map((row) => score(row.weights, mu, percentCov, series.billYield, series.returns));
  const tangency = cloud.reduce((best, row) => {
    const sharpe = row.vol > 0.2 ? (row.ret - series.billYield) / row.vol : -Infinity;
    return sharpe > best.sharpe ? { sharpe, weights: row.weights } : best;
  }, { sharpe: -Infinity, weights: market.map((value) => Math.min(value, WEIGHT_CAP)) });
  const bridges = series.assets.map((asset, index) => ({
    label: asset.label,
    historical: round(historical[index] ?? 0),
    forward: round(series.anchors[index]?.forward ?? 0),
    marketWeight: round((market[index] ?? 0) * 100, 1),
    equilibrium: round(equilibrium[index] ?? 0),
    posterior: round(mu[index] ?? 0),
    note: series.anchors[index]?.note ?? "",
  }));
  return {
    start: series.start,
    end: series.end,
    days,
    rf: round(series.billYield),
    inflation: round(series.inflation),
    weightCap: WEIGHT_CAP * 100,
    assets,
    labels: series.assets.map((asset) => asset.label),
    corr: correlationFrom(sigma),
    bridges,
    frontier,
    maxSharpe: score(tangency.weights, mu, percentCov, series.billYield, series.returns),
    calmest: frontier[0] ?? assets[n - 1],
  };
}

export function mixWithinVol(model: FrontierModel, maxVol: number): MixPoint {
  let best = model.calmest;
  for (const point of model.frontier) {
    if (point.vol <= maxVol + 0.05 && point.ret >= best.ret) best = point;
  }
  return best;
}

function blackLitterman(sigma: number[][], equilibrium: number[], views: number[], confidence: number[], rf: number): number[] {
  const tauSigma = sigma.map((row) => row.map((value) => value * TAU));
  const priorPrecision = invert(tauSigma);
  const viewPrecision = sigma.map((row, index) => row.map((_, column) => (index === column ? 1 / Math.max(confidence[index] * TAU * sigma[index][index], 1e-10) : 0)));
  const left = add(priorPrecision, viewPrecision);
  const right = addVectors(
    multiply(priorPrecision, equilibrium.map((value) => value - rf)),
    multiply(viewPrecision, views.map((value) => value - rf)),
  );
  return multiply(invert(left), right).map((value) => value + rf);
}

function shrinkCovariance(sample: number[][]): number[][] {
  const vol = sample.map((row, index) => Math.sqrt(Math.max(row[index], 0)));
  const meanVol = avg(vol.filter((value) => value > 0.002));
  const shrunkVol = vol.map((value) => (1 - VOL_SHRINK) * value + VOL_SHRINK * meanVol);
  let corrSum = 0;
  let corrCount = 0;
  const corr = sample.map((row, i) => row.map((value, j) => {
    if (i === j || vol[i] * vol[j] <= 0) return i === j ? 1 : 0;
    const valueCorr = clamp(value / (vol[i] * vol[j]), -0.95, 0.95);
    corrSum += valueCorr;
    corrCount += 1;
    return valueCorr;
  }));
  const meanCorr = corrCount ? corrSum / corrCount : 0;
  return shrunkVol.map((left, i) => shrunkVol.map((right, j) => {
    if (i === j) return left * left;
    const mixed = (1 - CORR_SHRINK) * corr[i][j] + CORR_SHRINK * meanCorr;
    return mixed * left * right;
  }));
}

function score(weights: number[], mu: number[], cov: number[][], rf: number, returns: number[][]): MixPoint {
  return point(weights, mu, cov, rf, ratios(weights, returns));
}

function thin<T extends { ret: number; vol: number }>(rows: T[], count: number): T[] {
  if (rows.length <= count) return rows;
  const out: T[] = [];
  const last = rows.length - 1;
  for (let index = 0; index < count; index += 1) out.push(rows[Math.round((last * index) / (count - 1))]);
  return out;
}

function cappedGrid(size: number, step: number, cap: number): number[][] {
  const cells = Math.round(1 / step);
  const maxHold = Math.floor(cap / step + 1e-9);
  const out: number[][] = [];
  const acc = Array(size).fill(0);
  function walk(slot: number, remaining: number) {
    const slotsLeft = size - slot;
    if (remaining > maxHold * slotsLeft) return;
    if (slot === size - 1) {
      if (remaining <= maxHold) {
        acc[slot] = remaining / cells;
        out.push(acc.slice());
      }
      return;
    }
    const start = Math.max(0, remaining - maxHold * (slotsLeft - 1));
    for (let held = start; held <= Math.min(maxHold, remaining); held += 1) {
      acc[slot] = held / cells;
      walk(slot + 1, remaining - held);
    }
  }
  walk(0, cells);
  return out;
}

function point(weights: number[], mu: number[], cov: number[][], rf: number, path: number[]): MixPoint {
  const ret = dot(weights, mu);
  const variance = Math.max(dot(weights, multiply(cov, weights)), 0);
  const vol = Math.sqrt(variance);
  const sharpe = vol > 0.05 ? (ret - rf) / vol : 0;
  const sortino = sortinoOf(path, rf / YEAR / 100, ret, rf);
  const maxDrawdown = drawdown(path);
  const calmar = maxDrawdown < -0.05 ? ret / Math.abs(maxDrawdown) : null;
  return {
    ret: round(ret),
    vol: round(vol),
    sharpe: round(sharpe),
    sortino: round(sortino),
    maxDrawdown: round(maxDrawdown),
    calmar: calmar == null ? null : round(calmar),
    weights: weights.map((value) => round(value * 100, 1)),
  };
}

function ratios(weights: number[], returns: number[][]): number[] {
  const days = returns[0]?.length ?? 0;
  const path: number[] = [];
  for (let day = 0; day < days; day += 1) {
    let value = 0;
    for (let asset = 0; asset < weights.length; asset += 1) value += weights[asset] * (returns[asset]?.[day] ?? 0);
    path.push(value);
  }
  return path;
}

function sortinoOf(path: number[], rfDaily: number, ret: number, rf: number): number {
  if (!path.length) return 0;
  const penalty = path.reduce((sum, value) => sum + (value < rfDaily ? (value - rfDaily) ** 2 : 0), 0);
  const downside = Math.sqrt(penalty / path.length) * Math.sqrt(YEAR) * 100;
  return downside > 0.05 ? (ret - rf) / downside : 0;
}

function drawdown(path: number[]): number {
  let peak = 1;
  let wealth = 1;
  let worst = 0;
  for (const value of path) {
    wealth *= 1 + value;
    if (wealth > peak) peak = wealth;
    worst = Math.min(worst, wealth / peak - 1);
  }
  return worst * 100;
}

function covariance(returns: number[][]): number[][] {
  const n = returns.length;
  const days = returns[0]?.length ?? 0;
  const mean = returns.map((row) => avg(row));
  const cov = Array.from({ length: n }, () => Array(n).fill(0));
  const denom = Math.max(days - 1, 1);
  for (let day = 0; day < days; day += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = i; j < n; j += 1) {
        const value = ((returns[i]?.[day] ?? 0) - mean[i]) * ((returns[j]?.[day] ?? 0) - mean[j]);
        cov[i][j] += value;
        if (i !== j) cov[j][i] += value;
      }
    }
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) cov[i][j] /= denom;
  }
  return cov;
}

function correlationFrom(cov: number[][]): number[][] {
  return cov.map((row, i) => row.map((value, j) => {
    const denom = Math.sqrt(cov[i][i] * cov[j][j]);
    return denom > 0 ? round(value / denom, 2) : 0;
  }));
}

function invert(matrix: number[][]): number[][] {
  const n = matrix.length;
  const rows = matrix.map((row, index) => [...row, ...oneHot(n, index)]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    if (Math.abs(divisor) < 1e-12) throw new Error("The covariance matrix could not be inverted.");
    for (let column = 0; column < n * 2; column += 1) rows[col][column] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let column = 0; column < n * 2; column += 1) rows[row][column] -= factor * rows[col][column];
    }
  }
  return rows.map((row) => row.slice(n));
}

function add(left: number[][], right: number[][]): number[][] {
  return left.map((row, i) => row.map((value, j) => value + (right[i]?.[j] ?? 0)));
}

function addVectors(left: number[], right: number[]): number[] {
  return left.map((value, index) => value + (right[index] ?? 0));
}

function multiply(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => dot(row, vector));
}

function dot(left: number[], right: number[]): number {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += left[index] * (right[index] ?? 0);
  return total;
}

function avg(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function oneHot(size: number, index: number): number[] {
  return Array.from({ length: size }, (_, cursor) => (cursor === index ? 1 : 0));
}

function clamp(value: number, floor: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(floor, value));
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
