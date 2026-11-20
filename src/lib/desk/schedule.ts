/** Refresh cadence, per source. Every value can be overridden with an env var (see docker/env.example). */
export type Schedule = {
  /** Live price patch during US regular hours, minutes (PRICE_REFRESH_MIN, default 15). */
  priceMs: number;
  /** Daily bars + distributions tail refresh, hours (BARS_REFRESH_HOURS, default 24; also refreshed once after each close). */
  barsMs: number;
  /** Full 5-year re-download to pick up splits/corrections, days (BARS_FULL_DAYS, default 7). */
  fullMs: number;
  /** FRED series, hours (FRED_REFRESH_HOURS, default 12; daily series publish once a day, monthly ones monthly). */
  fredMs: number;
};

function num(env: Record<string, string | undefined>, key: string, fallback: number, min: number): number {
  const value = Number(env[key]);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

export function schedule(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): Schedule {
  return {
    priceMs: num(env, "PRICE_REFRESH_MIN", 15, 1) * 60_000,
    barsMs: num(env, "BARS_REFRESH_HOURS", 24, 1) * 3_600_000,
    fullMs: num(env, "BARS_FULL_DAYS", 7, 1) * 86_400_000,
    fredMs: num(env, "FRED_REFRESH_HOURS", 12, 0.5) * 3_600_000,
  };
}

const ET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** True Mon–Fri 09:30–16:15 ET (a little past the close so the closing print lands). Holidays are not modelled. */
export function usMarketOpen(now: number): boolean {
  const parts = Object.fromEntries(ET.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60 + 15;
}

/** Epoch ms of the most recent 16:15 ET on a weekday at or before `now`. */
export function lastCloseAt(now: number): number {
  for (let back = 0; back < 8 * 24 * 4; back++) {
    const t = now - back * 15 * 60_000;
    const parts = Object.fromEntries(ET.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    if (parts.weekday === "Sat" || parts.weekday === "Sun") continue;
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    if (minutes >= 16 * 60 + 15) return t - (minutes - (16 * 60 + 15)) * 60_000 - (t % 60_000);
  }
  return now - 86_400_000;
}

/** Live prices are due every `priceMs` while open; once after each close otherwise. */
export function priceDue(liveAt: number, now: number, s: Schedule): boolean {
  if (usMarketOpen(now)) return now - liveAt >= s.priceMs;
  return liveAt < lastCloseAt(now);
}

/** Bars/distributions are due daily, and once after each close (so EOD bars and new ex-dates land). */
export function barsDue(tailAt: number, now: number, s: Schedule): boolean {
  if (now - tailAt >= s.barsMs) return true;
  return !usMarketOpen(now) && tailAt < lastCloseAt(now);
}
