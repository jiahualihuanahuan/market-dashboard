/** Pure helpers for the shared FRED cache (kept free of I/O so they can be unit-tested). */

export type Obs = { date: string; value: number };

export type FredEntry = {
  /** Earliest start date this entry covers ("" = full history). */
  from: string;
  /** When the series was last checked with FRED. */
  checkedAt: number;
  /** When the whole requested history was last downloaded (revisions are re-read then). */
  fullAt: number;
  obs: Obs[];
};

export const FRED_TTL_MS = 12 * 60 * 60 * 1000;
export const FRED_FULL_MS = 7 * 24 * 60 * 60 * 1000;
/** Re-read this many days before the last stored point on an incremental update, to pick up revisions. */
export const FRED_OVERLAP_DAYS = 400;

export function parseFredCsv(text: string): Obs[] {
  const lines = text.trim().split(/\r?\n/);
  const out: Obs[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const [date, raw] = lines[i].trim().split(",");
    if (!date || !raw || raw === ".") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out.push({ date, value });
  }
  return out;
}

/** True when the cached entry already covers history starting at `start` ("" = full history). */
export function covers(entry: FredEntry | null | undefined, start: string): boolean {
  if (!entry) return false;
  if (entry.from === "") return true;
  return start !== "" && entry.from <= start;
}

export type FredPlan = { kind: "hit" } | { kind: "full"; from: string } | { kind: "tail"; from: string; cosd: string };

/** Decide whether to serve the cache, re-download the full history, or fetch only the recent tail. */
export function planFred(entry: FredEntry | null | undefined, start: string, now: number, fresh = false, ttlMs = FRED_TTL_MS): FredPlan {
  if (!entry || !covers(entry, start) || !entry.obs.length) {
    // Widen to the earliest start anyone asked for, so one copy serves every caller.
    const from = !entry || start === "" || entry.from === "" ? (entry && entry.from === "" ? "" : start) : entry.from < start ? entry.from : start;
    return { kind: "full", from };
  }
  if (!fresh && now - entry.checkedAt < ttlMs) return { kind: "hit" };
  if (now - entry.fullAt >= FRED_FULL_MS) return { kind: "full", from: entry.from };
  const last = entry.obs[entry.obs.length - 1].date;
  let cosd = shiftDays(last, -FRED_OVERLAP_DAYS);
  if (entry.from !== "" && cosd < entry.from) cosd = entry.from;
  return { kind: "tail", from: entry.from, cosd };
}

/** Replace everything from the first date of `tail` onward with `tail` (FRED revisions win). */
export function mergeTail(base: Obs[], tail: Obs[]): Obs[] {
  if (!tail.length) return base;
  const first = tail[0].date;
  const keep = base.filter((row) => row.date < first);
  return keep.concat(tail);
}

export function sliceFrom(obs: Obs[], start: string): Obs[] {
  if (!start) return obs;
  let lo = 0;
  let hi = obs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (obs[mid].date < start) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? obs : obs.slice(lo);
}

export function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
