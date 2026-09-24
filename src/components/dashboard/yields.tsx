import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Board, Curve } from "@/lib/market/types";
import { fmtBp } from "@/lib/market/format";
import { Panel, tooltipStyle } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "now", stroke: "var(--color-fg)", width: 2.4 },
  { id: "w1", stroke: "var(--color-muted)", width: 1.4 },
  { id: "m1", stroke: "var(--color-subtle)", width: 1.4 },
  { id: "y1", stroke: "var(--color-up)", width: 1.4 },
  { id: "y2000", stroke: "var(--color-warn)", width: 1.2 },
  { id: "y2007", stroke: "var(--color-down)", width: 1.2 },
  { id: "y2019", stroke: "var(--color-accent)", width: 1.2 },
];

export function Yields({ board }: { board: Board }) {
  const [on, setOn] = useState<Record<string, boolean>>({
    now: true,
    w1: true,
    m1: false,
    y1: true,
    y2000: false,
    y2007: false,
    y2019: true,
  });
  const [month, setMonth] = useState("");
  const selected = board.curves.filter((curve) => on[curve.id]);
  const custom = board.months.find((curve) => curve.id === month);
  const rows = rowsFor(custom ? [...selected, custom] : selected);
  const inverted = (board.t10y2y ?? 0) < 0 || (board.t10y3m ?? 0) < 0;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Callout label="10y minus 2y" value={fmtBp(board.t10y2y)} hot={inverted} />
        <Callout label="10y minus 3m" value={fmtBp(board.t10y3m)} hot={(board.t10y3m ?? 0) < 0} />
        <Callout label="10y real" value={board.real10 == null ? "—" : `${board.real10.toFixed(2)}%`} hot={false} />
      </div>
      <Panel
        title="US Treasury curve"
        kicker="Fed funds through the 30-year. FRED, last print before each date."
        action={
          <label className="text-xs text-muted">
            Custom month
            <select
              className="ml-2 h-11 rounded-md border border-line bg-bg px-2 text-sm text-fg"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              <option value="">None</option>
              {[...board.months].reverse().map((curve) => (
                <option key={curve.id} value={curve.id}>
                  {curve.id}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {board.curves.map((curve) => (
            <button
              key={curve.id}
              type="button"
              onClick={() => setOn((state) => ({ ...state, [curve.id]: !state[curve.id] }))}
              className={cn(
                "h-11 rounded-full border px-3 text-sm",
                on[curve.id] ? "border-fg bg-elevated text-fg" : "border-line text-muted",
              )}
            >
              {curve.label}
            </button>
          ))}
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--color-subtle)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--color-subtle)", fontSize: 11 }} width={40} unit="%" domain={["auto", "auto"]} />
              <Tooltip {...tooltipStyle} />
              {selected.map((curve) => {
                const style = PRESETS.find((preset) => preset.id === curve.id);
                return (
                  <Line
                    key={curve.id}
                    dataKey={curve.id}
                    name={curve.label}
                    stroke={style?.stroke ?? "var(--color-fg)"}
                    strokeWidth={style?.width ?? 1.6}
                    strokeDasharray={curve.id === "now" ? undefined : "5 4"}
                    dot={false}
                    connectNulls
                  />
                );
              })}
              {custom ? (
                <Line dataKey={custom.id} name={custom.label} stroke="var(--color-accent)" strokeDasharray="4 4" dot={false} connectNulls />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-sm text-muted">
          An inversion of 10s–2s or 10s–3m has historically led recessions by roughly 12 to 18 months. It is a warning, not a date. Anchors mark the March 2000 top, the June 2007 top, and the August 2019 inversion trough.
        </p>
      </Panel>
      <Panel title="Curve and credit" kicker="Month-end, since 2018">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={board.spreadPath}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="d" tick={{ fill: "var(--color-subtle)", fontSize: 11 }} minTickGap={40} />
              <YAxis tick={{ fill: "var(--color-subtle)", fontSize: 11 }} width={40} />
              <Tooltip {...tooltipStyle} />
              <Line dataKey="curve" name="10y–2y" stroke="var(--color-fg)" dot={false} strokeWidth={2} />
              <Line dataKey="hy" name="HY OAS" stroke="var(--color-down)" dot={false} />
              <Line dataKey="real" name="10y real" stroke="var(--color-up)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}

function Callout({ label, value, hot }: { label: string; value: string; hot: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl tabular-nums", hot ? "text-down" : "text-fg")}>{value}</p>
    </div>
  );
}

function rowsFor(curves: Curve[]) {
  const labels = ["FF", "1M", "3M", "6M", "1Y", "2Y", "5Y", "7Y", "10Y", "20Y", "30Y"];
  return labels.map((label) => {
    const row: Record<string, string | number | null> = { label };
    for (const curve of curves) {
      row[curve.id] = curve.points.find((point) => point.label === label)?.value ?? null;
    }
    return row;
  });
}
