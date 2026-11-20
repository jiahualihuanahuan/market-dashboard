export function equityGauge(vix: number, advancersPct: number, distFromHigh: number): number {
  const vixScore = clamp(100 - (vix - 12) * 4, 0, 100);
  const breadthScore = clamp(advancersPct, 0, 100);
  const highScore = clamp(100 + distFromHigh * 250, 0, 100);
  return Math.round((vixScore + breadthScore + highScore) / 3);
}

export type PanicLevel = "standby" | "partial" | "full" | "unconfirmed" | "unknown";

export function panicCall(input: {
  vix: number | null;
  declinersPct: number | null;
  partialVix: number;
  fullVix: number;
  partialPct: number;
  breadthPanic: number;
  book?: string;
}): { level: PanicLevel; title: string; detail: string } {
  const { vix, declinersPct, partialVix, fullVix, partialPct, breadthPanic } = input;
  const book = input.book ?? "tracked book";
  if (vix == null) {
    return {
      level: "unknown",
      title: "VIX unavailable",
      detail: "The idle-cash rule needs a VIX close before it can say anything.",
    };
  }
  const confirmed = declinersPct != null && declinersPct >= breadthPanic;
  const breadthText =
    declinersPct == null
      ? "Breadth is missing."
      : `${declinersPct.toFixed(0)}% of the ${book} closed down. The systemic bar is ${breadthPanic}%.`;

  if (vix >= fullVix && confirmed) {
    return {
      level: "full",
      title: "Deploy the rest of idle cash",
      detail: `VIX closed at ${vix.toFixed(1)}, through ${fullVix}. ${breadthText} Safety cash in Treasuries stays put.`,
    };
  }
  if (vix >= partialVix && confirmed) {
    return {
      level: "partial",
      title: `Deploy ${partialPct}% of idle cash`,
      detail: `VIX closed at ${vix.toFixed(1)}, through ${partialVix} and short of ${fullVix}. ${breadthText}`,
    };
  }
  if (vix >= partialVix) {
    return {
      level: "unconfirmed",
      title: "VIX is elevated, breadth is not",
      detail: `VIX closed at ${vix.toFixed(1)}. ${breadthText} The rule waits for both. Idle cash stays idle.`,
    };
  }
  return {
    level: "standby",
    title: "Stand by",
    detail: `VIX closed at ${vix.toFixed(1)}, under the ${partialVix} partial-deploy line. ${breadthText}`,
  };
}

export function zoneRank(
  price: number,
  zone: { low: number; high: number; skipAbove: number },
  high52: number | null,
  low52: number | null,
) {
  let score = 0;
  let status = "Above zone";
  if (price >= zone.skipAbove) {
    status = "Skip";
    score = 0;
  } else if (price < zone.low) {
    status = "Below zone";
    score = 90 + Math.min(30, ((zone.low - price) / zone.low) * 100);
  } else if (price <= zone.high) {
    status = "In zone";
    const span = Math.max(zone.high - zone.low, 0.01);
    score = 80 - ((price - zone.low) / span) * 20;
  } else {
    status = "Above zone";
    const span = Math.max(zone.skipAbove - zone.high, 0.01);
    score = 50 - ((price - zone.high) / span) * 40;
  }
  if (score > 0 && high52 != null && low52 != null && high52 > low52) {
    const pos = (price - low52) / (high52 - low52);
    score += (1 - clamp(pos, 0, 1)) * 10;
  }
  return { score: Math.round(score), status };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
