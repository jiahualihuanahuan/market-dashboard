import type { Board } from "@/lib/market/types";
import { Panel } from "@/components/dashboard/bits";

export function Macro({ board }: { board: Board }) {
  const us = board.macro.filter((row) => row.region === "US");
  const ca = board.macro.filter((row) => row.region === "Canada");
  return (
    <div className="grid gap-4">
      <Prints title="United States" rows={us} />
      <Prints title="Canada" rows={ca} />
      <Panel title="On the calendar, not in this table" kicker="No invented consensus">
        <p className="max-w-2xl text-sm text-muted">
          There is no “expected” column. A guessed consensus would be invented. Also watched, but not filled in here: the Fed’s rate decision and its dot plot (each official’s guess of future rates); Canada’s trimmed and median inflation, the share of people working or looking for work, retail sales, the trade balance, and the Bank of Canada rate. “Next” dates that are not the payroll rule are windows, not an official clock.
        </p>
      </Panel>
    </div>
  );
}

function Prints({ title, rows }: { title: string; rows: Board["macro"] }) {
  return (
    <Panel title={title} kicker="Actual is the published number. Prior is the release before it.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 pr-3 font-medium">Release</th>
              <th className="px-2 py-2 font-medium">Actual</th>
              <th className="px-2 py-2 font-medium">Prior</th>
              <th className="px-2 py-2 font-medium">As of</th>
              <th className="px-2 py-2 font-medium">Next</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-line">
                <td className="py-3 pr-3">
                  <span className="block">{row.name}</span>
                  <span className="text-xs text-muted">{row.cadence}</span>
                </td>
                <td className="px-2 py-3 font-mono tabular-nums">{row.actual}</td>
                <td className="px-2 py-3 font-mono tabular-nums text-muted">{row.prior}</td>
                <td className="px-2 py-3 font-mono text-xs text-muted">{row.asOf}</td>
                <td className="px-2 py-3 text-muted">{row.next}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted">Those series did not load.</p> : null}
    </Panel>
  );
}
