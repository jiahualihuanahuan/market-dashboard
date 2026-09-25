/** CME FedWatch day-count method on 30-day Fed Funds futures. Pure, no I/O. */

export type FedOutcome = {
  low: number;
  high: number;
  probability: number;
  steps: number;
};

export type FedMeeting = {
  date: string;
  contract: string;
  outcomes: FedOutcome[];
};

export type FedWatch = {
  asOf: string;
  source: "cme-settlement" | "yahoo-last";
  effr: number;
  effrAsOf: string;
  targetLow: number;
  targetHigh: number;
  meetings: FedMeeting[];
};

export type Settlement = { month: string; settle: number };

const STEP = 0.25;
const MONTHS = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const CODES: Record<number, string> = {
  1: "F", 2: "G", 3: "H", 4: "J", 5: "K", 6: "M",
  7: "N", 8: "Q", 9: "U", 10: "V", 11: "X", 12: "Z",
};

/** Announcement dates. The decision day itself still counts as the old rate. */
export const FOMC_MEETINGS = [
  "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08",
  "2028-01-26",
];

const HORIZON = FOMC_MEETINGS[FOMC_MEETINGS.length - 1];

export function upcomingMeetings(fromIso: string, count: number): string[] {
  return FOMC_MEETINGS.filter((day) => day >= fromIso).slice(0, count);
}

export function contractCode(iso: string): string {
  const month = Number(iso.slice(5, 7));
  return `ZQ${CODES[month]}${iso.slice(3, 4)}`;
}

function monthKey(year: number, month: number): string {
  return `${MONTHS[month]} ${String(year % 100).padStart(2, "0")}`;
}

function parts(iso: string): [number, number] {
  return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))];
}

function prev(year: number, month: number): [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1];
}

function next(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function idOf(year: number, month: number): string {
  return `${year}-${month}`;
}

/**
 * Bootstraps each meeting from months with no FOMC date, then convolves
 * the 25 bp steps. Same continuity rule as the CME FedWatch tool:
 * a meeting's pre-rate is the previous meeting's post-rate.
 */
export function fedWatchMeetings(
  settlements: Settlement[],
  meetings: string[],
  targetLow: number,
  targetHigh: number,
): FedMeeting[] {
  if (!meetings.length) return [];
  const averages = new Map(settlements.map((row) => [row.month, 100 - row.settle]));
  const meetingMonth = new Map<string, string>();
  for (const day of FOMC_MEETINGS) meetingMonth.set(idOf(...parts(day)), day);
  for (const day of meetings) meetingMonth.set(idOf(...parts(day)), day);

  const months: [number, number][] = [];
  let cursor = prev(...parts(meetings[0]));
  const last = next(...parts(meetings[meetings.length - 1]));
  while (cursor[0] < last[0] || (cursor[0] === last[0] && cursor[1] <= last[1])) {
    months.push(cursor);
    cursor = next(...cursor);
  }
  const horizon = parts(HORIZON);
  const pastHorizon = (year: number, month: number) =>
    year > horizon[0] || (year === horizon[0] && month > horizon[1]);

  const start = new Map<string, number>();
  const end = new Map<string, number>();
  const isMeeting = (year: number, month: number) => meetingMonth.has(idOf(year, month));

  for (const [year, month] of months) {
    if (isMeeting(year, month) || pastHorizon(year, month)) continue;
    const average = averages.get(monthKey(year, month));
    if (average == null) continue;
    const before = prev(year, month);
    const after = next(year, month);
    if (isMeeting(...before)) end.set(idOf(...before), end.get(idOf(...before)) ?? average);
    if (isMeeting(...after)) start.set(idOf(...after), start.get(idOf(...after)) ?? average);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [year, month] of [...months].reverse()) {
      const id = idOf(year, month);
      if (!isMeeting(year, month) || start.has(id)) continue;
      const average = averages.get(monthKey(year, month));
      const meeting = meetingMonth.get(id);
      if (average == null || !meeting) continue;
      const length = daysInMonth(year, month);
      const beforeDays = Number(meeting.slice(8, 10));
      const afterDays = length - beforeDays;
      if (afterDays === 0) start.set(id, average);
      else if (end.has(id)) start.set(id, (length * average - afterDays * (end.get(id) as number)) / beforeDays);
      else continue;
      const before = prev(year, month);
      if (isMeeting(...before)) end.set(idOf(...before), end.get(idOf(...before)) ?? (start.get(id) as number));
      changed = true;
    }
    for (const [year, month] of months) {
      const id = idOf(year, month);
      if (!isMeeting(year, month) || end.has(id) || !start.has(id)) continue;
      const average = averages.get(monthKey(year, month));
      const meeting = meetingMonth.get(id);
      if (average == null || !meeting) continue;
      const length = daysInMonth(year, month);
      const beforeDays = Number(meeting.slice(8, 10));
      const afterDays = length - beforeDays;
      if (afterDays === 0) continue;
      end.set(id, (length * average - beforeDays * (start.get(id) as number)) / afterDays);
      const after = next(year, month);
      if (isMeeting(...after)) start.set(idOf(...after), start.get(idOf(...after)) ?? (end.get(id) as number));
      changed = true;
    }
  }

  const lower = Math.round(targetLow * 100);
  const upper = Math.round(targetHigh * 100);
  let cumulative = new Map<number, number>([[0, 1]]);
  const results: FedMeeting[] = [];

  for (const meeting of meetings) {
    const id = idOf(...parts(meeting));
    const startRate = start.get(id);
    const endRate = end.get(id);
    if (startRate == null || endRate == null) break;
    const moves = (endRate - startRate) / STEP;
    const whole = Math.floor(moves);
    const fraction = moves - whole;
    const step = new Map<number, number>([[whole, 1 - fraction], [whole + 1, fraction]]);
    const combined = new Map<number, number>();
    for (const [soFar, probability] of cumulative) {
      for (const [move, weight] of step) {
        const nextMoves = soFar + move;
        combined.set(nextMoves, (combined.get(nextMoves) ?? 0) + probability * weight);
      }
    }
    cumulative = combined;
    const outcomes = [...cumulative.entries()]
      .map(([steps, probability]) => ({
        low: (lower + 25 * steps) / 100,
        high: (upper + 25 * steps) / 100,
        probability: Math.round(probability * 1000) / 10,
        steps,
      }))
      .filter((outcome) => outcome.probability > 0)
      .sort((a, b) => a.steps - b.steps);
    results.push({ date: meeting, contract: contractCode(meeting), outcomes });
  }
  return results;
}
