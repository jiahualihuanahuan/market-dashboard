export type PanicPoint = { d: string; score: number; vix: number; hy: number };

export function vixPanic(vix: number): number {
  return clamp(((vix - 14) / 26) * 100, 0, 100);
}

export function breadthPanic(downPct: number): number {
  return clamp(((downPct - 40) / 50) * 100, 0, 100);
}

export function fearPanic(cnn: number): number {
  return clamp(100 - cnn, 0, 100);
}

export function drawdownPanic(price: number, high: number): number {
  if (!(high > 0) || !(price > 0)) return 0;
  const drop = (1 - price / high) * 100;
  return clamp((drop / 20) * 100, 0, 100);
}

export function percentile(value: number, sample: number[]): number {
  if (!sample.length) return 50;
  let below = 0;
  for (const item of sample) if (item <= value) below += 1;
  return (below / sample.length) * 100;
}

export function buildPanicHistory(vix: { d: string; v: number }[], hy: { d: string; v: number }[]): PanicPoint[] {
  const hySorted = [...hy].filter((row) => row.v > 0).sort((a, b) => a.d.localeCompare(b.d));
  const vixSorted = [...vix].filter((row) => row.v > 0).sort((a, b) => a.d.localeCompare(b.d));
  const aligned: { d: string; vix: number; hy: number }[] = [];
  let index = 0;
  let last: number | null = null;
  for (const row of vixSorted) {
    while (index < hySorted.length && hySorted[index].d <= row.d) {
      last = hySorted[index].v;
      index += 1;
    }
    if (last == null) continue;
    aligned.push({ d: row.d, vix: row.v, hy: last });
  }
  return aligned.map((row, i) => {
    const sample = aligned.slice(Math.max(0, i - 251), i + 1).map((item) => item.hy);
    const score = Math.round((vixPanic(row.vix) + percentile(row.hy, sample)) / 2);
    return { d: row.d, vix: row.vix, hy: row.hy, score };
  });
}

export function panicWords(score: number): { label: string; plain: string } {
  if (score >= 75) {
    return {
      label: "Panic",
      plain: "Insurance, credit, and the tape are stressed together. Prices are more likely being set by people who have to sell, so a calm estimate of value is least reliable.",
    };
  }
  if (score >= 55) {
    return {
      label: "Stressed",
      plain: "Several groups are paying up for safety. Prices can drift from a careful estimate of value, but this is not a full scramble.",
    };
  }
  if (score >= 30) {
    return {
      label: "Uneasy",
      plain: "One or two gauges are hot. That is often a story about a few names, not a market that has stopped working.",
    };
  }
  return {
    label: "Calm",
    plain: "Selling does not look forced. Prices are mostly being set by people who can wait.",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
