import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Board, MacroChart } from "@/lib/market/types";
import { Panel, tooltipStyle } from "@/components/dashboard/bits";

const NOTES: Record<string, string> = {
  pce: "Prices households pay, including food and energy, compared with a year earlier. This is the price index, not how much they spent. The dashed line is 2%, the Fed’s goal.",
  core: "The same price index without food and energy. This is the inflation gauge the Fed watches most closely. The dashed line is its 2% goal.",
  trim1: "The Dallas Fed drops the biggest and smallest price moves each month, then states that month as if it lasted a year. One month is jumpy.",
  trim6: "The same trimmed measure, using the last six months and stretching that pace to a year. Steadier than the one-month rate.",
  trim12: "The trimmed measure over the past year. This is the change that actually happened, not a pace stretched to twelve months.",
  income: "What households earned, compared with a year earlier. Wages, benefits, interest, and government payments are included.",
  spending: "What households spent on goods and services, compared with a year earlier. This is the dollar amount spent, not the price index.",
};

const HAS_TARGET = new Set(["pce", "core", "trim1", "trim6", "trim12"]);

export function Macro({ board }: { board: Board }) {
  const us = board.macro.filter((row) => row.region === "US");
  const ca = board.macro.filter((row) => row.region === "Canada");
  return (
    <div className="grid min-w-0 gap-4">
      <History charts={board.macroCharts ?? []} />
      <Prints title="United States" rows={us} />
      <Prints title="Canada" rows={ca} />
      <Panel title="What “expected” means" kicker="A forecast, not the official number">
        <p className="max-w-2xl text-sm text-muted">
          Expected is the consensus: the average guess analysts published before that release. Above expected means the official number came in hotter than that guess. Below expected means it was cooler. In line means they matched. A blank cell means the calendar had no forecast. This desk does not fill one in. Next consensus is the guess for the coming release, which is a different vintage from the number already printed. The Fed’s dot plot, Canada’s trimmed and median inflation, and rate decisions stay off this table when the calendar has no forecast.
        </p>
      </Panel>
    </div>
  );
}

function History({ charts }: { charts: MacroChart[] }) {
  if (!charts.length) return <p className="text-sm text-muted">The PCE, income, and spending history did not load.</p>;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {charts.map((chart) => (
        <Panel key={chart.id} className="min-w-0" title={chart.label} kicker={`${chart.asOf} · ${chart.value.toFixed(1)}%`}>
          <p className="mb-3 text-sm text-muted">{NOTES[chart.id]}</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: "var(--color-subtle)", fontSize: 11 }} minTickGap={36} />
                <YAxis tick={{ fill: "var(--color-subtle)", fontSize: 11 }} width={44} unit="%" domain={["auto", "auto"]} />
                <Tooltip {...tooltipStyle} formatter={(value) => [`${Number(value).toFixed(2)}%`, chart.label]} />
                {HAS_TARGET.has(chart.id) ? <ReferenceLine y={2} stroke="var(--color-muted)" strokeDasharray="4 4" /> : null}
                <Line dataKey="v" name={chart.label} stroke="var(--color-fg)" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function Prints({ title, rows }: { title: string; rows: Board["macro"] }) {
  return (
    <Panel title={title} kicker="Actual is the published number. Expected is the pre-release consensus. Prior is the release before it.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 pr-3 font-medium">Release</th>
              <th className="px-2 py-2 font-medium">Actual</th>
              <th className="px-2 py-2 font-medium">Expected</th>
              <th className="px-2 py-2 font-medium">Prior</th>
              <th className="px-2 py-2 font-medium">As of</th>
              <th className="px-2 py-2 font-medium">Next</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const verdict = versus(row.actual, row.expected);
              return (
                <tr key={row.name} className="border-t border-line">
                  <td className="py-3 pr-3">
                    <span className="block">{row.name}</span>
                    <span className="text-xs text-muted">{row.cadence}</span>
                  </td>
                  <td className="px-2 py-3 font-mono tabular-nums">{row.actual}</td>
                  <td className="px-2 py-3">
                    <span className="block font-mono tabular-nums">{row.expected || "—"}</span>
                    {verdict ? <span className="text-xs text-muted">{verdict}</span> : null}
                  </td>
                  <td className="px-2 py-3 font-mono tabular-nums text-muted">{row.prior}</td>
                  <td className="px-2 py-3 font-mono text-xs text-muted">{row.asOf}</td>
                  <td className="px-2 py-3 text-muted">
                    <span className="block">{row.next}</span>
                    {row.nextExpected ? <span className="text-xs">Next consensus {row.nextExpected}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted">Those series did not load.</p> : null}
    </Panel>
  );
}

function versus(actual: string, expected: string): string | null {
  if (!expected || expected === "—") return null;
  const left = Number(actual.replace(/[^-0-9.]/g, ""));
  const right = Number(expected.replace(/[^-0-9.]/g, ""));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const gap = Math.abs(left - right);
  if (gap < 0.05) return "In line";
  return left > right ? "Above expected" : "Below expected";
}
