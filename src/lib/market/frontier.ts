export type FrontierSeries = {
  start: string;
  end: string;
  assets: { symbol: string; label: string }[];
  dates: string[];
  returns: number[][];
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

export type FrontierModel = {
  start: string;
  end: string;
  days: number;
  rf: number;
  assets: MixPoint[];
  labels: string[];
  corr: number[][];
  frontier: MixPoint[];
  maxSharpe: MixPoint;
  calmest: MixPoint;
};

const YEAR = 252;

export function buildFrontier(series: FrontierSeries): FrontierModel {
  const days = series.dates.length;
  const n = series.assets.length;
  const mean = series.returns.map((row) => avg(row));
  const cov = covariance(series.returns);
  const mu = mean.map((value) => value * YEAR * 100);
  const sigma = cov.map((row) => row.map((value) => value * YEAR * 10000));
  const rf = mu[n - 1] ?? 0;
  const assets = series.returns.map((_, index) => score(oneHot(n, index), mu, sigma, rf, series.returns));
  const cloud = simplexGrid(n, 0.02).map((weights) => ({
    weights,
    ret: dot(weights, mu),
    vol: Math.sqrt(Math.max(dot(weights, multiply(sigma, weights)), 0)),
  }));
  cloud.sort((a, b) => a.vol - b.vol || b.ret - a.ret);
  const chosen: typeof cloud = [];
  let bestReturn = -Infinity;
  for (const row of cloud) {
    if (row.ret > bestReturn + 0.04) {
      chosen.push(row);
      bestReturn = row.ret;
    }
  }
  const frontier = thin(chosen, 36).map((row) => score(row.weights, mu, sigma, rf, series.returns));
  const tangency = cloud.reduce((best, row) => {
    const sharpe = row.vol > 0.2 ? (row.ret - rf) / row.vol : -Infinity;
    return sharpe > best.sharpe ? { sharpe, weights: row.weights } : best;
  }, { sharpe: -Infinity, weights: oneHot(n, n - 1) });
  return {
    start: series.start,
    end: series.end,
    days,
    rf: round(rf),
    assets,
    labels: series.assets.map((asset) => asset.label),
    corr: correlation(series.returns),
    frontier,
    maxSharpe: score(tangency.weights, mu, sigma, rf, series.returns),
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

function simplexGrid(size: number, step: number): number[][] {
  const cells = Math.round(1 / step);
  const out: number[][] = [];
  const acc = Array(size).fill(0);
  function walk(slot: number, remaining: number) {
    if (slot === size - 1) {
      acc[slot] = remaining / cells;
      out.push(acc.slice());
      return;
    }
    for (let held = 0; held <= remaining; held += 1) {
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

function correlation(returns: number[][]): number[][] {
  const cov = covariance(returns);
  return cov.map((row, i) =>
    row.map((value, j) => {
      const denom = Math.sqrt(cov[i][i] * cov[j][j]);
      return denom > 0 ? round(value / denom, 2) : 0;
    }),
  );
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

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
