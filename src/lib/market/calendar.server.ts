type CalendarEvent = {
  countryCode: string;
  name: string;
  time: string;
  period: string;
  actual: number | null;
  forecast: number | null;
  unit: string;
  multiplier: string;
};

export type Expectation = { expected: string; nextExpected: string };

const MATCHERS: { region: "US" | "Canada"; name: string; event: string }[] = [
  { region: "US", name: "Nonfarm payrolls", event: "Nonfarm Payrolls" },
  { region: "US", name: "Unemployment", event: "Unemployment Rate" },
  { region: "US", name: "CPI", event: "CPI m/m" },
  { region: "US", name: "Core CPI", event: "Core CPI m/m" },
  { region: "US", name: "PPI", event: "PPI m/m" },
  { region: "US", name: "PCE price index", event: "PCE Price Index m/m" },
  { region: "US", name: "Core PCE", event: "Core PCE Price Index m/m" },
  { region: "US", name: "Real GDP", event: "GDP q/q" },
  { region: "US", name: "Retail sales", event: "Retail Sales m/m" },
  { region: "Canada", name: "Unemployment", event: "Unemployment Rate" },
  { region: "Canada", name: "CPI, year over year", event: "CPI y/y" },
];

let cache: { at: number; rows: CalendarEvent[] } | null = null;

export async function loadExpectations(
  prints: { region: string; name: string; asOf: string; actual: string }[],
): Promise<Map<string, Expectation>> {
  const rows = await calendar();
  const out = new Map<string, Expectation>();
  for (const print of prints) {
    const matcher = MATCHERS.find((item) => item.region === print.region && item.name === print.name);
    if (!matcher) continue;
    const country = matcher.region === "US" ? "US" : "CA";
    const hits = rows.filter((row) => row.countryCode === country && row.name === matcher.event);
    const released = hits
      .filter((row) => row.actual != null && row.forecast != null && row.period.slice(0, 7) === print.asOf.slice(0, 7))
      .sort((a, b) => b.time.localeCompare(a.time))[0];
    const matches = released != null && sameFigure(print.actual, released.actual);
    const upcoming = hits
      .filter((row) => row.actual == null && row.forecast != null && row.time > new Date().toISOString())
      .sort((a, b) => a.time.localeCompare(b.time))[0];
    out.set(`${print.region}:${print.name}`, {
      expected: matches && released ? formatForecast(released.forecast, released) : "",
      nextExpected: matches && upcoming ? formatForecast(upcoming.forecast, upcoming) : "",
    });
  }
  return out;
}

function sameFigure(actual: string, calendar: number | null): boolean {
  if (calendar == null) return false;
  const ours = Number(actual.replace(/[^-0-9.]/g, ""));
  if (!Number.isFinite(ours)) return false;
  return Math.abs(ours - calendar) <= 0.2;
}

async function calendar(): Promise<CalendarEvent[]> {
  if (cache && Date.now() - cache.at < 30 * 60 * 1000) return cache.rows;
  const start = Date.now() - 75 * 86400000;
  const end = Date.now() + 40 * 86400000;
  const spans: { from: string; to: string }[] = [];
  for (let cursor = start; cursor < end; cursor += 18 * 86400000) {
    spans.push({
      from: new Date(cursor).toISOString().slice(0, 10),
      to: new Date(Math.min(cursor + 18 * 86400000, end)).toISOString().slice(0, 10),
    });
  }
  const batches = await Promise.all(spans.map((span) => fetchSpan(span.from, span.to)));
  const merged = new Map<string, CalendarEvent>();
  for (const row of batches.flat()) merged.set(`${row.countryCode}|${row.name}|${row.time}`, row);
  const rows = [...merged.values()];
  cache = { at: Date.now(), rows };
  return rows;
}

async function fetchSpan(from: string, to: string): Promise<CalendarEvent[]> {
  const url = `https://biquote.io/api/calendar?countries=US,CA&from=${from}&to=${to}`;
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return [];
  const json = (await response.json()) as Array<Record<string, unknown>>;
  return json.map((row) => ({
    countryCode: String(row.countryCode ?? ""),
    name: String(row.name ?? ""),
    time: String(row.time ?? ""),
    period: String(row.period ?? ""),
    actual: numberOrNull(row.actual),
    forecast: numberOrNull(row.forecast),
    unit: String(row.unit ?? ""),
    multiplier: String(row.multiplier ?? ""),
  }));
}

function formatForecast(value: number | null, event: CalendarEvent): string {
  if (value == null) return "";
  const change = /m\/m|q\/q|employment change|payroll/i.test(event.name);
  const digits = Number.isInteger(value) ? 0 : 1;
  const body = value.toFixed(digits);
  if (event.multiplier === "thousands" || /payroll|employment change/i.test(event.name)) {
    return `${value > 0 ? "+" : ""}${Math.round(value)}k`;
  }
  if (event.unit === "percent" || /rate|cpi|pce|ppi|gdp|retail/i.test(event.name)) {
    return change ? `${value > 0 ? "+" : ""}${body}%` : `${body}%`;
  }
  return body;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
